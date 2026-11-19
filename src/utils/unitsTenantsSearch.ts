import type { Agreement, Tenant, Unit } from '../types/rental';

export function filterTenantsByQuery(
  tenants: Tenant[],
  agreements: Agreement[],
  units: Unit[],
  query: string
): Tenant[] {
  const q = query.trim().toLowerCase();
  if (!q) return tenants;

  return tenants.filter((t) => {
    const tenantText = `${t.firstName} ${t.lastName} ${t.phone} ${t.email}`.toLowerCase();
    if (tenantText.includes(q)) return true;

    const tenantAgreements = agreements.filter((a) => a.tenantId === t.id);
    return tenantAgreements.some((ag) => {
      const unit = units.find((u) => u.id === ag.unitId);
      if (!unit) return false;
      return `${unit.code} ${unit.name} ${unit.type} ${unit.floorOrWing}`.toLowerCase().includes(q);
    });
  });
}

export function filterUnitsByQuery(
  units: Unit[],
  agreements: Agreement[],
  tenants: Tenant[],
  query: string
): Unit[] {
  const q = query.trim().toLowerCase();
  if (!q) return units;

  return units.filter((u) => {
    const unitText = `${u.code} ${u.name} ${u.type} ${u.floorOrWing} ${u.occupancyStatus}`.toLowerCase();
    if (unitText.includes(q)) return true;

    const activeAg = agreements.find((a) => a.unitId === u.id && a.status === 'Active');
    if (!activeAg) return false;
    const tenant = tenants.find((t) => t.id === activeAg.tenantId);
    if (!tenant) return false;
    return `${tenant.firstName} ${tenant.lastName} ${tenant.phone} ${tenant.email}`.toLowerCase().includes(q);
  });
}

export function filterAgreementsByQuery(
  agreements: Agreement[],
  units: Unit[],
  tenants: Tenant[],
  query: string
): Agreement[] {
  const q = query.trim().toLowerCase();
  if (!q) return agreements;

  return agreements.filter((ag) => {
    const unit = units.find((u) => u.id === ag.unitId);
    const tenant = tenants.find((t) => t.id === ag.tenantId);
    const haystack = [
      unit?.code,
      unit?.name,
      unit?.type,
      tenant ? `${tenant.firstName} ${tenant.lastName}` : '',
      tenant?.phone,
      ag.status,
      ag.rentCycle,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(q);
  });
}
