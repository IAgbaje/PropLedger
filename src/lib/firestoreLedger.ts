import type { User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import type { RentalAppState } from '../types/rental';
import {
  chunkItems,
  computeSubcollectionDiff,
  hasWorkspaceRootChanged,
  isValidFirestoreId,
  sanitizeEntityForFirestore,
  sanitizePropertyProfile,
  sanitizeSystemSettings,
  stripSyncMetadata,
  stripUndefined,
  truncateString,
  WORKSPACE_SUBCOLLECTIONS,
  type WorkspaceSubcollection,
} from '../utils/firestoreSync';
import { hydrateRentalState } from '../utils/stateHydration';
import { db } from './firebase';
import { handleFirestoreError, OperationType } from './firestoreError';

const BOOTSTRAPPED_ADMIN_EMAIL = 'theibraheemagbaje@gmail.com';

interface BatchOp {
  type: 'set' | 'delete';
  subcollection: WorkspaceSubcollection;
  id: string;
  data?: DocumentData;
}

async function commitBatchOperations(uid: string, ops: BatchOp[]): Promise<void> {
  if (ops.length === 0) return;
  const batches = chunkItems(ops, 400);
  for (const chunk of batches) {
    const batch = writeBatch(db);
    for (const op of chunk) {
      if (!isValidFirestoreId(op.id)) continue;
      const ref = doc(db, 'workspaces', uid, op.subcollection, op.id);
      if (op.type === 'delete') {
        batch.delete(ref);
      } else if (op.data) {
        batch.set(ref, op.data);
      }
    }
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `workspaces/${uid}`);
    }
  }
}

