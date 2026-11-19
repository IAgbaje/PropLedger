import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BellOff,
  BellRing,
  Calendar,
  CalendarClock,
  CheckCircle2,
  Download,
  ExternalLink,
  Mail,
  Play,
  Plus,
  RotateCw,
  Send,
  Settings2,
  Sparkles,
  X,
} from 'lucide-react';
import { useIntegrations } from '../context/IntegrationContext';
import { useRentalStore } from '../context/RentalStore';
import type { EmailClientProvider, NotificationRecord } from '../types/rental';
import { exportFilteredCsv } from '../utils/csvExport';
import {
  downloadEmlFile,
  fetchAiFollowUpSuggestions,
  fetchBulkSmsBalance,
  fetchBulkSmsDeliveryReport,
  openMailClientDraft,
  sendEmailViaGmail,
  sendEmailViaSmtp,
  sendSmsViaGateway,
  verifyServerSmtp,
  type AiFollowUpSuggestion,
} from '../utils/emailClient';
import { formatDateTimeShort } from '../utils/format';
import {
  extractBulkSmsDlrMatch,
  getSmsRecordCostNaira,
  getSmsRecordUnits,
} from '../utils/smsAnalytics';
import { GoogleSignInButton } from './GoogleSignInButton';
import { StatusBadge } from './StatusBadge';
import { ExportCsvButton, SearchInput } from './TableToolbarControls';

