import { SEED_STATE } from '../data/seedData';
import type { RentalAppState } from '../types/rental';

export function hydrateRentalState(raw: Partial<RentalAppState> | null | undefined): RentalAppState {
  if (!raw || typeof raw !== 'object') {
    return SEED_STATE;
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

  return {
    ...SEED_STATE,
    ...raw,
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
    },
    smsTemplates:
      Array.isArray(raw.smsTemplates) && raw.smsTemplates.length > 0
        ? raw.smsTemplates
        : SEED_STATE.smsTemplates,
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