export async function ensureUserAndWorkspace(
  user: User,
  initialState: RentalAppState
): Promise<{ isNewWorkspace: boolean }> {
  if (!user.emailVerified || !isValidFirestoreId(user.uid)) {
    return { isNewWorkspace: false };
  }

  const uid = user.uid;
  const userPath = `users/${uid}`;
  const userRef = doc(db, 'users', uid);

  let userSnap;
  try {
    userSnap = await getDoc(userRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userPath);
  }

  const displayName =
    truncateString(user.displayName || user.email?.split('@')[0] || 'Property Manager', 120) ||
    'Property Manager';
  const photoUrl = user.photoURL ? truncateString(user.photoURL, 500) : undefined;

  if (!userSnap.exists()) {
    try {
      await setDoc(
        userRef,
        stripUndefined({
          uid,
          displayName,
          photoUrl,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, userPath);
    }
  } else {
    const existingData = userSnap.data();
    if (
      existingData.displayName !== displayName ||
      (photoUrl !== undefined && existingData.photoUrl !== photoUrl)
    ) {
      try {
        await updateDoc(
          userRef,
          stripUndefined({
            displayName,
            photoUrl,
            updatedAt: serverTimestamp(),
          })
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, userPath);
      }
    }
  }

  const privatePath = `users/${uid}/private/info`;
  const privateRef = doc(db, 'users', uid, 'private', 'info');
  let privateSnap;
  try {
    privateSnap = await getDoc(privateRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, privatePath);
  }

  const email = truncateString(user.email || 'manager@agbasaffys.ng', 254);
  const role = user.email === BOOTSTRAPPED_ADMIN_EMAIL ? 'admin' : 'manager';

  if (!privateSnap.exists()) {
    try {
      await setDoc(privateRef, {
        uid,
        email,
        role,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, privatePath);
    }
  } else {
    const existingPrivate = privateSnap.data();
    if (existingPrivate.email !== email) {
      try {
        await updateDoc(privateRef, {
          email,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, privatePath);
      }
    }
  }

  const workspacePath = `workspaces/${uid}`;
  const workspaceRef = doc(db, 'workspaces', uid);
  let workspaceSnap;
  try {
    workspaceSnap = await getDoc(workspaceRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, workspacePath);
  }

  if (!workspaceSnap.exists()) {
    try {
      await setDoc(workspaceRef, {
        ownerUid: uid,
        referenceDate: truncateString(initialState.referenceDate, 20),
        property: sanitizePropertyProfile(initialState.property),
        settings: sanitizeSystemSettings(initialState.settings),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, workspacePath);
    }
    return { isNewWorkspace: true };
  }

  return { isNewWorkspace: false };
}

function compareByNaturalId(a: { id?: string }, b: { id?: string }): number {
  const idA = a.id || '';
  const idB = b.id || '';
  const matchA = idA.match(/^([a-z-]+)-(\d+)$/i);
  const matchB = idB.match(/^([a-z-]+)-(\d+)$/i);
  if (matchA && matchB && matchA[1] === matchB[1]) {
    return Number(matchA[2]) - Number(matchB[2]);
  }
  return idA.localeCompare(idB);
}

export async function loadWorkspaceFromFirestore(uid: string): Promise<RentalAppState | null> {
  if (!isValidFirestoreId(uid)) return null;

  const workspacePath = `workspaces/${uid}`;
  const workspaceRef = doc(db, 'workspaces', uid);
  let workspaceSnap;
  try {
    workspaceSnap = await getDoc(workspaceRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, workspacePath);
  }

  if (!workspaceSnap.exists()) return null;

  const rootData = workspaceSnap.data();
  const subResults = await Promise.all(
    WORKSPACE_SUBCOLLECTIONS.map(async (subName) => {
      const subPath = `workspaces/${uid}/${subName}`;
      try {
        const snap = await getDocs(collection(db, 'workspaces', uid, subName));
        const rows = snap.docs.map((d) => stripSyncMetadata(d.data()));
        return [subName, rows] as const;
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, subPath);
      }
    })
  );

  const subMap: Record<string, Record<string, unknown>[]> = {};
  for (const [subName, rows] of subResults) {
    subMap[subName] = rows;
  }

  // Sort collections consistently for display
  subMap.units?.sort(compareByNaturalId);
  subMap.tenants?.sort(compareByNaturalId);
  subMap.agreements?.sort(compareByNaturalId);
  subMap.obligations?.sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')));
  subMap.payments?.sort((a, b) =>
    String(b.dateRecorded || b.dateReceived || '').localeCompare(
      String(a.dateRecorded || a.dateReceived || '')
    )
  );
  subMap.receiptRequests?.sort((a, b) =>
    String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  );
  subMap.notifications?.sort((a, b) =>
    String(b.scheduledAt || '').localeCompare(String(a.scheduledAt || ''))
  );
  subMap.smsTemplates?.sort((a, b) =>
    String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
  );
  subMap.commitments?.sort((a, b) =>
    String(b.dateRecorded || '').localeCompare(String(a.dateRecorded || ''))
  );
  subMap.commissions?.sort((a, b) =>
    String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  );
  subMap.commissionPayouts?.sort((a, b) =>
    String(b.payoutDate || '').localeCompare(String(a.payoutDate || ''))
  );
  subMap.expenses?.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  subMap.maintenance?.sort((a, b) =>
    String(b.dateReported || '').localeCompare(String(a.dateReported || ''))
  );
  subMap.contacts?.sort(compareByNaturalId);
  subMap.auditLogs?.sort((a, b) =>
    String(b.timestamp || '').localeCompare(String(a.timestamp || ''))
  );

  return hydrateRentalState({
    referenceDate: typeof rootData.referenceDate === 'string' ? rootData.referenceDate : undefined,
    property: rootData.property as RentalAppState['property'] | undefined,
    settings: rootData.settings as RentalAppState['settings'] | undefined,
    units: subMap.units as unknown as RentalAppState['units'],
    tenants: subMap.tenants as unknown as RentalAppState['tenants'],
    agreements: subMap.agreements as unknown as RentalAppState['agreements'],
    obligations: subMap.obligations as unknown as RentalAppState['obligations'],
    payments: subMap.payments as unknown as RentalAppState['payments'],
    receiptRequests: subMap.receiptRequests as unknown as RentalAppState['receiptRequests'],
    notifications: subMap.notifications as unknown as RentalAppState['notifications'],
    smsTemplates: subMap.smsTemplates as unknown as RentalAppState['smsTemplates'],
    commitments: subMap.commitments as unknown as RentalAppState['commitments'],
    commissions: subMap.commissions as unknown as RentalAppState['commissions'],
    commissionPayouts: subMap.commissionPayouts as unknown as RentalAppState['commissionPayouts'],
    expenses: subMap.expenses as unknown as RentalAppState['expenses'],
    maintenance: subMap.maintenance as unknown as RentalAppState['maintenance'],
    contacts: subMap.contacts as unknown as RentalAppState['contacts'],
    auditLogs: subMap.auditLogs as unknown as RentalAppState['auditLogs'],
  });
}

export async function seedWorkspaceSubcollections(
  uid: string,
  state: RentalAppState
): Promise<void> {
  if (!isValidFirestoreId(uid)) return;
  const marker = serverTimestamp();
  const ops: BatchOp[] = [];

  for (const subName of WORKSPACE_SUBCOLLECTIONS) {
    const items = state[subName] as unknown as Array<Record<string, unknown> & { id: string }>;
    for (const item of items) {
      if (!isValidFirestoreId(item.id)) continue;
      ops.push({
        type: 'set',
        subcollection: subName,
        id: item.id,
        data: sanitizeEntityForFirestore(subName, item, uid, marker),
      });
    }
  }

  await commitBatchOperations(uid, ops);
}

export async function syncWorkspaceDeltaToFirestore(
  uid: string,
  prevState: RentalAppState,
  nextState: RentalAppState
): Promise<void> {
  if (!isValidFirestoreId(uid)) return;

  if (hasWorkspaceRootChanged(prevState, nextState)) {
    const workspacePath = `workspaces/${uid}`;
    try {
      await updateDoc(doc(db, 'workspaces', uid), {
        referenceDate: truncateString(nextState.referenceDate, 20),
        property: sanitizePropertyProfile(nextState.property),
        settings: sanitizeSystemSettings(nextState.settings),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, workspacePath);
    }
  }

  const marker = serverTimestamp();
  const ops: BatchOp[] = [];

  for (const subName of WORKSPACE_SUBCOLLECTIONS) {
    const prevList = prevState[subName] as unknown as Array<
      Record<string, unknown> & { id: string }
    >;
    const nextList = nextState[subName] as unknown as Array<
      Record<string, unknown> & { id: string }
    >;
    const { upserts, deletes } = computeSubcollectionDiff(prevList, nextList);

    for (const delId of deletes) {
      if (!isValidFirestoreId(delId)) continue;
      ops.push({
        type: 'delete',
        subcollection: subName,
        id: delId,
      });
    }

    for (const item of upserts) {
      if (!isValidFirestoreId(item.id)) continue;
      ops.push({
        type: 'set',
        subcollection: subName,
        id: item.id,
        data: sanitizeEntityForFirestore(subName, item, uid, marker),
      });
    }
  }

  await commitBatchOperations(uid, ops);
}
