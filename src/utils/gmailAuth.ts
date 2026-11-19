import { getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.send'];
export const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
];
export const WORKSPACE_SCOPES = [...GMAIL_SCOPES, ...CALENDAR_SCOPES];

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
for (const scope of WORKSPACE_SCOPES) {
  provider.addScope(scope);
}
provider.setCustomParameters({ prompt: 'select_account' });

// Strict in-memory token cache (never stored in localStorage or sessionStorage)
let isSigningIn = false;
let cachedAccessToken: string | null = null;

export function initGmailAuth(
  onAuthChange: (user: User | null, token: string | null) => void
): () => void {
  return onAuthStateChanged(auth, (user) => {
    if (user && cachedAccessToken) {
      onAuthChange(user, cachedAccessToken);
    } else if (!user) {
      cachedAccessToken = null;
      onAuthChange(null, null);
    } else if (!isSigningIn) {
      // User session exists in Firebase SDK, but OAuth access token is in-memory only
      // Wait for explicit interactive Sign-In to obtain a fresh access token when needed
      onAuthChange(user, cachedAccessToken);
    }
  });
}

export async function gmailSignIn(): Promise<{ user: User; accessToken: string }> {
  isSigningIn = true;
  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Google sign-in completed, but no Google Workspace access token was returned.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
}

export async function gmailSignOut(): Promise<void> {
  cachedAccessToken = null;
  await signOut(auth);
}

export function clearCachedGmailToken(): void {
  cachedAccessToken = null;
}

export function getCachedGmailToken(): string | null {
  return cachedAccessToken;
}

export function getCurrentGmailUser(): User | null {
  return auth.currentUser;
}
