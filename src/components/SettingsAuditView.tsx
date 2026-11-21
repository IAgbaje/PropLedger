import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  FileText,
  Mail,
  MessageSquare,
  Monitor,
  Moon,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Send,
  Sun,
  Trash2,
  Type,
} from 'lucide-react';
import { useIntegrations } from '../context/IntegrationContext';
import { useRentalStore } from '../context/RentalStore';
import { useTheme, type DynamicTextScale, type ThemeMode } from '../context/ThemeContext';
import type {
  AuditLogEntry,
  SmsTemplate,
  SmsTemplateCategory,
  StakeholderRole,
} from '../types/rental';
import { exportFilteredCsv } from '../utils/csvExport';
import { formatDateTimeShort, formatNaira, formatTenantName, parseCurrencyValue } from '../utils/format';
import { calculateSmsSegments, interpolateTemplate } from '../utils/messaging';
import { CurrencyInput } from './CurrencyInput';
import { GoogleSignInButton } from './GoogleSignInButton';
import { StatusBadge } from './StatusBadge';
import { ExportCsvButton, SearchInput } from './TableToolbarControls';

const TEMPLATE_PLACEHOLDERS: Array<{ token: string; label: string }> = [
  { token: '{{tenant_name}}', label: 'Tenant Full Name' },
  { token: '{{first_name}}', label: 'First Name' },
  { token: '{{due_date}}', label: 'Due Date' },
  { token: '{{unit_code}}', label: 'Unit Code' },
  { token: '{{amount_due}}', label: 'Amount Due' },
  { token: '{{receipt_number}}', label: 'Receipt #' },
  { token: '{{maintenance_issue}}', label: 'Maintenance Issue' },
  { token: '{{property_name}}', label: 'Property Name' },
  { token: '{{manager_name}}', label: 'Manager Name' },
];

const TEMPLATE_CATEGORIES: SmsTemplateCategory[] = [
  'Rent Reminder',
  'Payment Receipt',
  'Maintenance Update',
  'General',
];

