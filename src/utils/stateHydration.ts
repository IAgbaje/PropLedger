import { SEED_STATE } from '../data/seedData';
import type { RentalAppState, Tenant } from '../types/rental';
import { hydrateLegacyExpense, hydrateLegacyMaintenance } from './expensesMaintenance';

export function isSyntheticSeedPhone(phone?: string): boolean {
  if (!phone) return false;
  return /^\+234\s*803\s*101\s*20\d{2}$/.test(phone.trim());
}

export function isSyntheticSeedEmail(email?: string): boolean {
  if (!email) return false;
  return /@(agbasaffys|adebayocourt)\.ng$/i.test(email.trim());
}

export function stripSyntheticTenantContacts(tenants: Tenant[]): {
  tenants: Tenant[];
  cleanedCount: number;
} {
  let cleanedCount = 0;
  const nextTenants = tenants.map((t) => {
    const clearPhone = isSyntheticSeedPhone(t.phone);
    const clearEmail = isSyntheticSeedEmail(t.email);
    if (!clearPhone && !clearEmail) return t;
    cleanedCount += 1;
    return {
      ...t,
      phone: clearPhone ? '' : t.phone,
      email: clearEmail ? '' : t.email,
    };
  });
  return { tenants: nextTenants, cleanedCount };
}

export function hydrateRentalState(raw: Partial<RentalAppState> | null | undefined): RentalAppState {
  const unitsForBase =
    raw && Array.isArray(raw.units) && raw.units.length > 0 ? raw.units : SEED_STATE.units;

  if (!raw || typeof raw !== 'object') {
    return {
      ...SEED_STATE,
      tenants: stripSyntheticTenantContacts(SEED_STATE.tenants).tenants,
      expenses: SEED_STATE.expenses.map((e) => hydrateLegacyExpense(e, unitsForBase)),
      maintenance: SEED_STATE.maintenance.map((m) => hydrateLegacyMaintenance(m, unitsForBase)),
    };
  }

  const rawProp = raw.property ?? ({} as Partial<RentalAppState['property']>);
  const migratedPropName =
    rawProp.name === 'Adebayo Court — Phase 1'
      ? "AgbaSaffy's Court"
      : rawProp.name || SEED_STATE.property.name;

  const isLegacyManager =
    rawProp.managerName === 'Ibrahim Agbaje' || !rawProp.managerName;
  const migratedManagerName =
    rawProp.managerName === 'Ibrahim Agbaje'
      ? 'Ibraheem Agbaje'
      : rawProp.managerName || SEED_STATE.property.managerName;
  const migratedManagerEmail =
    isLegacyManager &&
    (!rawProp.managerEmail || rawProp.managerEmail === 'ibrahim.agbaje@adebayocourt.ng')
      ? 'theibraheemagbaje@gmail.com'
      : rawProp.managerEmail || SEED_STATE.property.managerEmail;

  const migrateActorText = (text?: string) => {
    if (!text) return text;
    return text
      .replace(/Adebayo Court — Phase 1/g, "AgbaSaffy's Court")
      .replace(/Ibrahim Agbaje/g, 'Ibraheem Agbaje');
  };

  const hydratedTenants = stripSyntheticTenantContacts(
    Array.isArray(raw.tenants) ? raw.tenants : SEED_STATE.tenants
  ).tenants;

  const hydratedExpenses = (Array.isArray(raw.expenses) ? raw.expenses : SEED_STATE.expenses).map(
    (e) => hydrateLegacyExpense(e, unitsForBase)
  );
  const hydratedMaintenance = (
    Array.isArray(raw.maintenance) ? raw.maintenance : SEED_STATE.maintenance
  ).map((m) => hydrateLegacyMaintenance(m, unitsForBase));

  return {
    ...SEED_STATE,
    ...raw,
    tenants: hydratedTenants,
    property: {
      ...SEED_STATE.property,
      ...rawProp,
      name: migratedPropName,
      managerName: migratedManagerName,
      managerEmail: migratedManagerEmail,
    },
    settings: {
      ...SEED_STATE.settings,
      ...(raw.settings ?? {}),
      customPaymentCategories: Array.isArray(raw.settings?.customPaymentCategories)
        ? raw.settings.customPaymentCategories
        : SEED_STATE.settings.customPaymentCategories ?? [],
    },
    smsTemplates:
      Array.isArray(raw.smsTemplates) && raw.smsTemplates.length > 0
        ? raw.smsTemplates
        : SEED_STATE.smsTemplates,
    expenses: hydratedExpenses,
    maintenance: hydratedMaintenance,
    notifications: Array.isArray(raw.notifications)
      ? raw.notifications.map((n) => ({
          ...n,
          subject: migrateActorText(n.subject),
          messageBody: migrateActorText(n.messageBody) ?? '',
        }))
      : SEED_STATE.notifications,
    auditLogs: Array.isArray(raw.auditLogs)
      ? raw.auditLogs.map((a) => ({
          ...a,
          actor: migrateActorText(a.actor) ?? a.actor,
          summary: migrateActorText(a.summary) ?? a.summary,
        }))
      : SEED_STATE.auditLogs,
  };
}