export function NotificationsView() {
  const {
    state,
    computedObligations,
    evaluatedCommitments,
    effectiveReceipts,
    dueScheduledNotifications,
    scheduledCount,
    retryNotification,
    updateNotificationRecord,
    cancelScheduledNotification,
    rescheduleNotification,
    runScheduledReminders,
    updateSettings,
    openComposerFor,
    openCalendarSyncFor,
  } = useRentalStore();

  const {
    status: integrationStatus,
    gmailUser,
    gmailAccessToken,
    isGmailConnected,
    isGmailSigningIn,
    gmailError,
    connectGmail,
    disconnectGmail,
    clearGmailSessionToken,
  } = useIntegrations();

  const [channelFilter, setChannelFilter] = useState<
    'All' | 'Email' | 'SMS' | 'Scheduled' | 'Failed'
  >('All');
  const [search, setSearch] = useState('');
  const [previewNotif, setPreviewNotif] = useState<NotificationRecord | null>(null);
  const [batchFeedback, setBatchFeedback] = useState<string>('');
  const [showIntegrationConfig, setShowIntegrationConfig] = useState(false);

  // SMTP verification feedback
  const [smtpTestState, setSmtpTestState] = useState<{
    loading: boolean;
    message?: string;
    ok?: boolean;
  }>({ loading: false });

  // BulkSMSLive balance & DLR lookup state
  const [smsBalanceState, setSmsBalanceState] = useState<{
    loading: boolean;
    message?: string;
    ok?: boolean;
  }>({ loading: false });
  const [dlrCheckingId, setDlrCheckingId] = useState<string | null>(null);

  // Confirmation dialog for sending queued/retry items via Gmail or SMTP
  const [confirmQueueItems, setConfirmQueueItems] = useState<NotificationRecord[] | null>(null);
  const [isDispatchingQueue, setIsDispatchingQueue] = useState(false);

  // Reschedule modal
  const [rescheduleTarget, setRescheduleTarget] = useState<NotificationRecord | null>(null);
  const [rescheduleInput, setRescheduleInput] = useState('');

  // AI Follow-Up Suggestions modal
  const [aiFollowUpOpen, setAiFollowUpOpen] = useState(false);
  const [aiFollowUpLoading, setAiFollowUpLoading] = useState(false);
  const [aiFollowUpError, setAiFollowUpError] = useState('');
  const [aiSuggestions, setAiSuggestions] = useState<AiFollowUpSuggestion[]>([]);

  const failedCount = useMemo(
    () =>
      state.notifications.filter(
        (n) =>
          n.status === 'Failed' ||
          n.status === 'Retry Pending' ||
          n.status === 'Exhausted / Action Required'
      ).length,
    [state.notifications]
  );

  const resolveLinkedMeta = (n: NotificationRecord) => {
    const tenant = n.tenantId ? state.tenants.find((t) => t.id === n.tenantId) : undefined;
    let unitId: string | undefined;

    const receipt = state.receiptRequests.find((r) => r.id === n.relatedRecordId);
    if (receipt) unitId = receipt.unitId;
    if (!unitId) {
      const payment = state.payments.find((p) => p.id === n.relatedRecordId);
      if (payment) unitId = payment.unitId;
    }
    if (!unitId) {
      const ob = state.obligations.find((o) => o.id === n.relatedRecordId);
      if (ob) unitId = ob.unitId;
    }
    if (!unitId) {
      const ag = state.agreements.find((a) => a.id === n.relatedRecordId);
      if (ag) unitId = ag.unitId;
    }
    if (!unitId && n.tenantId) {
      const activeAg =
        state.agreements.find((a) => a.tenantId === n.tenantId && a.status === 'Active') ||
        state.agreements.find((a) => a.tenantId === n.tenantId);
      if (activeAg) unitId = activeAg.unitId;
    }

    const unit = unitId ? state.units.find((u) => u.id === unitId) : undefined;
    return { tenant, unit };
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.notifications.filter((n) => {
      if (channelFilter === 'Email' && n.channel !== 'Email') return false;
      if (channelFilter === 'SMS' && n.channel !== 'SMS') return false;
      if (channelFilter === 'Scheduled' && n.status !== 'Queued') return false;
      if (
        channelFilter === 'Failed' &&
        n.status !== 'Failed' &&
        n.status !== 'Retry Pending' &&
        n.status !== 'Exhausted / Action Required'
      ) {
        return false;
      }

      if (q) {
        const { tenant, unit } = resolveLinkedMeta(n);
        const searchable =
          `${n.eventType} ${n.recipientName} ${n.recipientRole} ${n.recipientContact} ${
            n.subject || ''
          } ${n.messageBody} ${n.status} ${n.deliveryProvider || ''} ${
            tenant ? `${tenant.firstName} ${tenant.lastName}` : ''
          } ${unit ? `${unit.code} ${unit.name}` : ''}`.toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      return true;
    });
  }, [
    state.notifications,
    state.tenants,
    state.units,
    state.receiptRequests,
    state.payments,
    state.obligations,
    state.agreements,
    channelFilter,
    search,
  ]);

  const handleExportCsv = () => {
    exportFilteredCsv(
      `propledger-notifications-${state.referenceDate}.csv`,
      [
        'Event Type',
        'Scheduled / Attempted Time',
        'Recipient Name',
        'Recipient Role',
        'Recipient Contact',
        'Related Tenant',
        'Unit Code',
        'Channel',
        'Provider',
        'Status',
        'Retry Count',
        'Failure Reason',
        'Subject',
      ],
      filtered.map((n) => {
        const { tenant, unit } = resolveLinkedMeta(n);
        return [
          n.eventType,
          n.attemptedAt || n.scheduledAt,
          n.recipientName,
          n.recipientRole,
          n.recipientContact,
          tenant ? `${tenant.firstName} ${tenant.lastName}` : '',
          unit?.code || '',
          n.channel,
          n.deliveryProvider || '',
          n.status,
          n.retryCount,
          n.failureReason || '',
          n.subject || '',
        ];
      })
    );
  };

  const handleRunSchedule = () => {
    const res = runScheduledReminders();
    setBatchFeedback(res.message);
  };

  const handleVerifySmtp = async () => {
    setSmtpTestState({ loading: true });
    const res = await verifyServerSmtp();
    setSmtpTestState({
      loading: false,
      ok: res.ok,
      message: res.ok
        ? `SMTP connected (${res.host} · from ${res.from}).`
        : res.error || 'SMTP verification failed.',
    });
  };

  const handleCheckSmsBalance = async () => {
    setSmsBalanceState({ loading: true });
    const res = await fetchBulkSmsBalance();
    setSmsBalanceState({
      loading: false,
      ok: res.ok,
      message: res.ok
        ? `BulkSMSLive Balance: ${res.balance} unit(s)`
        : res.error || 'Unable to check BulkSMSLive balance.',
    });
  };

  const handleCheckSmsDlr = async (n: NotificationRecord) => {
    if (!n.externalMessageId) return;
    setDlrCheckingId(n.id);
    try {
      const res = await fetchBulkSmsDeliveryReport({ msgids: n.externalMessageId });
      const { nextStatus, rawLabel } = extractBulkSmsDlrMatch(res.reports, n.externalMessageId);
      const updatedStatus = nextStatus || n.status;
      updateNotificationRecord(
        n.id,
        {
          status: updatedStatus,
          failureReason: updatedStatus === 'Failed' ? `BulkSMSLive DLR: ${rawLabel}` : undefined,
        },
        'SMS Delivery Report Checked',
        `BulkSMSLive DLR for ${n.recipientName} (${n.externalMessageId}): ${rawLabel}`
      );
      setBatchFeedback(`DLR for ${n.recipientName} (${n.externalMessageId}): ${rawLabel}`);
    } catch (err) {
      setBatchFeedback(
        err instanceof Error ? err.message : 'Unable to fetch BulkSMSLive delivery report.'
      );
    } finally {
      setDlrCheckingId(null);
    }
  };

  const handleDispatchConfirmedItems = async () => {
    if (!confirmQueueItems || confirmQueueItems.length === 0) return;
    setIsDispatchingQueue(true);

    let sentOk = 0;
    let failed = 0;
    let firstError = '';

    for (const item of confirmQueueItems) {
      if (item.channel === 'Email') {
        const useSmtp =
          state.settings.preferredEmailProvider === 'smtp' &&
          Boolean(integrationStatus?.smtpConfigured);
        const useGmail = !useSmtp && Boolean(gmailAccessToken);

        if (useGmail) {
          try {
            const gRes = await sendEmailViaGmail(gmailAccessToken!, {
              from: gmailUser?.email || state.property.managerEmail,
              to: item.recipientContact,
              subject: item.subject || `Message from ${state.property.name}`,
              body: item.messageBody,
              replyTo: state.property.managerEmail,
            });
            updateNotificationRecord(
              item.id,
              {
                status: 'Delivered',
                attemptedAt: new Date().toISOString(),
                deliveryProvider: 'Gmail',
                externalMessageId: gRes.messageId,
                failureReason: undefined,
              },
              'Email Sent via Gmail',
              `Dispatched Email to ${item.recipientName} via Gmail (${gRes.messageId || 'ok'}).`
            );
            sentOk++;
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Gmail dispatch failed';
            if (msg.includes('401') || msg.toLowerCase().includes('unauthorized')) {
              clearGmailSessionToken();
            }
            if (!firstError) firstError = msg;
            failed++;
            updateNotificationRecord(
              item.id,
              {
                status: 'Failed',
                attemptedAt: new Date().toISOString(),
                deliveryProvider: 'Gmail',
                retryCount: item.retryCount + 1,
                failureReason: msg,
              },
              'Gmail Dispatch Failed',
              `Failed sending Email to ${item.recipientName}: ${msg}`
            );
          }
        } else if (useSmtp) {
          try {
            const sRes = await sendEmailViaSmtp({
              to: item.recipientContact,
              subject: item.subject || `Message from ${state.property.name}`,
              body: item.messageBody,
              replyTo: state.property.managerEmail,
            });
            updateNotificationRecord(
              item.id,
              {
                status: 'Delivered',
                attemptedAt: new Date().toISOString(),
                deliveryProvider: 'SMTP',
                externalMessageId: sRes.messageId,
                failureReason: undefined,
              },
              'Email Sent via SMTP',
              `Dispatched Email to ${item.recipientName} via Server SMTP.`
            );
            sentOk++;
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'SMTP dispatch failed';
            if (!firstError) firstError = msg;
            failed++;
            updateNotificationRecord(
              item.id,
              {
                status: 'Failed',
                attemptedAt: new Date().toISOString(),
                deliveryProvider: 'SMTP',
                retryCount: item.retryCount + 1,
                failureReason: msg,
              },
              'SMTP Dispatch Failed',
              `Failed sending Email via SMTP to ${item.recipientName}: ${msg}`
            );
          }
        } else {
          openMailClientDraft({
            to: item.recipientContact,
            subject: item.subject,
            body: item.messageBody,
          });
          updateNotificationRecord(
            item.id,
            {
              status: 'Sent',
              attemptedAt: new Date().toISOString(),
              deliveryProvider: 'Mailto / EML',
              failureReason: undefined,
            },
            'Opened in Mail App',
            `Opened email draft for ${item.recipientName} in local Mail App.`
          );
          sentOk++;
        }
      } else {
        try {
          const smsRes = await sendSmsViaGateway({
            to: item.recipientContact,
            message: item.messageBody,
            reference: item.id,
          });
          const parsedUnits = smsRes.units !== undefined ? Number(smsRes.units) : NaN;
          const effectiveUnits =
            Number.isFinite(parsedUnits) && parsedUnits > 0
              ? parsedUnits
              : getSmsRecordUnits({
                  status: 'Sent',
                  messageBody: item.messageBody,
                }).billableUnits;
          const costNaira = getSmsRecordCostNaira(
            {
              status: 'Sent',
              messageBody: item.messageBody,
              smsUnits: effectiveUnits,
            },
            state.settings.smsUnitCostNaira
          );
          updateNotificationRecord(
            item.id,
            {
              status: 'Sent',
              attemptedAt: new Date().toISOString(),
              deliveryProvider: smsRes.provider,
              externalMessageId: smsRes.messageId,
              smsUnits: effectiveUnits,
              smsCostNaira: costNaira,
              failureReason: undefined,
            },
            'SMS Dispatched',
            `Dispatched SMS to ${item.recipientName} (${smsRes.provider}).`
          );
          sentOk++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'SMS dispatch failed';
          if (!firstError) firstError = msg;
          failed++;
          updateNotificationRecord(
            item.id,
            {
              status: 'Failed',
              attemptedAt: new Date().toISOString(),
              deliveryProvider: 'SMS Gateway',
              retryCount: item.retryCount + 1,
              failureReason: msg,
            },
            'SMS Dispatch Failed',
            `Failed sending SMS to ${item.recipientName}: ${msg}`
          );
        }
      }
    }

    setIsDispatchingQueue(false);
    setConfirmQueueItems(null);
    setBatchFeedback(
      failed > 0
        ? `Dispatched ${sentOk} message(s); ${failed} failed (${firstError}).`
        : `Successfully dispatched ${sentOk} message(s).`
    );
  };

  const handleOpenAiFollowUps = async () => {
    setAiFollowUpOpen(true);
    setAiFollowUpError('');
    setAiSuggestions([]);
    setAiFollowUpLoading(true);

    try {
      const openArrears = computedObligations
        .filter((co) => co.amountOutstanding > 0 && co.dueDatePosition !== 'Upcoming')
        .map((co) => {
          const tenant = state.tenants.find((t) => t.id === co.obligation.tenantId);
          const unit = state.units.find((u) => u.id === co.obligation.unitId);
          return {
            tenantId: co.obligation.tenantId,
            tenantName: tenant ? `${tenant.firstName} ${tenant.lastName}` : '',
            unitCode: unit?.code,
            period: co.obligation.rentalPeriodLabel,
            dueDate: co.obligation.dueDate,
            daysPastDue: co.daysPastDue,
            outstandingAmountNaira: co.amountOutstanding,
            notificationsPaused: tenant?.notificationsPaused ?? false,
          };
        });

      const breachedCommitments = evaluatedCommitments
        .filter((ec) => ec.effectiveStatus === 'Breached' || ec.effectiveStatus === 'Partially Fulfilled')
        .map((ec) => {
          const tenant = state.tenants.find((t) => t.id === ec.commitment.tenantId);
          return {
            tenantId: ec.commitment.tenantId,
            tenantName: tenant ? `${tenant.firstName} ${tenant.lastName}` : '',
            status: ec.effectiveStatus,
            promisedAmountNaira: ec.commitment.promisedAmount,
            paidSoFarNaira: ec.amountPaidTowardsObligations,
            deadline: ec.commitment.extendedUntilDate || ec.commitment.promisedDate,
          };
        });

      const overdueReceipts = effectiveReceipts
        .filter((r) => r.status === 'Overdue')
        .map((r) => {
          const issuer = state.contacts.find((c) => c.id === r.issuerContactId);
          return {
            issuerContactId: r.issuerContactId,
            issuerName: issuer?.name || 'Receipt Issuer',
            paymentRef: r.paymentRef,
            amountNaira: r.amount,
            slaDeadline: r.slaDeadlineAt,
          };
        });

      const res = await fetchAiFollowUpSuggestions({
        propertyContext: {
          propertyName: state.property.name,
          managerName: state.property.managerName,
          referenceDate: state.referenceDate,
        },
        openArrears,
        breachedCommitments,
        overdueReceipts,
      });

      setAiSuggestions(res.suggestions || []);
    } catch (err) {
      setAiFollowUpError(
        err instanceof Error ? err.message : 'Unable to fetch AI follow-up suggestions.'
      );
    } finally {
      setAiFollowUpLoading(false);
    }
  };

  const loadAiSuggestionIntoComposer = (s: AiFollowUpSuggestion) => {
    const matchedTenant =
      state.tenants.find(
        (t) =>
          t.id === s.targetId ||
          `${t.firstName} ${t.lastName}`.toLowerCase() === s.recipientName.toLowerCase()
      ) || undefined;
    const matchedContact =
      !matchedTenant
        ? state.contacts.find(
            (c) =>
              c.id === s.targetId || c.name.toLowerCase() === s.recipientName.toLowerCase()
          )
        : undefined;

    const dirIds = matchedTenant
      ? [matchedTenant.id]
      : matchedContact
      ? [matchedContact.id]
      : [];

    setAiFollowUpOpen(false);
    openComposerFor({
      directoryRecipientIds: dirIds,
      channelMode:
        s.recommendedChannels === 'Email'
          ? 'Email'
          : s.recommendedChannels === 'SMS'
          ? 'SMS'
          : 'Both',
      subject: s.subject,
      emailBody: s.emailBody,
      smsBody: s.smsBody,
      linkedTenantId: matchedTenant?.id,
      intent: s.targetType === 'Lawyer' ? 'Lawyer Brief / Legal Demand' : 'Rent Reminder',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="hig-title-1">Notifications, Messaging & Integrations</h1>
          <p className="hig-callout mt-1">
            Send or schedule custom SMS & Emails, draft with AI, and manage Gmail/SMTP dispatch. Quiet hours: {state.settings.quietHoursStart}–{state.settings.quietHoursEnd} WAT.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => openComposerFor()}
            className="hig-btn-primary whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Compose / Schedule SMS & Email</span>
          </button>

          <button
            type="button"
            onClick={() => openCalendarSyncFor()}
            className="hig-btn-secondary whitespace-nowrap"
          >
            <Calendar className="w-4 h-4" />
            <span>Google Calendar</span>
          </button>

          <button
            type="button"
            onClick={handleOpenAiFollowUps}
            className="hig-btn-secondary whitespace-nowrap"
          >
            <Sparkles className="w-4 h-4" />
            <span>AI Suggest Follow-Ups</span>
          </button>

          <button
            type="button"
            onClick={handleRunSchedule}
            className="hig-btn-secondary whitespace-nowrap"
          >
            <Play className="w-4 h-4" />
            <span>Process Reminders</span>
          </button>

          <button
            type="button"
            onClick={() =>
              updateSettings(
                { globalNotificationsPaused: !state.settings.globalNotificationsPaused },
                'Toggled global notification pause from Notifications view'
              )
            }
            className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[0.875rem] font-medium transition-colors whitespace-nowrap"
            style={
              state.settings.globalNotificationsPaused
                ? {
                    backgroundColor: 'var(--status-warning-bg)',
                    color: 'var(--status-warning-ink)',
                  }
                : {
                    backgroundColor: 'var(--bg-surface-secondary)',
                    color: 'var(--ink-primary)',
                  }
            }
          >
            {state.settings.globalNotificationsPaused ? (
              <>
                <BellRing className="w-4 h-4" />
                <span>Resume Dispatch</span>
              </>
            ) : (
              <>
                <BellOff className="w-4 h-4" />
                <span>Pause All</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Email Client & AI Integration Hub */}
      <section className="hig-card p-4 sm:p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-[var(--accent-ink)]" />
              <span className="hig-headline">Email Client & Dispatch Integrations</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                label={isGmailConnected ? `Gmail: ${gmailUser?.email || 'Connected'}` : 'Gmail: Not Signed In'}
                tone={isGmailConnected ? 'success' : 'neutral'}
                showDot
              />
              <StatusBadge
                label={isGmailConnected ? 'Google Calendar: Ready' : 'Calendar: Sign-In Needed'}
                tone={isGmailConnected ? 'success' : 'neutral'}
                showDot
              />
              <StatusBadge
                label={
                  integrationStatus?.smtpConfigured
                    ? `SMTP: ${integrationStatus.smtpHost}`
                    : 'SMTP: Env Not Set'
                }
                tone={integrationStatus?.smtpConfigured ? 'success' : 'neutral'}
                showDot
              />
              <StatusBadge
                label={
                  integrationStatus?.aiConfigured
                    ? 'Gemini AI: Ready'
                    : 'Gemini AI: Key Missing'
                }
                tone={integrationStatus?.aiConfigured ? 'success' : 'warning'}
                showDot
              />
              <StatusBadge
                label={
                  integrationStatus?.bulkSmsConfigured
                    ? `SMS: BulkSMSLive (${integrationStatus.bulkSmsSenderName || 'PropLedger'})`
                    : integrationStatus?.smsWebhookConfigured
                    ? 'SMS Gateway: Connected'
                    : 'SMS: Ledger Mode'
                }
                tone={integrationStatus?.smsWebhookConfigured ? 'success' : 'neutral'}
                showDot={Boolean(integrationStatus?.smsWebhookConfigured)}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {isGmailConnected ? (
              <button
                type="button"
                onClick={() => void disconnectGmail()}
                className="hig-btn-secondary"
              >
                Disconnect Gmail
              </button>
            ) : (
              <GoogleSignInButton
                onClick={() => void connectGmail()}
                loading={isGmailSigningIn}
              />
            )}

            <button
              type="button"
              onClick={() => void handleCheckSmsBalance()}
              disabled={smsBalanceState.loading}
              className="hig-btn-secondary"
            >
              <span>{smsBalanceState.loading ? 'Checking...' : 'Check SMS Units'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowIntegrationConfig((v) => !v)}
              className="hig-btn-secondary"
            >
              <Settings2 className="w-4 h-4" />
              <span>{showIntegrationConfig ? 'Hide Rules' : 'Auto-Send Rules'}</span>
            </button>
          </div>
        </div>

        {smsBalanceState.message && (
          <div
            className="p-3 rounded-xl text-[0.875rem]"
            style={{
              backgroundColor: smsBalanceState.ok ? 'var(--status-success-bg)' : 'var(--status-warning-bg)',
              color: smsBalanceState.ok ? 'var(--status-success-ink)' : 'var(--status-warning-ink)',
            }}
          >
            {smsBalanceState.message}
          </div>
        )}

        {gmailError && (
          <div
            className="p-3 rounded-xl text-[0.875rem]"
            style={{
              backgroundColor: 'var(--status-danger-bg)',
              color: 'var(--status-danger-ink)',
            }}
          >
            {gmailError}
          </div>
        )}

        {showIntegrationConfig && (
          <div
            className="pt-4 border-t grid grid-cols-1 lg:grid-cols-12 gap-4"
            style={{ borderColor: 'var(--border-hairline)' }}
          >
            <div className="lg:col-span-5 space-y-2.5">
              <label htmlFor="preferred-email-provider" className="block hig-footnote">
                Preferred Automated Email Client
              </label>
              <select
                id="preferred-email-provider"
                value={state.settings.preferredEmailProvider}
                onChange={(e) =>
                  updateSettings(
                    { preferredEmailProvider: e.target.value as EmailClientProvider },
                    'Updated preferred email client provider'
                  )
                }
                className="hig-input w-full"
              >
                <option value="gmail">Gmail (Google Workspace OAuth — Interactive Approval)</option>
                <option value="smtp">Server SMTP Relay (Outlook / Zoho / Custom Auto-Send)</option>
                <option value="mailto">Default Mail App / .eml Export</option>
                <option value="ledger-only">Ledger Logging Only</option>
              </select>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleVerifySmtp}
                  disabled={smtpTestState.loading}
                  className="hig-btn-secondary"
                >
                  {smtpTestState.loading ? 'Testing SMTP...' : 'Verify Server SMTP'}
                </button>
                {smtpTestState.message && (
                  <span
                    className="hig-footnote"
                    style={{
                      color: smtpTestState.ok ? 'var(--status-success-ink)' : 'var(--status-warning-ink)',
                    }}
                  >
                    {smtpTestState.message}
                  </span>
                )}
              </div>
            </div>

            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[0.875rem]">
              <label className="flex items-center gap-2.5 p-3 hig-card-inset cursor-pointer min-h-[44px]">
                <input
                  type="checkbox"
                  checked={state.settings.autoSendPaymentReceipts}
                  onChange={(e) =>
                    updateSettings(
                      { autoSendPaymentReceipts: e.target.checked },
                      'Updated auto-send payment receipt setting'
                    )
                  }
                  className="w-4 h-4 rounded shrink-0"
                />
                <span className="text-[var(--ink-primary)]">
                  Queue/send receipt requests & tenant confirmations on payment
                </span>
              </label>
              <label className="flex items-center gap-2.5 p-3 hig-card-inset cursor-pointer min-h-[44px]">
                <input
                  type="checkbox"
                  checked={state.settings.autoSendScheduledReminders}
                  onChange={(e) =>
                    updateSettings(
                      { autoSendScheduledReminders: e.target.checked },
                      'Updated auto-send scheduled reminders setting'
                    )
                  }
                  className="w-4 h-4 rounded shrink-0"
                />
                <span className="text-[var(--ink-primary)]">
                  Auto-dispatch scheduled rent reminders when SMTP ready
                </span>
              </label>
              <label className="flex items-center gap-2.5 p-3 hig-card-inset cursor-pointer min-h-[44px]">
                <input
                  type="checkbox"
                  checked={state.settings.autoSendCustomScheduled}
                  onChange={(e) =>
                    updateSettings(
                      { autoSendCustomScheduled: e.target.checked },
                      'Updated auto-send custom scheduled messages setting'
                    )
                  }
                  className="w-4 h-4 rounded shrink-0"
                />
                <span className="text-[var(--ink-primary)]">
                  Auto-dispatch scheduled custom SMS/Emails when due
                </span>
              </label>
              <label className="flex items-center gap-2.5 p-3 hig-card-inset cursor-pointer min-h-[44px]">
                <input
                  type="checkbox"
                  checked={state.settings.autoSendArrearsEscalations}
                  onChange={(e) =>
                    updateSettings(
                      { autoSendArrearsEscalations: e.target.checked },
                      'Updated auto-send arrears escalations setting'
                    )
                  }
                  className="w-4 h-4 rounded shrink-0"
                />
                <span className="text-[var(--ink-primary)]">
                  Include lawyer & backup escalations on arrears triggers
                </span>
              </label>
            </div>
          </div>
        )}
      </section>

      {/* Due Scheduled Queue Action Banner */}
      {dueScheduledNotifications.length > 0 && (
        <div
          className="p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          style={{
            backgroundColor: 'var(--status-warning-bg)',
            borderColor: 'color-mix(in srgb, var(--status-warning-ink) 28%, transparent)',
          }}
        >
          <div className="flex items-start gap-2.5">
            <CalendarClock
              className="w-5 h-5 shrink-0 mt-0.5"
              style={{ color: 'var(--status-warning-ink)' }}
            />
            <div>
              <p className="hig-headline">
                {dueScheduledNotifications.length} Scheduled / Queued Message(s) Due for Dispatch
              </p>
              <p className="hig-footnote mt-0.5">
                Review recipients and confirm before dispatching emails through your connected Gmail account or configured relay.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setConfirmQueueItems(dueScheduledNotifications)}
            className="hig-btn-primary whitespace-nowrap shrink-0"
          >
            <Send className="w-4 h-4" />
            <span>Approve & Send Due ({dueScheduledNotifications.length})</span>
          </button>
        </div>
      )}

      {batchFeedback && (
        <div className="hig-card-inset p-3.5 text-[0.875rem] text-[var(--ink-primary)] flex items-center justify-between gap-3">
          <span>{batchFeedback}</span>
          <button
            type="button"
            onClick={() => setBatchFeedback('')}
            className="min-h-[44px] px-3 hig-footnote hover:text-[var(--ink-primary)] shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filter Tabs + Search + CSV */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="hig-segmented w-full sm:w-fit" role="tablist">
          {(
            [
              { id: 'All', label: 'All' },
              { id: 'Email', label: 'Email' },
              { id: 'SMS', label: 'SMS' },
              {
                id: 'Scheduled',
                label: scheduledCount > 0 ? `Scheduled (${scheduledCount})` : 'Scheduled',
              },
              {
                id: 'Failed',
                label: failedCount > 0 ? `Failed (${failedCount})` : 'Failed',
              },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={channelFilter === tab.id}
              data-active={channelFilter === tab.id}
              onClick={() => setChannelFilter(tab.id)}
              className="hig-segmented-item"
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search unit number, tenant, or recipient..."
            ariaLabel="Search notifications by unit number, tenant name, or recipient"
            className="w-full sm:w-72"
          />
          <ExportCsvButton
            onClick={handleExportCsv}
            disabled={filtered.length === 0}
            count={filtered.length}
          />
        </div>
      </div>

      {/* Notifications List / Table */}
      <div className="hig-card overflow-hidden">
        {/* Mobile Stacked Cards */}
        <div className="md:hidden divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
          {filtered.length === 0 ? (
            <p className="py-10 px-4 text-center hig-subhead">
              No notification records match your filter.
            </p>
          ) : (
            filtered.map((n) => {
              const { unit } = resolveLinkedMeta(n);
              const isQueued = n.status === 'Queued' && !n.cancelledAt;
              const isFailed =
                n.status === 'Failed' ||
                n.status === 'Retry Pending' ||
                n.status === 'Exhausted / Action Required';

              return (
                <div key={n.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="hig-headline block truncate">
                        {n.recipientName} ({n.recipientRole})
                      </span>
                      <span className="hig-footnote block">
                        {n.eventType} {unit ? `· ${unit.code}` : ''}
                      </span>
                      <span className="hig-caption font-mono-nums">
                        {isQueued
                          ? `Scheduled: ${formatDateTimeShort(n.scheduledAt)}`
                          : formatDateTimeShort(n.attemptedAt || n.scheduledAt)}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <StatusBadge label={n.status} />
                      <span className="hig-caption block mt-1">
                        {n.channel}
                        {n.deliveryProvider ? ` · ${n.deliveryProvider}` : ''}
                      </span>
                    </div>
                  </div>

                  {n.failureReason && (
                    <p
                      className="hig-footnote"
                      style={{
                        color: n.status === 'Cancelled' ? 'var(--ink-tertiary)' : 'var(--status-danger-ink)',
                      }}
                    >
                      {n.failureReason} (Retries: {n.retryCount})
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewNotif(n)}
                      className="hig-btn-secondary flex-1"
                    >
                      View Message
                    </button>

                    {isQueued && (
                      <>
                        <button
                          type="button"
                          onClick={() => setConfirmQueueItems([n])}
                          className="hig-btn-primary flex-1"
                        >
                          <Send className="w-4 h-4" />
                          <span>Send Now</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRescheduleTarget(n);
                            const dt = new Date(n.scheduledAt);
                            const pad = (x: number) => String(x).padStart(2, '0');
                            setRescheduleInput(
                              Number.isNaN(dt.getTime())
                                ? ''
                                : `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(
                                    dt.getDate()
                                  )}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`
                            );
                          }}
                          className="hig-btn-secondary flex-1"
                        >
                          Reschedule
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            cancelScheduledNotification(n.id, 'Cancelled from Notifications queue')
                          }
                          className="min-h-[44px] px-3.5 py-2 rounded-xl text-[0.875rem] font-semibold"
                          style={{
                            backgroundColor: 'var(--status-danger-bg)',
                            color: 'var(--status-danger-ink)',
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    )}

                    {n.channel === 'SMS' &&
                      n.deliveryProvider === 'BulkSMSLive' &&
                      n.externalMessageId &&
                      integrationStatus?.bulkSmsConfigured && (
                        <button
                          type="button"
                          onClick={() => void handleCheckSmsDlr(n)}
                          disabled={dlrCheckingId === n.id}
                          className="hig-btn-secondary"
                        >
                          {dlrCheckingId === n.id ? 'Checking...' : 'Check DLR'}
                        </button>
                      )}

                    {isFailed && (
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            n.channel === 'Email' &&
                            (isGmailConnected || integrationStatus?.smtpConfigured)
                          ) {
                            setConfirmQueueItems([n]);
                          } else {
                            retryNotification(n.id, true);
                          }
                        }}
                        className="hig-btn-primary flex-1"
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
                <th className="py-3 px-5">Event Type & Time</th>
                <th className="py-3 px-4">Recipient & Role</th>
                <th className="py-3 px-4">Channel & Provider</th>
                <th className="py-3 px-4">Delivery Status</th>
                <th className="py-3 px-4">Delivery / Failure Note</th>
                <th className="py-3 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y text-[0.875rem]" style={{ borderColor: 'var(--border-subtle)' }}>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center hig-subhead">
                    No notification records match your filter.
                  </td>
                </tr>
              ) : (
                filtered.map((n) => {
                  const { unit } = resolveLinkedMeta(n);
                  const isQueued = n.status === 'Queued' && !n.cancelledAt;
                  const isFailed =
                    n.status === 'Failed' ||
                    n.status === 'Retry Pending' ||
                    n.status === 'Exhausted / Action Required';

                  return (
                    <tr key={n.id} className="hover:bg-[var(--bg-hover)]">
                      <td className="py-3.5 px-5">
                        <span className="font-semibold text-[var(--ink-primary)] block">{n.eventType}</span>
                        <span className="hig-footnote tabular-nums">
                          {isQueued
                            ? `Scheduled: ${formatDateTimeShort(n.scheduledAt)}`
                            : formatDateTimeShort(n.attemptedAt || n.scheduledAt)}
                          {unit ? ` · ${unit.code}` : ''}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-[var(--ink-primary)] block">
                          {n.recipientName} ({n.recipientRole})
                        </span>
                        <span className="hig-footnote font-mono-nums">
                          {n.recipientContact}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="text-[var(--ink-primary)] font-medium block">{n.channel}</span>
                        {n.deliveryProvider && (
                          <span className="hig-caption">via {n.deliveryProvider}</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <StatusBadge label={n.status} />
                      </td>
                      <td className="py-3.5 px-4 hig-footnote max-w-[260px]">
                        {n.failureReason ? (
                          <span
                            style={{
                              color:
                                n.status === 'Cancelled'
                                  ? 'var(--ink-tertiary)'
                                  : 'var(--status-danger-ink)',
                            }}
                          >
                            {n.failureReason} (Retries: {n.retryCount})
                          </span>
                        ) : (
                          <span>
                            {n.externalMessageId
                              ? `Ref: ${n.externalMessageId.slice(0, 18)} · `
                              : ''}
                            Retries: {n.retryCount}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setPreviewNotif(n)}
                            className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--bg-surface-secondary)] text-[var(--ink-primary)] text-[0.8125rem] font-medium hover:bg-[var(--bg-surface-tertiary)]"
                          >
                            View Message
                          </button>

                          {isQueued && (
                            <>
                              <button
                                type="button"
                                onClick={() => setConfirmQueueItems([n])}
                                className="inline-flex items-center gap-1 min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-[0.8125rem] font-semibold hover:bg-[var(--accent-hover)]"
                              >
                                <Send className="w-3 h-3" />
                                <span>Send Now</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setRescheduleTarget(n);
                                  const dt = new Date(n.scheduledAt);
                                  const pad = (x: number) => String(x).padStart(2, '0');
                                  setRescheduleInput(
                                    Number.isNaN(dt.getTime())
                                      ? ''
                                      : `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(
                                          dt.getDate()
                                        )}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`
                                  );
                                }}
                                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--ink-primary)] text-[0.8125rem] font-medium hover:bg-[var(--bg-surface-secondary)]"
                              >
                                Reschedule
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  cancelScheduledNotification(n.id, 'Cancelled from Notifications queue')
                                }
                                className="min-h-[36px] px-3 py-1.5 rounded-lg text-[0.8125rem] font-medium"
                                style={{
                                  backgroundColor: 'var(--status-danger-bg)',
                                  color: 'var(--status-danger-ink)',
                                }}
                              >
                                Cancel
                              </button>
                            </>
                          )}

                          {n.channel === 'SMS' &&
                            n.deliveryProvider === 'BulkSMSLive' &&
                            n.externalMessageId &&
                            integrationStatus?.bulkSmsConfigured && (
                              <button
                                type="button"
                                onClick={() => void handleCheckSmsDlr(n)}
                                disabled={dlrCheckingId === n.id}
                                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--ink-primary)] text-[0.8125rem] font-medium hover:bg-[var(--bg-surface-secondary)]"
                              >
                                {dlrCheckingId === n.id ? 'Checking...' : 'Check DLR'}
                              </button>
                            )}

                          {isFailed && (
                            <button
                              type="button"
                              onClick={() => {
                                if (
                                  n.channel === 'Email' &&
                                  (isGmailConnected || integrationStatus?.smtpConfigured)
                                ) {
                                  setConfirmQueueItems([n]);
                                } else {
                                  retryNotification(n.id, true);
                                }
                              }}
                              className="inline-flex items-center gap-1 min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-[0.8125rem] font-semibold hover:bg-[var(--accent-hover)]"
                            >
                              <RotateCw className="w-3 h-3" />
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

      {/* Message Content Preview Modal (+ Mailto & EML Handoff) */}
      {previewNotif && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/45 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
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
                <h3 className="hig-headline truncate">
                  {previewNotif.channel} Message Preview
                </h3>
                <p className="hig-footnote truncate">
                  To {previewNotif.recipientName} · {previewNotif.recipientContact}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewNotif(null)}
                className="hig-touch-icon shrink-0"
                aria-label="Close preview"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              {previewNotif.subject && (
                <div>
                  <span className="hig-caption uppercase tracking-[0.03em] block">Subject</span>
                  <p className="hig-subhead font-semibold text-[var(--ink-primary)] mt-1">
                    {previewNotif.subject}
                  </p>
                </div>
              )}
              <div>
                <span className="hig-caption uppercase tracking-[0.03em] block mb-1.5">Body</span>
                <pre className="whitespace-pre-wrap font-sans text-[0.875rem] text-[var(--ink-primary)] p-4 hig-card-inset leading-relaxed">
                  {previewNotif.messageBody}
                </pre>
              </div>

              {previewNotif.channel === 'Email' && (
                <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() =>
                      openMailClientDraft({
                        to: previewNotif.recipientContact,
                        subject: previewNotif.subject,
                        body: previewNotif.messageBody,
                      })
                    }
                    className="hig-btn-secondary"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Open in Mail App</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      downloadEmlFile({
                        from: state.property.managerEmail,
                        to: previewNotif.recipientContact,
                        subject: previewNotif.subject || `Message from ${state.property.name}`,
                        body: previewNotif.messageBody,
                      })
                    }
                    className="hig-btn-primary"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download .eml</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Explicit Confirmation Modal for Dispatching Queued / Failed Messages */}
      {confirmQueueItems && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/45 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-queue-dispatch-title"
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
              <h3 id="confirm-queue-dispatch-title" className="hig-headline">
                Confirm Sending {confirmQueueItems.length} Message(s)
              </h3>
              <button
                type="button"
                onClick={() => setConfirmQueueItems(null)}
                disabled={isDispatchingQueue}
                className="hig-touch-icon"
                aria-label="Close confirmation dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              <p className="hig-callout">
                You are about to send {confirmQueueItems.length} message(s) using{' '}
                <span className="font-semibold text-[var(--ink-primary)]">
                  {state.settings.preferredEmailProvider === 'smtp' && integrationStatus?.smtpConfigured
                    ? `Server SMTP (${integrationStatus.smtpHost})`
                    : isGmailConnected
                    ? `Gmail (${gmailUser?.email})`
                    : 'Mail App / SMS Ledger'}
                </span>
                .
              </p>

              {confirmQueueItems.some((i) => i.channel === 'Email') &&
                state.settings.preferredEmailProvider === 'gmail' &&
                !isGmailConnected && (
                  <div
                    className="p-3.5 rounded-xl border space-y-2.5"
                    style={{
                      backgroundColor: 'var(--status-warning-bg)',
                      borderColor: 'color-mix(in srgb, var(--status-warning-ink) 28%, transparent)',
                    }}
                  >
                    <p className="hig-footnote" style={{ color: 'var(--status-warning-ink)' }}>
                      Gmail is selected, but you are not signed in yet. Sign in with Google to send directly via Gmail, or continue to open drafts in your default Mail App:
                    </p>
                    <GoogleSignInButton
                      onClick={() => void connectGmail()}
                      loading={isGmailSigningIn}
                    />
                  </div>
                )}

              <div
                className="max-h-56 overflow-y-auto rounded-xl border divide-y"
                style={{ borderColor: 'var(--border-hairline)' }}
              >
                {confirmQueueItems.map((item) => (
                  <div key={item.id} className="p-3 text-[0.8125rem]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[var(--ink-primary)]">
                        {item.recipientName} ({item.channel})
                      </span>
                      <span className="font-mono-nums hig-caption">{item.recipientContact}</span>
                    </div>
                    {item.subject && (
                      <p className="hig-footnote mt-0.5 truncate">Subject: {item.subject}</p>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmQueueItems(null)}
                  disabled={isDispatchingQueue}
                  className="hig-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDispatchConfirmedItems}
                  disabled={isDispatchingQueue}
                  className="hig-btn-primary"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isDispatchingQueue ? 'Sending...' : 'Confirm & Send Now'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {rescheduleTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/45 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-sm rounded-2xl border p-5 space-y-4"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-hairline)',
              boxShadow: 'var(--shadow-sheet)',
            }}
          >
            <div>
              <h3 className="hig-headline">Reschedule {rescheduleTarget.channel} Message</h3>
              <p className="hig-footnote mt-1">
                To {rescheduleTarget.recipientName} ({rescheduleTarget.recipientContact})
              </p>
            </div>
            <div>
              <label className="block hig-footnote mb-1.5">New Scheduled Date & Time</label>
              <input
                type="datetime-local"
                value={rescheduleInput}
                onChange={(e) => setRescheduleInput(e.target.value)}
                className="hig-input w-full font-mono-nums"
              />
            </div>
            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setRescheduleTarget(null)}
                className="hig-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const dt = new Date(rescheduleInput);
                  if (!Number.isNaN(dt.getTime())) {
                    rescheduleNotification(rescheduleTarget.id, dt.toISOString());
                    setRescheduleTarget(null);
                  }
                }}
                className="hig-btn-primary"
              >
                Save Schedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Follow-Up Suggestions Modal */}
      {aiFollowUpOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/45 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-followup-title"
        >
          <div
            className="w-full max-w-2xl rounded-2xl border max-h-[90vh] flex flex-col overflow-hidden"
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
              <div>
                <h3 id="ai-followup-title" className="hig-headline flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[var(--accent-ink)]" />
                  <span>AI Follow-Up Recommendations</span>
                </h3>
                <p className="hig-footnote mt-0.5">
                  Analyzes overdue rent, breached commitments, and overdue receipts to draft targeted follow-ups.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAiFollowUpOpen(false)}
                className="hig-touch-icon shrink-0"
                aria-label="Close AI suggestions"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-4">
              {aiFollowUpLoading && (
                <div className="py-10 text-center hig-subhead">
                  Analyzing {state.property.name} ledger with Gemini...
                </div>
              )}
              {aiFollowUpError && (
                <div
                  className="p-4 rounded-xl border text-[0.875rem] flex items-start gap-2.5"
                  style={{
                    backgroundColor: 'var(--status-danger-bg)',
                    borderColor: 'color-mix(in srgb, var(--status-danger-ink) 25%, transparent)',
                    color: 'var(--status-danger-ink)',
                  }}
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Unable to generate AI recommendations</p>
                    <p className="mt-0.5">{aiFollowUpError}</p>
                  </div>
                </div>
              )}
              {!aiFollowUpLoading && !aiFollowUpError && aiSuggestions.length === 0 && (
                <p className="hig-subhead text-center py-6">
                  No urgent follow-ups needed right now.
                </p>
              )}
              {aiSuggestions.map((s, idx) => (
                <div
                  key={`${s.recipientName}-${idx}`}
                  className="hig-card-inset p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge
                        label={`${s.priority} Priority`}
                        tone={
                          s.priority === 'High'
                            ? 'danger'
                            : s.priority === 'Medium'
                            ? 'warning'
                            : 'neutral'
                        }
                      />
                      <span className="hig-headline">{s.recipientName}</span>
                      <span className="hig-footnote">
                        ({s.targetType}{s.unitCode ? ` · ${s.unitCode}` : ''} · {s.recommendedChannels})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => loadAiSuggestionIntoComposer(s)}
                      className="hig-btn-primary"
                    >
                      <Send className="w-4 h-4" />
                      <span>Load into Composer</span>
                    </button>
                  </div>
                  <p className="hig-footnote">{s.rationale}</p>
                  <div className="hig-card p-3.5 text-[0.8125rem] space-y-1.5">
                    <p className="font-semibold text-[var(--ink-primary)]">Subject: {s.subject}</p>
                    <p className="text-[var(--ink-secondary)] line-clamp-3 whitespace-pre-wrap">
                      {s.emailBody}
                    </p>
                    <p
                      className="hig-caption pt-2 border-t"
                      style={{ borderColor: 'var(--border-subtle)' }}
                    >
                      SMS: {s.smsBody}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