export function SettingsAuditView() {
  const {
    state,
    computedObligations,
    setActiveTab,
    openComposerFor,
    updateSettings,
    updatePropertyProfile,
    addCustomPaymentCategory,
    deleteCustomPaymentCategory,
    cleanSampleTenantContacts,
    saveSmsTemplate,
    deleteSmsTemplate,
    updateContact,
    addContact,
    resetDemoData,
  } = useRentalStore();
  const {
    status,
    isGmailConnected,
    isGmailSigningIn,
    gmailError,
    gmailUser,
    connectGmail,
    disconnectGmail,
  } = useIntegrations();
  const { themeMode, setThemeMode, textScale, setTextScale } = useTheme();

  const [subTab, setSubTab] = useState<'settings' | 'templates' | 'contacts' | 'audit'>('settings');
  const [auditFilter, setAuditFilter] = useState('All');
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState<'All' | SmsTemplateCategory>('All');
  const [search, setSearch] = useState('');

  // Local settings form state
  const [propName, setPropName] = useState(state.property.name);
  const [propAddr, setPropAddr] = useState(state.property.address);
  const [levy, setLevy] = useState(String(state.settings.securityLevyAmount));
  const [smsUnitCostInput, setSmsUnitCostInput] = useState(String(state.settings.smsUnitCostNaira ?? 4));
  const [commRate, setCommRate] = useState(String(state.settings.lawyerCommissionRatePercent));
  const [graceDays, setGraceDays] = useState(String(state.settings.gracePeriodDays));
  const [slaHours, setSlaHours] = useState(String(state.settings.receiptSlaHours));
  const [allocOrder, setAllocOrder] = useState(state.settings.defaultAllocationOrder);
  const [lateCycles, setLateCycles] = useState(String(state.settings.repeatedLateThresholdCycles));
  const [persistentDays, setPersistentDays] = useState(String(state.settings.persistentArrearsDays));
  const [chronicDays, setChronicDays] = useState(String(state.settings.chronicDelinquencyDays));
  const [savedToast, setSavedToast] = useState(false);

  // SMS Template form state
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [tplName, setTplName] = useState('');
  const [tplCategory, setTplCategory] = useState<SmsTemplateCategory>('Rent Reminder');
  const [tplBody, setTplBody] = useState('');
  const [tplFeedback, setTplFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(
    null
  );
  const [confirmDeleteTplId, setConfirmDeleteTplId] = useState<string | null>(null);
  const [unitRateToast, setUnitRateToast] = useState('');
  const tplTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // New contact inline
  const [cName, setCName] = useState('');
  const [cRole, setCRole] = useState<StakeholderRole>('Additional Contact');
  const [cPhone, setCPhone] = useState('');
  const [cEmail, setCEmail] = useState('');

  // Custom payment category inline builder & cleanup feedback
  const [catLabel, setCatLabel] = useState('');
  const [catDefaultStr, setCatDefaultStr] = useState('');
  const [catCommissionEligible, setCatCommissionEligible] = useState(false);
  const [catFeedback, setCatFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [cleanupResultMsg, setCleanupResultMsg] = useState('');

  useEffect(() => {
    setPropName(state.property.name);
    setPropAddr(state.property.address);
    setLevy(String(state.settings.securityLevyAmount));
    setSmsUnitCostInput(String(state.settings.smsUnitCostNaira ?? 4));
    setCommRate(String(state.settings.lawyerCommissionRatePercent));
    setGraceDays(String(state.settings.gracePeriodDays));
    setSlaHours(String(state.settings.receiptSlaHours));
    setAllocOrder(state.settings.defaultAllocationOrder);
    setLateCycles(String(state.settings.repeatedLateThresholdCycles));
    setPersistentDays(String(state.settings.persistentArrearsDays));
    setChronicDays(String(state.settings.chronicDelinquencyDays));
  }, [state.property, state.settings]);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    updatePropertyProfile({ name: propName, address: propAddr });
    updateSettings(
      {
        securityLevyAmount: parseCurrencyValue(levy),
        smsUnitCostNaira: parseCurrencyValue(smsUnitCostInput) || 0,
        lawyerCommissionRatePercent: Number(commRate) || 0,
        gracePeriodDays: Number(graceDays) || 0,
        receiptSlaHours: Number(slaHours) || 4,
        defaultAllocationOrder: allocOrder,
        repeatedLateThresholdCycles: Number(lateCycles) || 2,
        persistentArrearsDays: Number(persistentDays) || 30,
        chronicDelinquencyDays: Number(chronicDays) || 90,
      },
      'Property Manager updated operating policy settings'
    );
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 3000);
  };

  const handleAddContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cName.trim()) return;
    addContact({
      name: cName.trim(),
      role: cRole,
      phone: cPhone.trim(),
      email: cEmail.trim(),
      smsEnabled: Boolean(cPhone.trim()),
      emailEnabled: Boolean(cEmail.trim()),
      receivesArrearsEscalations: cRole === 'Lawyer' || cRole === 'Additional Contact',
    });
    setCName('');
    setCPhone('');
    setCEmail('');
  };

  const handleInsertTemplatePlaceholder = (token: string) => {
    const el = tplTextareaRef.current;
    if (!el) {
      setTplBody((prev) => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}${token}`);
      return;
    }
    const start = el.selectionStart ?? tplBody.length;
    const end = el.selectionEnd ?? tplBody.length;
    const next = `${tplBody.slice(0, start)}${token}${tplBody.slice(end)}`;
    setTplBody(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const handleSaveTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    const res = saveSmsTemplate({
      id: editingTemplateId || undefined,
      name: tplName,
      category: tplCategory,
      body: tplBody,
    });
    if (!res.ok) {
      setTplFeedback({ tone: 'error', text: res.error || 'Unable to save template.' });
      return;
    }
    setTplFeedback({
      tone: 'success',
      text: editingTemplateId
        ? `Updated template "${tplName.trim()}".`
        : `Saved template "${tplName.trim()}".`,
    });
    setEditingTemplateId(null);
    setTplName('');
    setTplBody('');
    setTimeout(() => setTplFeedback(null), 3500);
  };

  const handleStartEditTemplate = (tpl: SmsTemplate) => {
    setEditingTemplateId(tpl.id);
    setTplName(tpl.name);
    setTplCategory(tpl.category);
    setTplBody(tpl.body);
    setTplFeedback(null);
    setConfirmDeleteTplId(null);
  };

  const handleCancelEditTemplate = () => {
    setEditingTemplateId(null);
    setTplName('');
    setTplBody('');
    setTplFeedback(null);
  };

  const q = search.trim().toLowerCase();

  const sampleTenantVars = useMemo(() => {
    const sampleCo =
      computedObligations.find((co) => co.amountOutstanding > 0) || computedObligations[0];
    const sampleTenant = sampleCo
      ? state.tenants.find((t) => t.id === sampleCo.obligation.tenantId)
      : state.tenants.find((t) => !t.archived);
    const sampleUnit = sampleCo
      ? state.units.find((u) => u.id === sampleCo.obligation.unitId)
      : state.units[0];
    const sampleReceipt = state.receiptRequests.find((r) => r.officialReceiptNumber);
    const sampleMaint = state.maintenance[0];
    return {
      firstName: sampleTenant?.firstName || sampleTenant?.alias || 'Adebowale',
      fullName: sampleTenant
        ? formatTenantName(sampleTenant)
        : 'Adebowale Ogunleye',
      unitCode: sampleUnit?.code || 'FLT-A1',
      unitName: sampleUnit?.name || 'Flat A1',
      outstandingBalance: sampleCo
        ? formatNaira(sampleCo.amountOutstanding || sampleCo.obligation.originalAmount)
        : '₦850,000',
      dueDate: sampleCo?.obligation.dueDate || '2026-12-01',
      propertyName: state.property.name,
      managerName: state.property.managerName,
      receiptNumber: sampleReceipt?.officialReceiptNumber || 'RCP-2026-0142',
      maintenanceIssue: sampleMaint?.issue || 'Main borehole pump servicing',
    };
  }, [
    computedObligations,
    state.tenants,
    state.units,
    state.receiptRequests,
    state.maintenance,
    state.property.name,
    state.property.managerName,
  ]);

  const filteredTemplates = useMemo(() => {
    return state.smsTemplates.filter((tpl) => {
      if (templateCategoryFilter !== 'All' && tpl.category !== templateCategoryFilter) {
        return false;
      }
      if (q) {
        const searchable = `${tpl.name} ${tpl.category} ${tpl.body}`.toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      return true;
    });
  }, [state.smsTemplates, templateCategoryFilter, q]);

  const filteredContacts = useMemo(() => {
    if (!q) return state.contacts;
    return state.contacts.filter((c) => {
      const searchable = `${c.name} ${c.role} ${c.phone} ${c.email} ${c.isPrimaryReceiptIssuer ? 'Primary Receipt Issuer' : ''} ${c.isBackupEscalation ? 'Backup Escalation' : ''}`.toLowerCase();
      return searchable.includes(q);
    });
  }, [state.contacts, q]);

  const resolveAuditLinkedText = (entry: AuditLogEntry): string => {
    let tenantId: string | undefined;
    let unitId: string | undefined;

    const pay = state.payments.find((p) => p.id === entry.entityId);
    if (pay) {
      tenantId = pay.tenantId;
      unitId = pay.unitId;
    }
    const rcp = !pay ? state.receiptRequests.find((r) => r.id === entry.entityId) : undefined;
    if (rcp) {
      tenantId = rcp.tenantId;
      unitId = rcp.unitId;
    }
    const ag = !pay && !rcp ? state.agreements.find((a) => a.id === entry.entityId) : undefined;
    if (ag) {
      tenantId = ag.tenantId;
      unitId = ag.unitId;
    }
    const ob = !pay && !rcp && !ag ? state.obligations.find((o) => o.id === entry.entityId) : undefined;
    if (ob) {
      tenantId = ob.tenantId;
      unitId = ob.unitId;
    }
    const cm = !pay && !rcp && !ag && !ob ? state.commitments.find((c) => c.id === entry.entityId) : undefined;
    if (cm) {
      tenantId = cm.tenantId;
    }
    const notif =
      !pay && !rcp && !ag && !ob && !cm
        ? state.notifications.find((n) => n.id === entry.entityId)
        : undefined;
    if (notif) {
      tenantId = notif.tenantId;
    }
    if (entry.entityType === 'Tenant') tenantId = entry.entityId;
    if (entry.entityType === 'Unit') unitId = entry.entityId;

    if (tenantId && !unitId) {
      const tenantAg =
        state.agreements.find((a) => a.tenantId === tenantId && a.status === 'Active') ||
        state.agreements.find((a) => a.tenantId === tenantId);
      if (tenantAg) unitId = tenantAg.unitId;
    }

    const tenant = tenantId ? state.tenants.find((t) => t.id === tenantId) : undefined;
    const unit = unitId ? state.units.find((u) => u.id === unitId) : undefined;
    return `${tenant ? `${formatTenantName(tenant)} ${tenant.alias || ''}` : ''} ${unit ? `${unit.code} ${unit.name}` : ''}`.trim();
  };

  const filteredAudit = useMemo(() => {
    return state.auditLogs.filter((a) => {
      if (auditFilter !== 'All' && a.entityType !== auditFilter) return false;
      if (q) {
        const linked = resolveAuditLinkedText(a);
        const searchable = `${a.actor} ${a.entityType} ${a.action} ${a.summary} ${a.previousValue || ''} ${a.newValue || ''} ${a.reason || ''} ${linked}`.toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      return true;
    });
  }, [
    state.auditLogs,
    state.payments,
    state.receiptRequests,
    state.agreements,
    state.obligations,
    state.commitments,
    state.notifications,
    state.tenants,
    state.units,
    auditFilter,
    q,
  ]);

  const settingsExportRows = useMemo(() => {
    const allRows: Array<[string, string, string | number]> = [
      ['Property Profile', 'Property Name', propName],
      ['Property Profile', 'Property Address', propAddr],
      ['Financial Policy', 'Default Security Levy (NGN)', parseCurrencyValue(levy)],
      ['Financial Policy', 'Lawyer Commission Rate (%)', commRate],
      ['Financial Policy', 'Default Allocation Rule', allocOrder],
      ['SLA & Delinquency', 'Grace Period (Days)', graceDays],
      ['SLA & Delinquency', 'Receipt SLA (Hours)', slaHours],
      ['SLA & Delinquency', 'Repeated Late Cycles', lateCycles],
      ['SLA & Delinquency', 'Persistent Arrears (Days)', persistentDays],
      ['SLA & Delinquency', 'Chronic Arrears (Days)', chronicDays],
    ];
    if (!q) return allRows;
    return allRows.filter(([section, rule, val]) =>
      `${section} ${rule} ${val}`.toLowerCase().includes(q)
    );
  }, [propName, propAddr, levy, commRate, allocOrder, graceDays, slaHours, lateCycles, persistentDays, chronicDays, q]);

  const handleExportCurrentTabCsv = () => {
    if (subTab === 'templates') {
      exportFilteredCsv(
        `propledger-sms-templates-${state.referenceDate}.csv`,
        ['Template Name', 'Category', 'Body', 'Segments', 'Updated At'],
        filteredTemplates.map((tpl) => {
          const stats = calculateSmsSegments(tpl.body);
          return [tpl.name, tpl.category, tpl.body, stats.segments, tpl.updatedAt];
        })
      );
      return;
    }
    if (subTab === 'contacts') {
      exportFilteredCsv(
        `propledger-contacts-${state.referenceDate}.csv`,
        ['Name', 'Role', 'Phone', 'Email', 'Primary Receipt Issuer', 'Backup Escalation', 'SMS Enabled', 'Email Enabled', 'Arrears Escalations'],
        filteredContacts.map((c) => [
          c.name,
          c.role,
          c.phone,
          c.email,
          c.isPrimaryReceiptIssuer ? 'Yes' : 'No',
          c.isBackupEscalation ? 'Yes' : 'No',
          c.smsEnabled ? 'Yes' : 'No',
          c.emailEnabled ? 'Yes' : 'No',
          c.receivesArrearsEscalations ? 'Yes' : 'No',
        ])
      );
      return;
    }
    if (subTab === 'audit') {
      exportFilteredCsv(
        `propledger-audit-history-${state.referenceDate}.csv`,
        ['Timestamp', 'Actor', 'Entity Type', 'Action', 'Summary', 'Previous Value', 'New Value', 'Reason'],
        filteredAudit.map((a) => [
          a.timestamp,
          a.actor,
          a.entityType,
          a.action,
          a.summary,
          a.previousValue || '',
          a.newValue || '',
          a.reason || '',
        ])
      );
      return;
    }
    exportFilteredCsv(
      `propledger-policy-settings-${state.referenceDate}.csv`,
      ['Section', 'Setting', 'Configured Value'],
      settingsExportRows
    );
  };

  const tplLiveStats = useMemo(() => calculateSmsSegments(tplBody), [tplBody]);
  const tplLivePreview = useMemo(
    () => (tplBody ? interpolateTemplate(tplBody, sampleTenantVars) : ''),
    [tplBody, sampleTenantVars]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="hig-title-1">Settings, Templates, Stakeholders & Audit Trail</h1>
          <p className="hig-callout mt-1">
            Configure operating rules prospectively, adjust display appearance, build reusable SMS templates, manage stakeholder routing, and review audit history.
          </p>
        </div>

        <button
          type="button"
          onClick={resetDemoData}
          className="hig-btn-secondary whitespace-nowrap shrink-0"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Reset Seed Data</span>
        </button>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="hig-segmented w-full sm:w-fit" role="tablist">
          {(
            [
              { id: 'settings', label: 'Property & Policy Rules' },
              { id: 'templates', label: `Template Management (${state.smsTemplates.length})` },
              { id: 'contacts', label: `Stakeholder Contacts (${state.contacts.length})` },
              { id: 'audit', label: `Audit History (${state.auditLogs.length})` },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={subTab === t.id}
              data-active={subTab === t.id}
              onClick={() => setSubTab(t.id)}
              className="hig-segmented-item"
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={
              subTab === 'templates'
                ? 'Search template name, category, or text...'
                : subTab === 'audit'
                ? 'Search unit number, tenant, actor, or action...'
                : subTab === 'contacts'
                ? 'Search stakeholder name, role, or phone...'
                : 'Search policy rule, contacts, or audit...'
            }
            ariaLabel="Search settings, SMS templates, contacts, and audit trail"
            className="w-full sm:w-72"
          />
          <ExportCsvButton
            onClick={handleExportCurrentTabCsv}
            disabled={
              subTab === 'templates'
                ? filteredTemplates.length === 0
                : subTab === 'audit'
                ? filteredAudit.length === 0
                : subTab === 'contacts'
                ? filteredContacts.length === 0
                : settingsExportRows.length === 0
            }
            count={
              subTab === 'templates'
                ? filteredTemplates.length
                : subTab === 'audit'
                ? filteredAudit.length
                : subTab === 'contacts'
                ? filteredContacts.length
                : settingsExportRows.length
            }
          />
        </div>
      </div>

      {subTab === 'settings' && (
        <div className="space-y-6 max-w-4xl">
          {/* Appearance & Dynamic Type Card (Apple HIG Light/Dark & Accessibility Text Size) */}
          <section className="hig-card p-5 sm:p-6 space-y-4">
            <div>
              <h2 className="hig-headline">Appearance & Dynamic Type</h2>
              <p className="hig-footnote mt-0.5">
                Choose Light, Dark, or System appearance and adjust text size without layout clipping.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="hig-card-inset p-4 space-y-2.5">
                <span className="hig-subhead block">Appearance Mode</span>
                <div className="hig-segmented w-full" role="group" aria-label="Appearance mode">
                  {(
                    [
                      { id: 'light', label: 'Light', icon: Sun },
                      { id: 'dark', label: 'Dark', icon: Moon },
                      { id: 'system', label: 'System', icon: Monitor },
                    ] as const
                  ).map((mode) => {
                    const Icon = mode.icon;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        data-active={themeMode === mode.id}
                        onClick={() => setThemeMode(mode.id as ThemeMode)}
                        className="hig-segmented-item flex-1 gap-1.5"
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{mode.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="hig-card-inset p-4 space-y-2.5">
                <span className="hig-subhead flex items-center gap-1.5">
                  <Type className="w-4 h-4" />
                  <span>Text Size (Dynamic Type)</span>
                </span>
                <div className="hig-segmented w-full" role="group" aria-label="Dynamic type text size">
                  {(
                    [
                      { id: 'standard', label: 'Standard' },
                      { id: 'large', label: 'Large' },
                      { id: 'xlarge', label: 'Extra Large' },
                    ] as const
                  ).map((sc) => (
                    <button
                      key={sc.id}
                      type="button"
                      data-active={textScale === sc.id}
                      onClick={() => setTextScale(sc.id as DynamicTextScale)}
                      className="hig-segmented-item flex-1"
                    >
                      {sc.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <form onSubmit={handleSaveSettings} className="hig-card p-5 sm:p-6 space-y-6">
            {savedToast && (
              <div
                className="p-3 rounded-xl text-[0.875rem]"
                style={{
                  backgroundColor: 'var(--status-success-bg)',
                  color: 'var(--status-success-ink)',
                }}
              >
                Settings saved prospectively and recorded in Audit History.
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block hig-footnote mb-1.5">Property Name</label>
                <input
                  type="text"
                  value={propName}
                  onChange={(e) => setPropName(e.target.value)}
                  className="hig-input w-full"
                />
              </div>
              <div>
                <label className="block hig-footnote mb-1.5">Property Address</label>
                <input
                  type="text"
                  value={propAddr}
                  onChange={(e) => setPropAddr(e.target.value)}
                  className="hig-input w-full"
                />
              </div>
            </div>

            <div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t items-end"
              style={{ borderColor: 'var(--border-hairline)' }}
            >
              <div>
                <label className="block hig-footnote mb-1.5">Default Security Levy (₦)</label>
                <CurrencyInput
                  min={0}
                  value={levy}
                  onValueChange={(raw) => setLevy(raw)}
                  placeholder="e.g. 4,000"
                  className="hig-input w-full"
                />
              </div>
              <div>
                <label className="block hig-footnote mb-1.5">SMS Cost per Unit (₦)</label>
                <CurrencyInput
                  min={0}
                  value={smsUnitCostInput}
                  onValueChange={(raw) => setSmsUnitCostInput(raw)}
                  placeholder="e.g. 4"
                  className="hig-input w-full"
                />
              </div>
              <div>
                <label className="block hig-footnote mb-1.5">Lawyer Commission Rate (%)</label>
                <input
                  type="number"
                  step="0.5"
                  value={commRate}
                  onChange={(e) => setCommRate(e.target.value)}
                  className="hig-input w-full font-mono-nums"
                />
              </div>
              <div>
                <label className="block hig-footnote mb-1.5">Default Allocation Rule</label>
                <select
                  value={allocOrder}
                  onChange={(e) => setAllocOrder(e.target.value as typeof allocOrder)}
                  className="hig-input w-full"
                >
                  <option value="Oldest Overdue First">Oldest Overdue First</option>
                  <option value="Rent Before Levy">Rent Before Levy</option>
                  <option value="Manual Only">Manual Only</option>
                </select>
              </div>
            </div>

            <div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t"
              style={{ borderColor: 'var(--border-hairline)' }}
            >
              <div>
                <label className="block hig-footnote mb-1.5">Grace Period (Days)</label>
                <input
                  type="number"
                  min="0"
                  value={graceDays}
                  onChange={(e) => setGraceDays(e.target.value)}
                  className="hig-input w-full font-mono-nums"
                />
              </div>
              <div>
                <label className="block hig-footnote mb-1.5">Receipt SLA (Hours)</label>
                <input
                  type="number"
                  min="1"
                  value={slaHours}
                  onChange={(e) => setSlaHours(e.target.value)}
                  className="hig-input w-full font-mono-nums"
                />
              </div>
              <div>
                <label className="block hig-footnote mb-1.5">Repeated Late Cycles</label>
                <input
                  type="number"
                  min="1"
                  value={lateCycles}
                  onChange={(e) => setLateCycles(e.target.value)}
                  className="hig-input w-full font-mono-nums"
                />
              </div>
              <div>
                <label className="block hig-footnote mb-1.5">Chronic Arrears (Days)</label>
                <input
                  type="number"
                  min="30"
                  value={chronicDays}
                  onChange={(e) => setChronicDays(e.target.value)}
                  className="hig-input w-full font-mono-nums"
                />
              </div>
            </div>

            <div
              className="flex justify-end pt-4 border-t"
              style={{ borderColor: 'var(--border-hairline)' }}
            >
              <button type="submit" className="hig-btn-primary">
                <Save className="w-4 h-4" />
                <span>Save Policy Settings</span>
              </button>
            </div>
          </form>

          {/* Custom Payment Categories & Contact Data Hygiene */}
          <section className="hig-card p-5 sm:p-6 space-y-5">
            <div>
              <h2 className="hig-headline">Payment Categories &amp; Contact Data Cleanup</h2>
              <p className="hig-footnote mt-0.5">
                Define recurring or ad-hoc charge categories (e.g. Waste Levy, Generator Fuel) and choose whether lawyer commission applies.
              </p>
            </div>

            {catFeedback && (
              <div
                className="p-3 rounded-xl text-[0.875rem]"
                style={{
                  backgroundColor:
                    catFeedback.tone === 'success'
                      ? 'var(--status-success-bg)'
                      : 'var(--status-danger-bg)',
                  color:
                    catFeedback.tone === 'success'
                      ? 'var(--status-success-ink)'
                      : 'var(--status-danger-ink)',
                }}
              >
                {catFeedback.text}
              </div>
            )}

            <div className="hig-card-inset p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="hig-subhead font-semibold text-[var(--ink-primary)]">
                  Built-in &amp; Custom Payment Categories
                </span>
                <span className="hig-caption">
                  Built-in: Annual Rent ({state.settings.lawyerCommissionRatePercent}% commission) · Security Levy (0% commission)
                </span>
              </div>

              {(state.settings.customPaymentCategories ?? []).length > 0 && (
                <div className="divide-y rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-hairline)', backgroundColor: 'var(--bg-surface)' }}>
                  {(state.settings.customPaymentCategories ?? []).map((cat) => (
                    <div
                      key={cat.id}
                      className="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[0.875rem] font-semibold text-[var(--ink-primary)]">
                          {cat.label}
                        </span>
                        <StatusBadge
                          label={
                            cat.commissionEligible
                              ? `${state.settings.lawyerCommissionRatePercent}% Commission`
                              : 'No Commission'
                          }
                          tone={cat.commissionEligible ? 'ink' : 'neutral'}
                        />
                        {cat.defaultAmount && (
                          <span className="hig-caption font-mono-nums">
                            Default {formatNaira(cat.defaultAmount)}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteCustomPaymentCategory(cat.id)}
                        className="min-h-[36px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[0.8125rem] font-medium"
                        style={{
                          backgroundColor: 'var(--status-danger-bg)',
                          color: 'var(--status-danger-ink)',
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end pt-1">
                <div className="sm:col-span-5">
                  <label htmlFor="settings-cat-label" className="block hig-caption mb-1">
                    New Category Name
                  </label>
                  <input
                    id="settings-cat-label"
                    type="text"
                    value={catLabel}
                    onChange={(e) => setCatLabel(e.target.value)}
                    placeholder="e.g. Waste Levy, Borehole Levy"
                    className="hig-input w-full"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label htmlFor="settings-cat-default" className="block hig-caption mb-1">
                    Default Amount (₦)
                  </label>
                  <CurrencyInput
                    id="settings-cat-default"
                    min={0}
                    value={catDefaultStr}
                    onValueChange={(raw) => setCatDefaultStr(raw)}
                    placeholder="Optional"
                    className="hig-input w-full"
                  />
                </div>
                <div className="sm:col-span-4 flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-[0.8125rem] text-[var(--ink-primary)] cursor-pointer min-h-[40px]">
                    <input
                      type="checkbox"
                      checked={catCommissionEligible}
                      onChange={(e) => setCatCommissionEligible(e.target.checked)}
                      className="w-4 h-4 rounded"
                    />
                    <span>Commission applies</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const res = addCustomPaymentCategory({
                        label: catLabel,
                        defaultAmount: catDefaultStr.trim()
                          ? parseCurrencyValue(catDefaultStr)
                          : undefined,
                        commissionEligible: catCommissionEligible,
                      });
                      if (!res.ok) {
                        setCatFeedback({ tone: 'error', text: res.error || 'Unable to add category.' });
                        return;
                      }
                      setCatFeedback({
                        tone: 'success',
                        text: `Added category "${res.category?.label}". Available immediately in Record Payment.`,
                      });
                      setCatLabel('');
                      setCatDefaultStr('');
                      setCatCommissionEligible(false);
                      setTimeout(() => setCatFeedback(null), 3500);
                    }}
                    className="hig-btn-secondary whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="hig-card-inset p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="hig-subhead font-semibold text-[var(--ink-primary)]">
                  Clean Sample Placeholder Contacts
                </h3>
                <p className="hig-caption mt-0.5">
                  Strips any remaining synthetic seed phone numbers or @agbasaffys.ng/@adebayocourt.ng emails while preserving all units, tenancies, and payment ledger entries.
                </p>
                {cleanupResultMsg && (
                  <p className="hig-caption mt-1 font-semibold" style={{ color: 'var(--status-success-ink)' }}>
                    {cleanupResultMsg}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  const res = cleanSampleTenantContacts();
                  setCleanupResultMsg(
                    res.cleanedCount > 0
                      ? `Cleared placeholder contacts from ${res.cleanedCount} tenant(s).`
                      : 'All tenant contact records are already clean (0 synthetic contacts found).'
                  );
                }}
                className="hig-btn-secondary whitespace-nowrap shrink-0"
              >
                <Trash2 className="w-4 h-4" />
                <span>Clean Sample Contacts</span>
              </button>
            </div>
          </section>

          {/* Email Client, AI & SMS Integration Status Card */}
          <div className="hig-card p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="hig-headline">Email Client, AI & SMS Integration Status</h2>
                <p className="hig-footnote mt-0.5">
                  Connect your Gmail account for direct email dispatch or manage Server SMTP, Gemini AI drafting, and SMS webhook delivery.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('notifications')}
                className="hig-btn-secondary whitespace-nowrap shrink-0"
              >
                <Send className="w-4 h-4" />
                <span>Manage Integrations</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div className="hig-card-inset p-4 flex flex-col justify-between gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-[var(--accent-ink)]" />
                    <span className="hig-headline">Google Account &amp; Cloud Sync</span>
                  </div>
                  <StatusBadge
                    label={
                      isGmailConnected
                        ? 'Connected'
                        : gmailUser
                        ? 'Cloud Synced'
                        : 'Ready to Connect'
                    }
                    tone={gmailUser || isGmailConnected ? 'success' : 'neutral'}
                  />
                </div>
                {isGmailConnected ? (
                  <div className="flex items-center justify-between gap-2 text-[0.8125rem]">
                    <span
                      className="inline-flex items-center gap-1.5 font-medium truncate"
                      style={{ color: 'var(--status-success-ink)' }}
                    >
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      {gmailUser?.email || 'Connected Google Workspace (Firestore + Gmail + Calendar)'}
                    </span>
                    <button
                      type="button"
                      onClick={() => void disconnectGmail()}
                      className="hig-btn-secondary shrink-0"
                    >
                      Sign Out
                    </button>
                  </div>
                ) : gmailUser ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 text-[0.8125rem]">
                      <span
                        className="inline-flex items-center gap-1.5 font-medium truncate"
                        style={{ color: 'var(--status-success-ink)' }}
                      >
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        {gmailUser.email || 'Signed in for Firestore Cloud Sync'}
                      </span>
                      <button
                        type="button"
                        onClick={() => void disconnectGmail()}
                        className="hig-btn-secondary shrink-0"
                      >
                        Sign Out
                      </button>
                    </div>
                    <GoogleSignInButton
                      onClick={() => void connectGmail()}
                      loading={isGmailSigningIn}
                      label="Authorize Gmail & Calendar"
                    />
                  </div>
                ) : (
                  <div className="pt-0.5 space-y-1.5">
                    <GoogleSignInButton
                      onClick={() => void connectGmail()}
                      loading={isGmailSigningIn}
                      label="Sign in with Google (Cloud Sync & Gmail)"
                    />
                    {gmailError && (
                      <p className="hig-caption" style={{ color: 'var(--status-danger-ink)' }}>
                        {gmailError}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="hig-card-inset p-4 space-y-2.5">
                <div className="flex items-center justify-between text-[0.875rem]">
                  <span className="inline-flex items-center gap-1.5 font-medium text-[var(--ink-primary)]">
                    <Mail className="w-4 h-4 text-[var(--ink-secondary)]" />
                    Server SMTP Relay
                  </span>
                  <StatusBadge
                    label={status?.smtpConfigured ? 'Configured' : 'Fallback (.eml / mailto)'}
                    tone={status?.smtpConfigured ? 'success' : 'neutral'}
                  />
                </div>
                <div className="flex items-center justify-between text-[0.875rem]">
                  <span className="inline-flex items-center gap-1.5 font-medium text-[var(--ink-primary)]">
                    <Bot className="w-4 h-4 text-[var(--ink-secondary)]" />
                    Gemini AI Assistant
                  </span>
                  <StatusBadge
                    label={status?.aiConfigured ? `Active (${status.aiModel})` : 'Awaiting Key'}
                    tone={status?.aiConfigured ? 'success' : 'warning'}
                  />
                </div>
                <div className="flex items-center justify-between text-[0.875rem]">
                  <span className="inline-flex items-center gap-1.5 font-medium text-[var(--ink-primary)]">
                    <MessageSquare className="w-4 h-4 text-[var(--ink-secondary)]" />
                    SMS Gateway (BulkSMSLive v2)
                  </span>
                  <StatusBadge
                    label={
                      status?.bulkSmsConfigured
                        ? `BulkSMSLive (${status.bulkSmsSenderName || 'PropLedger'})`
                        : status?.smsWebhookConfigured
                        ? 'Webhook Active'
                        : 'Ledger Queue'
                    }
                    tone={status?.smsWebhookConfigured ? 'success' : 'neutral'}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {subTab === 'templates' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Create / Edit Reusable SMS Template + Unit Rate */}
          <div className="lg:col-span-5 space-y-4">
            <form onSubmit={handleSaveTemplate} className="hig-card p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[var(--accent-ink)]" />
                  <h2 className="hig-headline">
                    {editingTemplateId ? 'Edit SMS Template' : 'Create Reusable SMS Template'}
                  </h2>
                </div>
                {editingTemplateId && (
                  <button
                    type="button"
                    onClick={handleCancelEditTemplate}
                    className="min-h-[36px] px-2 hig-footnote hover:text-[var(--ink-primary)]"
                  >
                    New Template
                  </button>
                )}
              </div>

              {tplFeedback && (
                <div
                  className="p-3 rounded-xl text-[0.875rem]"
                  style={{
                    backgroundColor:
                      tplFeedback.tone === 'success'
                        ? 'var(--status-success-bg)'
                        : 'var(--status-danger-bg)',
                    color:
                      tplFeedback.tone === 'success'
                        ? 'var(--status-success-ink)'
                        : 'var(--status-danger-ink)',
                  }}
                >
                  {tplFeedback.text}
                </div>
              )}

              <div>
                <label htmlFor="tpl-name-input" className="block hig-footnote mb-1.5">
                  Template Name
                </label>
                <input
                  id="tpl-name-input"
                  type="text"
                  value={tplName}
                  onChange={(e) => setTplName(e.target.value)}
                  placeholder="e.g. 7-Day Pre-Due Rent Notice"
                  className="hig-input w-full"
                />
              </div>

              <div>
                <label htmlFor="tpl-category-select" className="block hig-footnote mb-1.5">
                  Category
                </label>
                <select
                  id="tpl-category-select"
                  value={tplCategory}
                  onChange={(e) => setTplCategory(e.target.value as SmsTemplateCategory)}
                  className="hig-input w-full"
                >
                  {TEMPLATE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <span className="block hig-caption mb-1.5">Click to Insert Dynamic Placeholder</span>
                <div className="flex flex-wrap gap-1.5">
                  {TEMPLATE_PLACEHOLDERS.map((ph) => (
                    <button
                      key={ph.token}
                      type="button"
                      onClick={() => handleInsertTemplatePlaceholder(ph.token)}
                      title={ph.label}
                      className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--bg-surface-secondary)] text-[var(--ink-primary)] text-[0.75rem] font-mono-nums hover:bg-[var(--bg-surface-tertiary)] transition-colors"
                    >
                      {ph.token}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
                  <label htmlFor="tpl-body-textarea" className="hig-footnote">
                    SMS Message Content
                  </label>
                  <span className="hig-caption font-mono-nums">
                    {tplLiveStats.length} chars · {tplLiveStats.segments} unit
                    {tplLiveStats.segments === 1 ? '' : 's'} ({tplLiveStats.encoding})
                    {tplLiveStats.segments > 0 &&
                      ` · ~${formatNaira(
                        tplLiveStats.segments * (parseCurrencyValue(smsUnitCostInput) || 4)
                      )}`}
                  </span>
                </div>
                <textarea
                  ref={tplTextareaRef}
                  id="tpl-body-textarea"
                  rows={4}
                  value={tplBody}
                  onChange={(e) => setTplBody(e.target.value)}
                  placeholder="Dear {{tenant_name}}, kindly note that rent for {{unit_code}} ({{amount_due}}) is due on {{due_date}}. Thank you - {{property_name}}."
                  className="hig-input w-full min-h-[112px] leading-relaxed"
                />
              </div>

              {tplLivePreview && (
                <div className="hig-card-inset p-3.5 space-y-1">
                  <span className="hig-caption uppercase tracking-[0.03em] block">
                    Live Preview ({sampleTenantVars.fullName} · {sampleTenantVars.unitCode})
                  </span>
                  <p className="text-[0.875rem] text-[var(--ink-primary)] leading-relaxed">
                    {tplLivePreview}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-1">
                {editingTemplateId && (
                  <button
                    type="button"
                    onClick={handleCancelEditTemplate}
                    className="hig-btn-secondary"
                  >
                    Cancel Edit
                  </button>
                )}
                <button type="submit" className="hig-btn-primary">
                  {editingTemplateId ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  <span>{editingTemplateId ? 'Save Changes' : 'Save Template'}</span>
                </button>
              </div>
            </form>

            {/* Quick SMS Unit Cost Rate card */}
            <div className="hig-card-inset p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="hig-subhead font-semibold text-[var(--ink-primary)]">
                  BulkSMSLive Unit Cost (₦ / SMS Page)
                </span>
                {unitRateToast && (
                  <span className="hig-caption font-semibold" style={{ color: 'var(--status-success-ink)' }}>
                    {unitRateToast}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2.5">
                <div className="flex-1">
                  <CurrencyInput
                    min={0}
                    value={smsUnitCostInput}
                    onValueChange={(raw) => setSmsUnitCostInput(raw)}
                    placeholder="4"
                    ariaLabel="SMS cost per unit in Naira"
                    className="hig-input w-full"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const rate = parseCurrencyValue(smsUnitCostInput);
                    updateSettings(
                      { smsUnitCostNaira: rate },
                      `Updated default SMS cost per unit to ₦${rate}`
                    );
                    setUnitRateToast(`Saved ₦${rate}/unit`);
                    setTimeout(() => setUnitRateToast(''), 2500);
                  }}
                  className="hig-btn-secondary whitespace-nowrap"
                >
                  Update Rate
                </button>
              </div>
              <p className="hig-caption">
                Used across the SMS Activity Log to calculate per-recipient and portfolio SMS spend.
              </p>
            </div>
          </div>

          {/* Right Column: Saved Reusable SMS Templates */}
          <div className="lg:col-span-7 space-y-4">
            <div className="hig-segmented w-full sm:w-fit" role="tablist">
              {(['All', ...TEMPLATE_CATEGORIES] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  role="tab"
                  aria-selected={templateCategoryFilter === cat}
                  data-active={templateCategoryFilter === cat}
                  onClick={() => setTemplateCategoryFilter(cat)}
                  className="hig-segmented-item"
                >
                  {cat}
                </button>
              ))}
            </div>

            {filteredTemplates.length === 0 ? (
              <div className="hig-card p-10 text-center hig-subhead">
                No SMS templates match your current filter. Create one using the form on the left.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredTemplates.map((tpl) => {
                  const segs = calculateSmsSegments(tpl.body);
                  const isEditingThis = editingTemplateId === tpl.id;
                  return (
                    <div
                      key={tpl.id}
                      className="hig-card p-4 sm:p-5 space-y-3"
                      style={
                        isEditingThis
                          ? {
                              borderColor: 'var(--accent)',
                              boxShadow: '0 0 0 2px var(--accent-soft)',
                            }
                          : undefined
                      }
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2.5">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="hig-headline">{tpl.name}</h3>
                            <StatusBadge
                              label={tpl.category}
                              tone={
                                tpl.category === 'Rent Reminder'
                                  ? 'warning'
                                  : tpl.category === 'Payment Receipt'
                                  ? 'success'
                                  : 'neutral'
                              }
                            />
                          </div>
                          <p className="hig-caption font-mono-nums">
                            {segs.length} chars · {segs.segments} SMS unit
                            {segs.segments === 1 ? '' : 's'} ({segs.encoding}) · Updated{' '}
                            {formatDateTimeShort(tpl.updatedAt)}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              openComposerFor({
                                channelMode: 'SMS',
                                smsBody: tpl.body,
                                intent: tpl.category,
                              })
                            }
                            className="hig-btn-primary whitespace-nowrap"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>Use in Composer</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStartEditTemplate(tpl)}
                            aria-label={`Edit template ${tpl.name}`}
                            className="hig-btn-secondary"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>
                          {confirmDeleteTplId === tpl.id ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  deleteSmsTemplate(tpl.id);
                                  if (editingTemplateId === tpl.id) handleCancelEditTemplate();
                                  setConfirmDeleteTplId(null);
                                }}
                                aria-label={`Confirm delete ${tpl.name}`}
                                className="min-h-[44px] px-3 py-2 rounded-xl text-[0.8125rem] font-semibold"
                                style={{
                                  backgroundColor: 'var(--status-danger-ink)',
                                  color: '#FFFFFF',
                                }}
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteTplId(null)}
                                className="hig-btn-secondary"
                              >
                                Keep
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteTplId(tpl.id)}
                              aria-label={`Delete template ${tpl.name}`}
                              className="min-h-[44px] inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[0.8125rem] font-semibold"
                              style={{
                                backgroundColor: 'var(--status-danger-bg)',
                                color: 'var(--status-danger-ink)',
                              }}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          )}
                        </div>
                      </div>

                      <p className="hig-card-inset p-3.5 text-[0.8125rem] text-[var(--ink-primary)] leading-relaxed font-mono-nums">
                        {tpl.body}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {subTab === 'contacts' && (
        <div className="space-y-6">
          <div className="hig-card overflow-hidden">
            {/* Mobile Stacked Cards */}
            <div className="md:hidden divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
              {filteredContacts.length === 0 ? (
                <p className="py-10 px-4 text-center hig-subhead">
                  No stakeholder contacts match your filter.
                </p>
              ) : (
                filteredContacts.map((c) => (
                  <div key={c.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="hig-headline block truncate">{c.name}</span>
                        <span className="hig-footnote font-mono-nums block">{c.phone}</span>
                        <span className="hig-footnote block truncate">{c.email}</span>
                      </div>
                      <StatusBadge label={c.role} tone="neutral" />
                    </div>
                    <div className="grid grid-cols-3 gap-2 hig-card-inset p-2.5 text-[0.8125rem]">
                      <label className="flex items-center justify-center gap-1.5 min-h-[38px] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={c.smsEnabled}
                          onChange={(e) => updateContact(c.id, { smsEnabled: e.target.checked })}
                          className="w-4 h-4 rounded"
                        />
                        <span>SMS</span>
                      </label>
                      <label className="flex items-center justify-center gap-1.5 min-h-[38px] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={c.emailEnabled}
                          onChange={(e) => updateContact(c.id, { emailEnabled: e.target.checked })}
                          className="w-4 h-4 rounded"
                        />
                        <span>Email</span>
                      </label>
                      <label className="flex items-center justify-center gap-1.5 min-h-[38px] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={c.receivesArrearsEscalations}
                          onChange={(e) =>
                            updateContact(c.id, { receivesArrearsEscalations: e.target.checked })
                          }
                          className="w-4 h-4 rounded"
                        />
                        <span>Escalate</span>
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        openComposerFor({
                          directoryRecipientIds: [`contact:${c.id}`],
                          channelMode: c.email && c.phone ? 'Both' : c.email ? 'Email' : 'SMS',
                          intent:
                            c.role === 'Lawyer'
                              ? 'Legal Escalation'
                              : c.role === 'Receipt Issuer'
                              ? 'Receipt Issuance'
                              : 'Custom Notice',
                        })
                      }
                      className="hig-btn-secondary w-full"
                    >
                      <Send className="w-4 h-4" />
                      <span>Message</span>
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr
                    className="border-b text-[0.75rem] font-semibold uppercase tracking-[0.03em]"
                    style={{ borderColor: 'var(--border-hairline)', color: 'var(--ink-tertiary)' }}
                  >
                    <th className="py-3 px-5">Stakeholder Name</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Contact Channels</th>
                    <th className="py-3 px-4 text-center">SMS</th>
                    <th className="py-3 px-4 text-center">Email</th>
                    <th className="py-3 px-4 text-center">Arrears Escalation</th>
                    <th className="py-3 px-5 text-right">Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-[0.875rem]" style={{ borderColor: 'var(--border-subtle)' }}>
                  {filteredContacts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center hig-subhead">
                        No stakeholder contacts match your filter.
                      </td>
                    </tr>
                  ) : (
                    filteredContacts.map((c) => (
                      <tr key={c.id} className="hover:bg-[var(--bg-hover)]">
                        <td className="py-3.5 px-5 align-top">
                          <span className="font-semibold text-[var(--ink-primary)] block">
                            {c.name}
                          </span>
                          {(c.isPrimaryReceiptIssuer || c.isBackupEscalation) && (
                            <span className="hig-caption block mt-0.5">
                              {c.isPrimaryReceiptIssuer && 'Primary Receipt Issuer'}
                              {c.isBackupEscalation && 'Backup / Escalation Contact'}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 align-top">
                          <StatusBadge label={c.role} tone="neutral" />
                        </td>
                        <td className="py-3.5 px-4 align-top hig-footnote">
                          <span className="block font-mono-nums">{c.phone}</span>
                          <span className="block mt-0.5">{c.email}</span>
                        </td>
                        <td className="py-3.5 px-4 text-center align-middle">
                          <input
                            type="checkbox"
                            aria-label={`Enable SMS for ${c.name}`}
                            checked={c.smsEnabled}
                            onChange={(e) => updateContact(c.id, { smsEnabled: e.target.checked })}
                            className="w-4 h-4 rounded"
                          />
                        </td>
                        <td className="py-3.5 px-4 text-center align-middle">
                          <input
                            type="checkbox"
                            aria-label={`Enable Email for ${c.name}`}
                            checked={c.emailEnabled}
                            onChange={(e) => updateContact(c.id, { emailEnabled: e.target.checked })}
                            className="w-4 h-4 rounded"
                          />
                        </td>
                        <td className="py-3.5 px-4 text-center align-middle">
                          <input
                            type="checkbox"
                            aria-label={`Enable arrears escalations for ${c.name}`}
                            checked={c.receivesArrearsEscalations}
                            onChange={(e) =>
                              updateContact(c.id, { receivesArrearsEscalations: e.target.checked })
                            }
                            className="w-4 h-4 rounded"
                          />
                        </td>
                        <td className="py-3.5 px-5 text-right align-middle">
                          <button
                            type="button"
                            onClick={() =>
                              openComposerFor({
                                directoryRecipientIds: [`contact:${c.id}`],
                                channelMode:
                                  c.email && c.phone ? 'Both' : c.email ? 'Email' : 'SMS',
                                intent:
                                  c.role === 'Lawyer'
                                    ? 'Legal Escalation'
                                    : c.role === 'Receipt Issuer'
                                    ? 'Receipt Issuance'
                                    : 'Custom Notice',
                              })
                            }
                            className="inline-flex items-center gap-1 min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[0.8125rem] font-medium text-[var(--ink-primary)] hover:bg-[var(--bg-surface-secondary)] whitespace-nowrap"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>Message</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <form
            onSubmit={handleAddContact}
            className="hig-card-inset p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
          >
            <div>
              <label className="block hig-caption mb-1.5">Name</label>
              <input
                type="text"
                value={cName}
                onChange={(e) => setCName(e.target.value)}
                placeholder="Full name"
                className="hig-input w-full"
                required
              />
            </div>
            <div>
              <label className="block hig-caption mb-1.5">Role</label>
              <select
                value={cRole}
                onChange={(e) => setCRole(e.target.value as StakeholderRole)}
                className="hig-input w-full"
              >
                <option value="Receipt Issuer">Receipt Issuer</option>
                <option value="Lawyer">Lawyer</option>
                <option value="Additional Contact">Additional Contact</option>
              </select>
            </div>
            <div>
              <label className="block hig-caption mb-1.5">Phone</label>
              <input
                type="text"
                value={cPhone}
                onChange={(e) => setCPhone(e.target.value)}
                placeholder="+234..."
                className="hig-input w-full"
              />
            </div>
            <div>
              <label className="block hig-caption mb-1.5">Email</label>
              <input
                type="email"
                value={cEmail}
                onChange={(e) => setCEmail(e.target.value)}
                placeholder="name@domain.ng"
                className="hig-input w-full"
              />
            </div>
            <button type="submit" className="hig-btn-primary w-full">
              Add Contact
            </button>
          </form>
        </div>
      )}

      {subTab === 'audit' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {[
              'All',
              'Payment',
              'Receipt',
              'Agreement',
              'Commitment',
              'Notification',
              'Template',
              'Commission',
              'Import',
              'Settings',
            ].map((ent) => (
              <button
                key={ent}
                type="button"
                onClick={() => setAuditFilter(ent)}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl text-[0.8125rem] font-medium transition-colors"
                style={
                  auditFilter === ent
                    ? {
                        backgroundColor: 'var(--accent)',
                        color: 'var(--accent-contrast)',
                      }
                    : {
                        backgroundColor: 'var(--bg-surface-secondary)',
                        color: 'var(--ink-secondary)',
                      }
                }
              >
                {ent}
              </button>
            ))}
          </div>

          <div className="hig-card overflow-hidden">
            {/* Mobile Stacked Cards */}
            <div className="md:hidden divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
              {filteredAudit.length === 0 ? (
                <p className="py-10 px-4 text-center hig-subhead">
                  No audit log entries match your filter.
                </p>
              ) : (
                filteredAudit.map((entry) => (
                  <div key={entry.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <StatusBadge label={entry.entityType} tone="neutral" />
                      <span className="hig-caption font-mono-nums">
                        {formatDateTimeShort(entry.timestamp)}
                      </span>
                    </div>
                    <h3 className="hig-headline">{entry.action}</h3>
                    <p className="hig-subhead text-[var(--ink-primary)]">{entry.summary}</p>
                    <p className="hig-caption">By {entry.actor}</p>
                  </div>
                ))
              )}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr
                    className="border-b text-[0.75rem] font-semibold uppercase tracking-[0.03em]"
                    style={{ borderColor: 'var(--border-hairline)', color: 'var(--ink-tertiary)' }}
                  >
                    <th className="py-3 px-4 w-[148px] whitespace-nowrap">Timestamp</th>
                    <th className="py-3 px-4 w-[132px] whitespace-nowrap">Actor</th>
                    <th className="py-3 px-4 w-[210px]">Entity & Action</th>
                    <th className="py-3 px-4 min-w-[240px]">Summary & Value Change</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-[0.875rem]" style={{ borderColor: 'var(--border-subtle)' }}>
                  {filteredAudit.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-10 text-center hig-subhead">
                        No audit log entries match your filter.
                      </td>
                    </tr>
                  ) : (
                    filteredAudit.map((entry) => (
                      <tr key={entry.id} className="hover:bg-[var(--bg-hover)] transition-colors">
                        <td className="py-3.5 px-4 align-top font-mono-nums hig-footnote whitespace-nowrap">
                          {formatDateTimeShort(entry.timestamp)}
                        </td>
                        <td className="py-3.5 px-4 align-top font-semibold text-[var(--ink-primary)] whitespace-nowrap">
                          {entry.actor}
                        </td>
                        <td className="py-3.5 px-4 align-top">
                          <div className="flex flex-col items-start gap-1">
                            <StatusBadge label={entry.entityType} tone="neutral" />
                            <span className="font-semibold text-[var(--ink-primary)] leading-snug">
                              {entry.action}
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 align-top text-[var(--ink-secondary)]">
                          <p className="text-[0.875rem] text-[var(--ink-primary)] leading-relaxed">
                            {entry.summary}
                          </p>
                          {(entry.previousValue || entry.newValue || entry.reason) && (
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 hig-caption font-mono-nums">
                              {entry.previousValue && (
                                <span>
                                  From:{' '}
                                  <span className="text-[var(--ink-secondary)]">
                                    {entry.previousValue}
                                  </span>
                                </span>
                              )}
                              {entry.newValue && (
                                <span>
                                  {entry.previousValue ? '→ ' : ''}To:{' '}
                                  <span className="text-[var(--ink-primary)] font-semibold">
                                    {entry.newValue}
                                  </span>
                                </span>
                              )}
                              {entry.reason && (
                                <span className="font-sans text-[var(--ink-tertiary)]">
                                  Reason: {entry.reason}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
