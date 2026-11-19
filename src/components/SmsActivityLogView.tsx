import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Coins,
  Eye,
  MessageSquareText,
  Plus,
  RefreshCw,
  RotateCw,
  Send,
  Wallet,
  X,
} from 'lucide-react';
import { useIntegrations } from '../context/IntegrationContext';
import { useRentalStore } from '../context/RentalStore';
import type { NotificationRecord } from '../types/rental';
import { exportFilteredCsv } from '../utils/csvExport';
import { fetchBulkSmsBalance, fetchBulkSmsDeliveryReport } from '../utils/emailClient';
import { formatDateTimeShort, formatNaira, parseCurrencyValue } from '../utils/format';
import {
  buildSmsRecipientCostSummaries,
  extractBulkSmsDlrMatch,
  getSmsRecordCostNaira,
  getSmsRecordUnits,
} from '../utils/smsAnalytics';
import { CurrencyInput } from './CurrencyInput';
import { StatusBadge } from './StatusBadge';
import { ExportCsvButton, SearchInput } from './TableToolbarControls';

export function SmsActivityLogView() {
  const {
    state,
    openComposerFor,
    updateNotificationRecord,
    retryNotification,
    updateSettings,
  } = useRentalStore();
  const { status: integrationStatus } = useIntegrations();

  const [statusFilter, setStatusFilter] = useState<
    'All' | 'Delivered' | 'Sent' | 'Queued' | 'Failed'
  >('All');
  const [historySearch, setHistorySearch] = useState('');
  const [summarySearch, setSummarySearch] = useState('');
  const [unitCostDraft, setUnitCostDraft] = useState(
    String(state.settings.smsUnitCostNaira ?? 4)
  );
  const [previewRecord, setPreviewRecord] = useState<NotificationRecord | null>(null);

  const [balanceState, setBalanceState] = useState<{
    loading: boolean;
    tone?: 'success' | 'warning';
    text?: string;
  }>({ loading: false });

  const [dlrSyncState, setDlrSyncState] = useState<{
    syncingAll: boolean;
    checkingId: string | null;
    tone?: 'success' | 'warning';
    text?: string;
  }>({ syncingAll: false, checkingId: null });

  const effectiveUnitCost = useMemo(() => {
    const parsed = parseCurrencyValue(unitCostDraft);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : state.settings.smsUnitCostNaira;
  }, [unitCostDraft, state.settings.smsUnitCostNaira]);

  const { metrics, summaries } = useMemo(
    () =>
      buildSmsRecipientCostSummaries({
        notifications: state.notifications,
        tenants: state.tenants,
        agreements: state.agreements,
        units: state.units,
        unitCostNaira: effectiveUnitCost,
      }),
    [state.notifications, state.tenants, state.agreements, state.units, effectiveUnitCost]
  );

  const resolveLinkedUnitCode = (n: NotificationRecord): string => {
    if (!n.tenantId) return '';
    const ag =
      state.agreements.find((a) => a.tenantId === n.tenantId && a.status === 'Active') ||
      state.agreements.find((a) => a.tenantId === n.tenantId);
    const unit = ag ? state.units.find((u) => u.id === ag.unitId) : undefined;
    return unit?.code || '';
  };

  const filteredSummaries = useMemo(() => {
    const q = summarySearch.trim().toLowerCase();
    if (!q) return summaries;
    return summaries.filter((s) =>
      `${s.recipientName} ${s.recipientContact} ${s.recipientRole} ${s.unitCode || ''}`
        .toLowerCase()
        .includes(q)
    );
  }, [summaries, summarySearch]);

  const smsRecords = useMemo(() => {
    return state.notifications
      .filter((n) => n.channel === 'SMS')
      .sort((a, b) =>
        (b.attemptedAt || b.scheduledAt).localeCompare(a.attemptedAt || a.scheduledAt)
      );
  }, [state.notifications]);

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return smsRecords.filter((n) => {
      if (statusFilter === 'Delivered' && n.status !== 'Delivered') return false;
      if (statusFilter === 'Sent' && n.status !== 'Sent') return false;
      if (statusFilter === 'Queued' && n.status !== 'Queued') return false;
      if (
        statusFilter === 'Failed' &&
        n.status !== 'Failed' &&
        n.status !== 'Retry Pending' &&
        n.status !== 'Exhausted / Action Required'
      ) {
        return false;
      }

      if (q) {
        const unitCode = resolveLinkedUnitCode(n);
        const searchable = `${n.recipientName} ${n.recipientContact} ${n.recipientRole} ${unitCode} ${n.eventType} ${n.messageBody} ${n.deliveryProvider || ''} ${n.externalMessageId || ''} ${n.status}`.toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      return true;
    });
  }, [smsRecords, statusFilter, historySearch, state.agreements, state.units]);

  const bulkSmsTrackableRecords = useMemo(
    () =>
      smsRecords.filter(
        (r) => r.deliveryProvider === 'BulkSMSLive' && Boolean(r.externalMessageId)
      ),
    [smsRecords]
  );

  const handleCheckBalance = async () => {
    setBalanceState({ loading: true });
    const res = await fetchBulkSmsBalance();
    setBalanceState({
      loading: false,
      tone: res.ok ? 'success' : 'warning',
      text: res.ok
        ? `BulkSMSLive Wallet Balance: ${res.balance} credit unit(s)`
        : res.error || 'BulkSMSLive credentials not configured on server yet.',
    });
  };

  const handleRefreshSingleDlr = async (record: NotificationRecord) => {
    if (!record.externalMessageId) {
      setDlrSyncState({
        syncingAll: false,
        checkingId: null,
        tone: 'warning',
        text: 'This SMS record has no BulkSMSLive MsgID yet.',
      });
      return;
    }

    setDlrSyncState({ syncingAll: false, checkingId: record.id });
    try {
      const res = await fetchBulkSmsDeliveryReport({ msgids: record.externalMessageId });
      const { nextStatus, rawLabel } = extractBulkSmsDlrMatch(
        res.reports,
        record.externalMessageId
      );
      const updatedStatus = nextStatus || record.status;
      updateNotificationRecord(
        record.id,
        {
          status: updatedStatus,
          failureReason:
            updatedStatus === 'Failed' ? `BulkSMSLive DLR: ${rawLabel}` : undefined,
        },
        'SMS Delivery Report Synced',
        `BulkSMSLive DLR for ${record.recipientName} (${record.externalMessageId}): ${rawLabel}`
      );
      setDlrSyncState({
        syncingAll: false,
        checkingId: null,
        tone: updatedStatus === 'Failed' ? 'warning' : 'success',
        text: `Updated DLR for ${record.recipientName} (${record.externalMessageId}): ${rawLabel}`,
      });
    } catch (err) {
      setDlrSyncState({
        syncingAll: false,
        checkingId: null,
        tone: 'warning',
        text:
          err instanceof Error
            ? err.message
            : 'Unable to reach BulkSMSLive DLR endpoint.',
      });
    }
  };

  const handleSyncAllBulkSmsDlr = async () => {
    if (bulkSmsTrackableRecords.length === 0) {
      setDlrSyncState({
        syncingAll: false,
        checkingId: null,
        tone: 'warning',
        text: 'No BulkSMSLive messages with Message IDs found yet. Send an SMS via BulkSMSLive first.',
      });
      return;
    }

    setDlrSyncState({ syncingAll: true, checkingId: null });
    try {
      const msgids = bulkSmsTrackableRecords
        .map((r) => r.externalMessageId)
        .filter(Boolean)
        .join(',');
      const res = await fetchBulkSmsDeliveryReport({ msgids });
      let updatedCount = 0;

      for (const rec of bulkSmsTrackableRecords) {
        const { nextStatus, rawLabel } = extractBulkSmsDlrMatch(
          res.reports,
          rec.externalMessageId
        );
        if (nextStatus && nextStatus !== rec.status) {
          updateNotificationRecord(
            rec.id,
            {
              status: nextStatus,
              failureReason:
                nextStatus === 'Failed' ? `BulkSMSLive DLR: ${rawLabel}` : undefined,
            },
            'Bulk SMS Delivery Status Synced',
            `Synced DLR (${rec.externalMessageId}): ${rawLabel}`
          );
          updatedCount++;
        }
      }

      setDlrSyncState({
        syncingAll: false,
        checkingId: null,
        tone: 'success',
        text: `Synced delivery reports across ${bulkSmsTrackableRecords.length} BulkSMSLive message(s) (${updatedCount} status update${updatedCount === 1 ? '' : 's'}).`,
      });
    } catch (err) {
      setDlrSyncState({
        syncingAll: false,
        checkingId: null,
        tone: 'warning',
        text:
          err instanceof Error
            ? err.message
            : 'Unable to sync BulkSMSLive delivery reports. Verify BULKSMSLIVE_API_KEY or credentials.',
      });
    }
  };

  const handleExportSummaryCsv = () => {
    exportFilteredCsv(
      `propledger-sms-cost-summary-${state.referenceDate}.csv`,
      [
        'Recipient Name',
        'Phone',
        'Role',
        'Unit Code',
        'Total SMS',
        'Delivered',
        'Sent',
        'Queued',
        'Failed',
        'Billable Units',
        'Total Cost (NGN)',
        'Last Activity',
      ],
      filteredSummaries.map((s) => [
        s.recipientName,
        s.recipientContact,
        s.recipientRole,
        s.unitCode || '',
        s.totalMessages,
        s.deliveredCount,
        s.sentCount,
        s.queuedCount,
        s.failedCount,
        s.billableUnits,
        s.totalCostNaira,
        s.lastActivityAt,
      ])
    );
  };

  const handleExportHistoryCsv = () => {
    exportFilteredCsv(
      `propledger-sms-activity-log-${state.referenceDate}.csv`,
      [
        'Timestamp',
        'Recipient Name',
        'Phone',
        'Unit Code',
        'Role',
        'Event Type',
        'Provider',
        'External MsgID',
        'Delivery Status',
        'Billable Units',
        'Cost (NGN)',
        'Failure / DLR Note',
        'Message Body',
      ],
      filteredHistory.map((n) => {
        const unitCode = resolveLinkedUnitCode(n);
        const { billableUnits } = getSmsRecordUnits(n);
        const costNaira = getSmsRecordCostNaira(n, effectiveUnitCost);
        return [
          n.attemptedAt || n.scheduledAt,
          n.recipientName,
          n.recipientContact,
          unitCode,
          n.recipientRole,
          n.eventType,
          n.deliveryProvider || '',
          n.externalMessageId || '',
          n.status,
          billableUnits,
          costNaira,
          n.failureReason || '',
          n.messageBody,
        ];
      })
    );
  };

  const openSmsComposerForSummary = (s: (typeof summaries)[number]) => {
    openComposerFor({
      channelMode: 'SMS',
      directoryRecipientIds: s.tenantId ? [`tenant:${s.tenantId}`] : undefined,
      customRecipients: s.tenantId
        ? undefined
        : [
            {
              name: s.recipientName,
              phone: s.recipientContact,
              role:
                s.recipientRole === 'Lawyer' ||
                s.recipientRole === 'Receipt Issuer' ||
                s.recipientRole === 'Additional Contact' ||
                s.recipientRole === 'Property Manager'
                  ? s.recipientRole
                  : 'Custom',
              unitCode: s.unitCode,
            },
          ],
      linkedTenantId: s.tenantId,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="hig-title-1">SMS Activity Log & Cost Summary</h1>
          <p className="hig-callout mt-1">
            Track sent SMS messages, sync live BulkSMSLive delivery reports (DLR), and audit unit costs per recipient.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => openComposerFor({ channelMode: 'SMS' })}
            className="hig-btn-primary whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Send / Schedule SMS</span>
          </button>

          <button
            type="button"
            onClick={() => void handleCheckBalance()}
            disabled={balanceState.loading}
            className="hig-btn-secondary whitespace-nowrap"
          >
            <Wallet className="w-4 h-4" />
            <span>{balanceState.loading ? 'Checking...' : 'Check Balance'}</span>
          </button>

          <button
            type="button"
            onClick={() => void handleSyncAllBulkSmsDlr()}
            disabled={dlrSyncState.syncingAll}
            className="hig-btn-secondary whitespace-nowrap"
          >
            <RefreshCw className={`w-4 h-4 ${dlrSyncState.syncingAll ? 'animate-spin' : ''}`} />
            <span>{dlrSyncState.syncingAll ? 'Syncing DLR...' : 'Sync Delivery Reports'}</span>
          </button>
        </div>
      </div>

      {/* Portfolio SMS KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="hig-card p-3.5 sm:p-5 space-y-1 min-w-0">
          <span className="hig-caption uppercase tracking-[0.03em] flex items-center gap-1.5">
            <Send className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Dispatched SMS</span>
          </span>
          <p className="hig-title-2 font-mono-nums">{metrics.dispatchedCount}</p>
          <p className="hig-footnote leading-snug">
            {metrics.totalRecords} total · {metrics.queuedCount} queued
          </p>
        </div>

        <div className="hig-card p-3.5 sm:p-5 space-y-1 min-w-0">
          <span className="hig-caption uppercase tracking-[0.03em] flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Delivery Rate</span>
          </span>
          <p
            className="hig-title-2 font-mono-nums"
            style={{ color: 'var(--status-success-ink)' }}
          >
            {metrics.deliveryRatePct}%
          </p>
          <p className="hig-footnote leading-snug">
            {metrics.deliveredCount} DLR · {metrics.failedCount} failed
          </p>
        </div>

        <div className="hig-card p-3.5 sm:p-5 space-y-1 min-w-0">
          <span className="hig-caption uppercase tracking-[0.03em] flex items-center gap-1.5">
            <MessageSquareText className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">SMS Units</span>
          </span>
          <p className="hig-title-2 font-mono-nums">
            {metrics.totalUnitsConsumed.toLocaleString()}
          </p>
          <p className="hig-footnote leading-snug">
            {metrics.uniqueRecipientCount} recipient(s)
          </p>
        </div>

        <div className="hig-card p-3.5 sm:p-5 space-y-1 min-w-0">
          <span className="hig-caption uppercase tracking-[0.03em] flex items-center gap-1.5">
            <Coins className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Est. Spend</span>
          </span>
          <p className="hig-title-2 font-mono-nums">{formatNaira(metrics.totalCostNaira)}</p>
          <p className="hig-footnote leading-snug">
            ₦{effectiveUnitCost.toLocaleString()} / SMS page
          </p>
        </div>
      </div>

      {/* BulkSMSLive Gateway Status & Configurable Unit Rate Strip */}
      <div className="hig-card-inset p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <StatusBadge
            label={
              integrationStatus?.bulkSmsConfigured
                ? `BulkSMSLive v2 Connected (${integrationStatus.bulkSmsSenderName || 'PropLedger'})`
                : integrationStatus?.smsWebhookConfigured
                ? 'Custom SMS Webhook Connected'
                : 'BulkSMSLive: Local Ledger Mode'
            }
            tone={integrationStatus?.smsWebhookConfigured ? 'success' : 'neutral'}
            showDot
          />
          <span className="hig-footnote">
            {bulkSmsTrackableRecords.length} message(s) with gateway Message IDs
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <label
            htmlFor="sms-log-unit-rate"
            className="hig-subhead whitespace-nowrap"
          >
            Default Unit Rate:
          </label>
          <div className="w-32">
            <CurrencyInput
              id="sms-log-unit-rate"
              min={0}
              value={unitCostDraft}
              onValueChange={(raw) => setUnitCostDraft(raw)}
              placeholder="4"
              ariaLabel="Default SMS cost per unit in Naira"
              className="hig-input w-full"
            />
          </div>
          {effectiveUnitCost !== state.settings.smsUnitCostNaira && (
            <button
              type="button"
              onClick={() =>
                updateSettings(
                  { smsUnitCostNaira: effectiveUnitCost },
                  `Updated SMS cost per unit to ₦${effectiveUnitCost}`
                )
              }
              className="hig-btn-primary"
            >
              Save Rate
            </button>
          )}
        </div>
      </div>

      {(balanceState.text || dlrSyncState.text) && (
        <div className="space-y-2">
          {balanceState.text && (
            <div
              className="p-3.5 rounded-xl text-[0.875rem] flex items-center justify-between gap-3"
              style={{
                backgroundColor:
                  balanceState.tone === 'success'
                    ? 'var(--status-success-bg)'
                    : 'var(--status-warning-bg)',
                color:
                  balanceState.tone === 'success'
                    ? 'var(--status-success-ink)'
                    : 'var(--status-warning-ink)',
              }}
            >
              <span>{balanceState.text}</span>
              <button
                type="button"
                onClick={() => setBalanceState({ loading: false })}
                className="min-h-[44px] px-2.5 text-[0.8125rem] underline shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}
          {dlrSyncState.text && (
            <div
              className="p-3.5 rounded-xl text-[0.875rem] flex items-center justify-between gap-3"
              style={{
                backgroundColor:
                  dlrSyncState.tone === 'success'
                    ? 'var(--status-success-bg)'
                    : 'var(--status-warning-bg)',
                color:
                  dlrSyncState.tone === 'success'
                    ? 'var(--status-success-ink)'
                    : 'var(--status-warning-ink)',
              }}
            >
              <span>{dlrSyncState.text}</span>
              <button
                type="button"
                onClick={() => setDlrSyncState({ syncingAll: false, checkingId: null })}
                className="min-h-[44px] px-2.5 text-[0.8125rem] underline shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}

      {/* Section 1: Summary of Costs per Recipient */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="hig-title-3">
              Cost Summary per Recipient ({filteredSummaries.length})
            </h2>
            <p className="hig-footnote mt-0.5">
              Grouped total SMS units billed and Naira spend per tenant or stakeholder recipient.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <SearchInput
              value={summarySearch}
              onChange={setSummarySearch}
              placeholder="Filter recipient, unit, or phone..."
              ariaLabel="Filter SMS recipient cost summary"
              className="w-full sm:w-64"
            />
            <ExportCsvButton
              onClick={handleExportSummaryCsv}
              disabled={filteredSummaries.length === 0}
              count={filteredSummaries.length}
              label="Export Summary CSV"
            />
          </div>
        </div>

        <div className="hig-card overflow-hidden">
          {/* Mobile Stacked Cards */}
          <div className="md:hidden divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {filteredSummaries.length === 0 ? (
              <p className="py-8 px-4 text-center hig-subhead">
                No recipient SMS cost records match your filter.
              </p>
            ) : (
              filteredSummaries.map((s) => (
                <div key={s.key} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="hig-headline block truncate">{s.recipientName}</span>
                      <span className="hig-footnote font-mono-nums block">
                        {s.recipientContact} {s.unitCode ? `· ${s.unitCode}` : ''}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="hig-headline font-mono-nums block">
                        {formatNaira(s.totalCostNaira)}
                      </span>
                      <span className="hig-caption font-mono-nums">
                        {s.billableUnits} unit(s)
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <StatusBadge label={s.recipientRole} tone="neutral" />
                    <span className="text-[0.8125rem] font-mono-nums text-[var(--ink-secondary)]">
                      <span style={{ color: 'var(--status-success-ink)' }} className="font-semibold">
                        {s.deliveredCount} Deliv
                      </span>
                      {' · '}
                      {s.sentCount} Sent
                      {s.queuedCount > 0 && ` · ${s.queuedCount} Queued`}
                      {s.failedCount > 0 && (
                        <span style={{ color: 'var(--status-danger-ink)' }}>
                          {' · '}
                          {s.failedCount} Failed
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="hig-caption font-mono-nums">
                      Last: {formatDateTimeShort(s.lastActivityAt)}
                    </span>
                    <button
                      type="button"
                      onClick={() => openSmsComposerForSummary(s)}
                      className="hig-btn-secondary"
                    >
                      <Send className="w-4 h-4" />
                      <span>SMS</span>
                    </button>
                  </div>
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
                  <th className="py-3 px-5">Recipient & Phone</th>
                  <th className="py-3 px-4">Unit</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Delivery Breakdown</th>
                  <th className="py-3 px-4 text-right">SMS Units</th>
                  <th className="py-3 px-4 text-right">Total Cost (₦)</th>
                  <th className="py-3 px-4">Last Activity</th>
                  <th className="py-3 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y text-[0.875rem]" style={{ borderColor: 'var(--border-subtle)' }}>
                {filteredSummaries.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center hig-subhead">
                      No recipient SMS cost records match your filter.
                    </td>
                  </tr>
                ) : (
                  filteredSummaries.map((s) => (
                    <tr key={s.key} className="hover:bg-[var(--bg-hover)]">
                      <td className="py-3 px-5">
                        <span className="font-semibold text-[var(--ink-primary)] block">
                          {s.recipientName}
                        </span>
                        <span className="hig-footnote font-mono-nums">
                          {s.recipientContact}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono-nums text-[0.8125rem] text-[var(--ink-secondary)]">
                        {s.unitCode || '—'}
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge label={s.recipientRole} tone="neutral" />
                      </td>
                      <td className="py-3 px-4 text-[0.8125rem] font-mono-nums text-[var(--ink-secondary)]">
                        <span
                          className="font-semibold"
                          style={{ color: 'var(--status-success-ink)' }}
                        >
                          {s.deliveredCount} Deliv
                        </span>
                        {' · '}
                        <span>{s.sentCount} Sent</span>
                        {s.queuedCount > 0 && ` · ${s.queuedCount} Queued`}
                        {s.failedCount > 0 && (
                          <span style={{ color: 'var(--status-danger-ink)' }}>
                            {' · '}
                            {s.failedCount} Failed
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-nums font-medium text-[var(--ink-primary)]">
                        {s.billableUnits}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-nums font-semibold text-[var(--ink-primary)]">
                        {formatNaira(s.totalCostNaira)}
                      </td>
                      <td className="py-3 px-4 hig-footnote font-mono-nums whitespace-nowrap">
                        {formatDateTimeShort(s.lastActivityAt)}
                      </td>
                      <td className="py-3 px-5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openSmsComposerForSummary(s)}
                          className="inline-flex items-center gap-1 min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--ink-primary)] text-[0.8125rem] font-medium hover:bg-[var(--bg-surface-secondary)]"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>SMS</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Section 2: Sent SMS History & Delivery Status */}
      <section className="space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="hig-segmented w-full sm:w-fit" role="tablist">
            {(['All', 'Delivered', 'Sent', 'Queued', 'Failed'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={statusFilter === tab}
                data-active={statusFilter === tab}
                onClick={() => setStatusFilter(tab)}
                className="hig-segmented-item"
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <SearchInput
              value={historySearch}
              onChange={setHistorySearch}
              placeholder="Search message text, MsgID, unit, or tenant..."
              ariaLabel="Search SMS activity history"
              className="w-full sm:w-72"
            />
            <ExportCsvButton
              onClick={handleExportHistoryCsv}
              disabled={filteredHistory.length === 0}
              count={filteredHistory.length}
              label="Export History CSV"
            />
          </div>
        </div>

        <div className="hig-card overflow-hidden">
          {/* Mobile Stacked Cards */}
          <div className="md:hidden divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {filteredHistory.length === 0 ? (
              <p className="py-10 px-4 text-center hig-subhead">
                No SMS activity entries match your current filter.
              </p>
            ) : (
              filteredHistory.map((n) => {
                const unitCode = resolveLinkedUnitCode(n);
                const { segmentCount, billableUnits } = getSmsRecordUnits(n);
                const costNaira = getSmsRecordCostNaira(n, effectiveUnitCost);
                const isFailed =
                  n.status === 'Failed' ||
                  n.status === 'Retry Pending' ||
                  n.status === 'Exhausted / Action Required';

                return (
                  <div key={n.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="hig-headline block truncate">
                          {n.recipientName}
                          {unitCode ? ` (${unitCode})` : ''}
                        </span>
                        <span className="hig-footnote font-mono-nums block">
                          {n.recipientContact} · {n.recipientRole}
                        </span>
                        <span className="hig-caption font-mono-nums block mt-0.5">
                          {formatDateTimeShort(n.attemptedAt || n.scheduledAt)} · {n.eventType}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <StatusBadge label={n.status} />
                        <span className="hig-subhead font-mono-nums font-semibold text-[var(--ink-primary)] block mt-1">
                          {formatNaira(costNaira)}
                        </span>
                        <span className="hig-caption font-mono-nums">
                          {billableUnits > 0
                            ? `${billableUnits} unit${billableUnits === 1 ? '' : 's'}`
                            : `${segmentCount} seg (0 billed)`}
                        </span>
                      </div>
                    </div>

                    <p className="text-[0.875rem] text-[var(--ink-secondary)] line-clamp-2 leading-relaxed">
                      {n.messageBody}
                    </p>

                    {n.failureReason && (
                      <p className="hig-footnote" style={{ color: 'var(--status-danger-ink)' }}>
                        {n.failureReason}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setPreviewRecord(n)}
                        aria-label={`View SMS message to ${n.recipientName}`}
                        className="flex-1 hig-btn-secondary"
                      >
                        <Eye className="w-4 h-4" />
                        <span>View</span>
                      </button>

                      {n.externalMessageId && (
                        <button
                          type="button"
                          onClick={() => void handleRefreshSingleDlr(n)}
                          disabled={dlrSyncState.checkingId === n.id}
                          className="flex-1 hig-btn-secondary"
                        >
                          {dlrSyncState.checkingId === n.id ? 'Checking...' : 'Check DLR'}
                        </button>
                      )}

                      {isFailed && (
                        <button
                          type="button"
                          onClick={() => retryNotification(n.id, true)}
                          className="flex-1 hig-btn-primary"
                        >
                          <RotateCw className="w-4 h-4" />
                          <span>Retry</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
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
                  <th className="py-3 px-5">Time & Event</th>
                  <th className="py-3 px-4">Recipient</th>
                  <th className="py-3 px-4">Gateway & MsgID</th>
                  <th className="py-3 px-4 min-w-[220px]">SMS Content</th>
                  <th className="py-3 px-4 text-right">Units & Cost</th>
                  <th className="py-3 px-4">Delivery Status</th>
                  <th className="py-3 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y text-[0.875rem]" style={{ borderColor: 'var(--border-subtle)' }}>
                {filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center hig-subhead">
                      No SMS activity entries match your current filter.
                    </td>
                  </tr>
                ) : (
                  filteredHistory.map((n) => {
                    const unitCode = resolveLinkedUnitCode(n);
                    const { segmentCount, billableUnits } = getSmsRecordUnits(n);
                    const costNaira = getSmsRecordCostNaira(n, effectiveUnitCost);
                    const isFailed =
                      n.status === 'Failed' ||
                      n.status === 'Retry Pending' ||
                      n.status === 'Exhausted / Action Required';

                    return (
                      <tr key={n.id} className="hover:bg-[var(--bg-hover)]">
                        <td className="py-3.5 px-5 align-top whitespace-nowrap">
                          <span className="font-mono-nums text-[0.8125rem] text-[var(--ink-primary)] block">
                            {formatDateTimeShort(n.attemptedAt || n.scheduledAt)}
                          </span>
                          <span className="hig-caption block mt-0.5">{n.eventType}</span>
                        </td>
                        <td className="py-3.5 px-4 align-top">
                          <span className="font-semibold text-[var(--ink-primary)] block">
                            {n.recipientName}
                            {unitCode ? ` (${unitCode})` : ''}
                          </span>
                          <span className="hig-footnote font-mono-nums">
                            {n.recipientContact} · {n.recipientRole}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 align-top text-[0.8125rem]">
                          <span className="font-medium text-[var(--ink-primary)] block">
                            {n.deliveryProvider || 'Ledger Only'}
                          </span>
                          <span className="font-mono-nums hig-caption block">
                            {n.externalMessageId ? `ID: ${n.externalMessageId}` : 'Local Ref'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 align-top max-w-[300px]">
                          <p className="text-[0.8125rem] text-[var(--ink-secondary)] line-clamp-2 leading-relaxed">
                            {n.messageBody}
                          </p>
                          {n.failureReason && (
                            <p
                              className="hig-caption mt-1"
                              style={{ color: 'var(--status-danger-ink)' }}
                            >
                              {n.failureReason}
                            </p>
                          )}
                        </td>
                        <td className="py-3.5 px-4 align-top text-right whitespace-nowrap">
                          <span className="font-mono-nums font-semibold text-[var(--ink-primary)] block">
                            {formatNaira(costNaira)}
                          </span>
                          <span className="font-mono-nums hig-caption">
                            {billableUnits > 0
                              ? `${billableUnits} unit${billableUnits === 1 ? '' : 's'}`
                              : `${segmentCount} seg (0 billed)`}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 align-top whitespace-nowrap">
                          <StatusBadge label={n.status} />
                        </td>
                        <td className="py-3.5 px-5 align-top text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setPreviewRecord(n)}
                              aria-label={`View SMS message to ${n.recipientName}`}
                              className="inline-flex items-center gap-1 min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--bg-surface-secondary)] text-[var(--ink-primary)] text-[0.8125rem] font-medium hover:bg-[var(--bg-surface-tertiary)]"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View</span>
                            </button>

                            {n.externalMessageId && (
                              <button
                                type="button"
                                onClick={() => void handleRefreshSingleDlr(n)}
                                disabled={dlrSyncState.checkingId === n.id}
                                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--ink-primary)] text-[0.8125rem] font-medium hover:bg-[var(--bg-surface-secondary)]"
                              >
                                {dlrSyncState.checkingId === n.id ? 'Checking...' : 'Check DLR'}
                              </button>
                            )}

                            {isFailed && (
                              <button
                                type="button"
                                onClick={() => retryNotification(n.id, true)}
                                className="inline-flex items-center gap-1 min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-[0.8125rem] font-semibold hover:bg-[var(--accent-hover)]"
                              >
                                <RotateCw className="w-3.5 h-3.5" />
                                <span>Retry</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* SMS Detail Preview Modal */}
      {previewRecord && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/45 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sms-detail-modal-title"
        >
          <div
            className="w-full max-w-lg rounded-2xl border overflow-hidden max-h-[92vh] flex flex-col"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-hairline)',
              boxShadow: 'var(--shadow-sheet)',
            }}
          >
            <div
              className="px-5 py-4 border-b flex items-center justify-between gap-3"
              style={{ borderColor: 'var(--border-hairline)' }}
            >
              <div className="min-w-0">
                <h3 id="sms-detail-modal-title" className="hig-headline">
                  SMS Delivery Detail
                </h3>
                <p className="hig-footnote truncate">
                  To {previewRecord.recipientName} · {previewRecord.recipientContact}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewRecord(null)}
                className="hig-touch-icon shrink-0"
                aria-label="Close SMS detail"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[0.8125rem]">
                <div className="hig-card-inset p-3.5">
                  <span className="hig-caption uppercase tracking-[0.03em] block">
                    Status & Provider
                  </span>
                  <div className="mt-1.5 flex items-center gap-2">
                    <StatusBadge label={previewRecord.status} />
                    <span className="text-[var(--ink-secondary)]">
                      {previewRecord.deliveryProvider || 'Ledger'}
                    </span>
                  </div>
                </div>
                <div className="hig-card-inset p-3.5">
                  <span className="hig-caption uppercase tracking-[0.03em] block">
                    Units & Cost
                  </span>
                  <p className="mt-1.5 font-mono-nums font-semibold text-[var(--ink-primary)]">
                    {getSmsRecordUnits(previewRecord).billableUnits} unit(s) ·{' '}
                    {formatNaira(getSmsRecordCostNaira(previewRecord, effectiveUnitCost))}
                  </p>
                </div>
              </div>

              <div>
                <span className="hig-caption uppercase tracking-[0.03em] block mb-1.5">
                  Message Content
                </span>
                <pre className="whitespace-pre-wrap font-sans text-[0.875rem] text-[var(--ink-primary)] p-4 hig-card-inset leading-relaxed">
                  {previewRecord.messageBody}
                </pre>
              </div>

              {previewRecord.externalMessageId && (
                <p className="hig-footnote font-mono-nums">
                  BulkSMSLive MsgID: {previewRecord.externalMessageId}
                </p>
              )}

              <div className="flex flex-wrap justify-end gap-2.5 pt-2">
                {previewRecord.externalMessageId && (
                  <button
                    type="button"
                    onClick={() => void handleRefreshSingleDlr(previewRecord)}
                    className="hig-btn-secondary"
                  >
                    Refresh DLR
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const rec = previewRecord;
                    setPreviewRecord(null);
                    openComposerFor({
                      channelMode: 'SMS',
                      smsBody: rec.messageBody,
                      directoryRecipientIds: rec.tenantId
                        ? [`tenant:${rec.tenantId}`]
                        : undefined,
                      linkedTenantId: rec.tenantId,
                    });
                  }}
                  className="hig-btn-primary"
                >
                  <Send className="w-4 h-4" />
                  <span>Resend in Composer</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
