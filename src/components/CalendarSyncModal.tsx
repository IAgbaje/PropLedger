import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Calendar,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { useIntegrations } from '../context/IntegrationContext';
import { useRentalStore } from '../context/RentalStore';
import {
  deleteCalendarReminderEvent,
  fetchSyncedCalendarEvents,
  syncCalendarReminderEvent,
} from '../utils/emailClient';
import { formatDateShort, formatNaira, formatTenantName } from '../utils/format';
import {
  buildCalendarEventPayload,
  collectCalendarDueCandidates,
  DEFAULT_CALENDAR_REMINDER_OPTIONS,
  type CalendarDueCandidate,
  type CalendarReminderOptions,
  type SyncedCalendarEvent,
} from '../utils/googleCalendar';
import { GoogleSignInButton } from './GoogleSignInButton';
import { StatusBadge } from './StatusBadge';

type ConfirmAction =
  | { type: 'sync'; candidates: CalendarDueCandidate[] }
  | { type: 'delete'; event: SyncedCalendarEvent }
  | null;

export function CalendarSyncModal() {
  const {
    state,
    computedObligations,
    calendarSyncOpen,
    calendarSyncTenantId,
    closeCalendarSync,
    logAuditEvent,
  } = useRentalStore();
  const {
    gmailUser,
    gmailAccessToken,
    isGmailConnected,
    isGmailSigningIn,
    gmailError,
    connectGmail,
    clearGmailSessionToken,
  } = useIntegrations();

  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [filterScope, setFilterScope] = useState<'all' | 'upcoming' | 'overdue' | 'commitments'>('all');
  const [search, setSearch] = useState('');
  const [reminderOpts, setReminderOpts] = useState<CalendarReminderOptions>(
    DEFAULT_CALENDAR_REMINDER_OPTIONS
  );

  const [syncedEvents, setSyncedEvents] = useState<SyncedCalendarEvent[]>([]);
  const [loadingSynced, setLoadingSynced] = useState(false);
  const [calendarApiError, setCalendarApiError] = useState('');
  const [syncResult, setSyncResult] = useState<{
    tone: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const allCandidates = useMemo(
    () =>
      collectCalendarDueCandidates({
        computedObligations,
        commitments: state.commitments,
        tenants: state.tenants,
        units: state.units,
      }),
    [computedObligations, state.commitments, state.tenants, state.units]
  );

  const scopedCandidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allCandidates.filter((c) => {
      if (calendarSyncTenantId && c.tenantId !== calendarSyncTenantId) return false;
      if (filterScope === 'upcoming' && (c.kind !== 'Obligation' || c.daysPastDue > 0)) return false;
      if (filterScope === 'overdue' && (c.kind !== 'Obligation' || c.daysPastDue <= 0)) return false;
      if (filterScope === 'commitments' && c.kind !== 'Commitment') return false;
      if (q) {
        const hay = `${c.tenantName} ${c.unitCode} ${c.unitName} ${c.periodLabel} ${c.dueDate}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allCandidates, calendarSyncTenantId, filterScope, search]);

  const syncedByKey = useMemo(() => {
    const map = new Map<string, SyncedCalendarEvent>();
    for (const ev of syncedEvents) {
      if (ev.propledgerKey && ev.status !== 'cancelled') {
        map.set(ev.propledgerKey, ev);
      }
    }
    return map;
  }, [syncedEvents]);

  const loadCalendarEvents = useCallback(async () => {
    if (!gmailAccessToken) return;
    setLoadingSynced(true);
    setCalendarApiError('');
    try {
      const res = await fetchSyncedCalendarEvents(gmailAccessToken);
      setSyncedEvents(res.events || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to read Google Calendar events.';
      if (msg.includes('401') || msg.toLowerCase().includes('unauthorized')) {
        clearGmailSessionToken();
      }
      setCalendarApiError(msg);
    } finally {
      setLoadingSynced(false);
    }
  }, [gmailAccessToken, clearGmailSessionToken]);

  useEffect(() => {
    if (!calendarSyncOpen) return;
    setSyncResult(null);
    setConfirmAction(null);
    setCalendarApiError('');
    setSearch('');
    setFilterScope('all');
    if (calendarSyncTenantId) {
      setSelectedKeys(
        allCandidates.filter((c) => c.tenantId === calendarSyncTenantId).map((c) => c.key)
      );
    } else {
      // Pre-select upcoming & commitments + multi-year priority items up to 10 by default
      setSelectedKeys(allCandidates.slice(0, 12).map((c) => c.key));
    }
    if (gmailAccessToken) {
      void loadCalendarEvents();
    }
  }, [calendarSyncOpen, calendarSyncTenantId, allCandidates, gmailAccessToken, loadCalendarEvents]);

  if (!calendarSyncOpen) return null;

  const selectedCandidates = allCandidates.filter((c) => selectedKeys.includes(c.key));
  const tenantFilterObj = calendarSyncTenantId
    ? state.tenants.find((t) => t.id === calendarSyncTenantId)
    : undefined;

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleToggleAllVisible = () => {
    const visibleKeys = scopedCandidates.map((c) => c.key);
    const allVisibleSelected =
      visibleKeys.length > 0 && visibleKeys.every((k) => selectedKeys.includes(k));
    if (allVisibleSelected) {
      setSelectedKeys((prev) => prev.filter((k) => !visibleKeys.includes(k)));
    } else {
      setSelectedKeys((prev) => Array.from(new Set([...prev, ...visibleKeys])));
    }
  };

  const handleExecuteConfirmedAction = async () => {
    if (!confirmAction || !gmailAccessToken) return;
    setIsExecuting(true);
    setCalendarApiError('');
    setSyncResult(null);

    if (confirmAction.type === 'sync') {
      let createdCount = 0;
      let updatedCount = 0;
      let failedCount = 0;
      let firstError = '';

      for (const candidate of confirmAction.candidates) {
        const existing = syncedByKey.get(candidate.key);
        const payload = buildCalendarEventPayload(candidate, state.property, reminderOpts);
        try {
          const res = await syncCalendarReminderEvent(gmailAccessToken, {
            existingEventId: existing?.id,
            event: payload,
          });
          if (res.action === 'updated') updatedCount++;
          else createdCount++;
        } catch (err) {
          failedCount++;
          const msg = err instanceof Error ? err.message : 'Calendar API write failed';
          if (!firstError) firstError = msg;
          if (msg.includes('401') || msg.toLowerCase().includes('unauthorized')) {
            clearGmailSessionToken();
            break;
          }
        }
      }

      if (createdCount + updatedCount > 0) {
        logAuditEvent(
          'Notification',
          'google-calendar-sync',
          'Google Calendar Due Reminders Synced',
          `Synced ${createdCount} created, ${updatedCount} updated due-date reminder(s) to Google Calendar (${gmailUser?.email || 'connected account'}).`
        );
      }

      await loadCalendarEvents();
      setIsExecuting(false);
      setConfirmAction(null);

      if (failedCount > 0 && createdCount + updatedCount === 0) {
        setSyncResult({
          tone: 'error',
          text: `Failed creating Google Calendar reminders: ${firstError}`,
        });
      } else if (failedCount > 0) {
        setSyncResult({
          tone: 'warning',
          text: `Synced ${createdCount + updatedCount} reminder(s), ${failedCount} failed (${firstError}).`,
        });
      } else {
        setSyncResult({
          tone: 'success',
          text: `Synced ${createdCount} new and ${updatedCount} updated due-date reminder(s) to your Google Calendar with notifications.`,
        });
      }
    } else if (confirmAction.type === 'delete') {
      try {
        await deleteCalendarReminderEvent(gmailAccessToken, confirmAction.event.id);
        logAuditEvent(
          'Notification',
          confirmAction.event.id,
          'Google Calendar Reminder Removed',
          `Removed Google Calendar reminder "${confirmAction.event.summary}".`
        );
        await loadCalendarEvents();
        setSyncResult({
          tone: 'success',
          text: `Removed reminder "${confirmAction.event.summary}" from Google Calendar.`,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to delete Google Calendar event';
        if (msg.includes('401') || msg.toLowerCase().includes('unauthorized')) {
          clearGmailSessionToken();
        }
        setSyncResult({ tone: 'error', text: msg });
      } finally {
        setIsExecuting(false);
        setConfirmAction(null);
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-2.5 sm:p-4 bg-black/45 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="calendar-sync-modal-title"
    >
      <div className="w-full max-w-4xl bg-[var(--bg-surface)] rounded-2xl shadow-[var(--shadow-sheet)] border border-[var(--border-hairline)] max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-[var(--border-subtle)] flex items-start sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] flex items-center justify-center shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2
                id="calendar-sync-modal-title"
                className="hig-title-3 truncate"
              >
                Google Calendar Due-Date Reminders
                {tenantFilterObj ? ` — ${formatTenantName(tenantFilterObj)}` : ''}
              </h2>
              <p className="hig-footnote mt-0.5">
                Sync rent due dates, security levies, and promise deadlines to Google Calendar with automatic email & popup alerts.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeCalendarSync}
            className="hig-touch-icon shrink-0"
            aria-label="Close calendar sync modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-5">
          {/* Google Connection Status */}
          <div className="hig-card-inset p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="hig-subhead font-semibold text-[var(--ink-primary)]">
                  Google Calendar Account
                </span>
                <StatusBadge
                  label={
                    isGmailConnected
                      ? `Connected: ${gmailUser?.email || 'Google Account'}`
                      : 'Sign-In Required'
                  }
                  tone={isGmailConnected ? 'success' : 'neutral'}
                  showDot
                />
              </div>
              <p className="hig-footnote">
                {isGmailConnected
                  ? `${syncedEvents.length} PropLedger reminder(s) currently active on your primary Google Calendar.`
                  : 'Sign in with Google to sync payment due dates and receive Calendar notifications.'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isGmailConnected ? (
                <button
                  type="button"
                  onClick={() => void loadCalendarEvents()}
                  disabled={loadingSynced}
                  className="hig-btn-secondary"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingSynced ? 'animate-spin' : ''}`} />
                  <span className="whitespace-nowrap">Refresh Calendar</span>
                </button>
              ) : (
                <GoogleSignInButton
                  onClick={() => void connectGmail()}
                  loading={isGmailSigningIn}
                />
              )}
            </div>
          </div>

          {(gmailError || calendarApiError) && (
            <div className="p-3.5 rounded-xl bg-[var(--status-danger-bg)] border border-[var(--status-danger-ink)]/20 text-[13px] text-[var(--status-danger-ink)] flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{calendarApiError || gmailError}</span>
            </div>
          )}

          {syncResult && (
            <div
              className={`p-3.5 rounded-xl border text-[13px] flex items-start gap-2.5 ${
                syncResult.tone === 'success'
                  ? 'bg-[var(--status-success-bg)] border-[var(--status-success-ink)]/20 text-[var(--status-success-ink)]'
                  : syncResult.tone === 'warning'
                  ? 'bg-[var(--status-warning-bg)] border-[var(--status-warning-ink)]/20 text-[var(--status-warning-ink)]'
                  : 'bg-[var(--status-danger-bg)] border-[var(--status-danger-ink)]/20 text-[var(--status-danger-ink)]'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{syncResult.text}</span>
            </div>
          )}

          {/* Mandatory Explicit Confirmation Dialog Step */}
          {confirmAction ? (
            <div className="hig-card-inset p-4 sm:p-5 space-y-4">
              {confirmAction.type === 'sync' ? (
                <>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <h3 className="hig-headline">
                        Confirm Google Calendar Reminder Sync
                      </h3>
                      <p className="hig-footnote mt-0.5">
                        Review the exact reminders to be created or updated in your primary Google Calendar ({gmailUser?.email}).
                      </p>
                    </div>
                    <span className="px-3 py-1 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-[12px] font-semibold shrink-0 tabular-nums">
                      {confirmAction.candidates.length} event(s)
                    </span>
                  </div>

                  <div className="max-h-56 overflow-y-auto rounded-xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] divide-y divide-[var(--border-subtle)] text-[13px]">
                    {confirmAction.candidates.map((c) => {
                      const exists = syncedByKey.has(c.key);
                      return (
                        <div key={c.key} className="p-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <span className="font-medium text-[var(--ink-primary)] block truncate">
                              {c.title} — {formatNaira(c.amount)}
                            </span>
                            <span className="hig-caption font-mono-nums block">
                              {c.dueDate} at 09:00 WAT · {c.periodLabel}
                            </span>
                          </div>
                          <StatusBadge
                            label={exists ? 'Update Existing' : 'Create New'}
                            tone={exists ? 'warning' : 'success'}
                          />
                        </div>
                      );
                    })}
                  </div>

                  <p className="hig-footnote">
                    Calendar Notifications:{' '}
                    {[
                      reminderOpts.email7DaysBefore && 'Email 7d before',
                      reminderOpts.email1DayBefore && 'Email 1d before',
                      reminderOpts.popup1DayBefore && 'Popup 1d before',
                      reminderOpts.popup1HourBefore && 'Popup 1h before',
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Popup 1h before'}
                  </p>
                </>
              ) : (
                <>
                  <h3 className="hig-headline">
                    Confirm Removal from Google Calendar
                  </h3>
                  <p className="hig-callout">
                    Remove calendar reminder <strong className="text-[var(--ink-primary)]">{confirmAction.event.summary}</strong> from your Google Calendar? This does not delete any rent record in PropLedger.
                  </p>
                </>
              )}

              <div className="flex flex-wrap justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmAction(null)}
                  disabled={isExecuting}
                  className="hig-btn-secondary"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => void handleExecuteConfirmedAction()}
                  disabled={isExecuting}
                  className="hig-btn-primary"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {isExecuting
                      ? 'Syncing...'
                      : confirmAction.type === 'delete'
                      ? 'Confirm Remove Event'
                      : `Confirm & Sync ${confirmAction.candidates.length} Reminder(s)`}
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Notification Lead Time Settings */}
              <div className="hig-card p-4 space-y-3">
                <div className="flex items-center gap-2 hig-subhead font-semibold text-[var(--ink-primary)]">
                  <Bell className="w-4 h-4 text-[var(--accent-ink)] shrink-0" />
                  <span>Google Calendar Notification Alerts (09:00 WAT on Due Date)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-[13px]">
                  <label className="min-h-[44px] flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[var(--bg-surface-secondary)] text-[var(--ink-primary)] cursor-pointer hover:bg-[var(--bg-surface-tertiary)] transition-colors">
                    <input
                      type="checkbox"
                      checked={reminderOpts.email7DaysBefore}
                      onChange={(e) =>
                        setReminderOpts((p) => ({ ...p, email7DaysBefore: e.target.checked }))
                      }
                      className="w-4 h-4 rounded accent-[var(--accent)]"
                    />
                    <span>Email 7 days before</span>
                  </label>
                  <label className="min-h-[44px] flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[var(--bg-surface-secondary)] text-[var(--ink-primary)] cursor-pointer hover:bg-[var(--bg-surface-tertiary)] transition-colors">
                    <input
                      type="checkbox"
                      checked={reminderOpts.email1DayBefore}
                      onChange={(e) =>
                        setReminderOpts((p) => ({ ...p, email1DayBefore: e.target.checked }))
                      }
                      className="w-4 h-4 rounded accent-[var(--accent)]"
                    />
                    <span>Email 1 day before</span>
                  </label>
                  <label className="min-h-[44px] flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[var(--bg-surface-secondary)] text-[var(--ink-primary)] cursor-pointer hover:bg-[var(--bg-surface-tertiary)] transition-colors">
                    <input
                      type="checkbox"
                      checked={reminderOpts.popup1DayBefore}
                      onChange={(e) =>
                        setReminderOpts((p) => ({ ...p, popup1DayBefore: e.target.checked }))
                      }
                      className="w-4 h-4 rounded accent-[var(--accent)]"
                    />
                    <span>Popup 24h before</span>
                  </label>
                  <label className="min-h-[44px] flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[var(--bg-surface-secondary)] text-[var(--ink-primary)] cursor-pointer hover:bg-[var(--bg-surface-tertiary)] transition-colors">
                    <input
                      type="checkbox"
                      checked={reminderOpts.popup1HourBefore}
                      onChange={(e) =>
                        setReminderOpts((p) => ({ ...p, popup1HourBefore: e.target.checked }))
                      }
                      className="w-4 h-4 rounded accent-[var(--accent)]"
                    />
                    <span>Popup 1 hour before</span>
                  </label>
                </div>
              </div>

              {/* Filter & Select Due Dates */}
              <div className="space-y-3">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="hig-segmented w-full sm:w-fit" role="tablist" aria-label="Calendar due date scope">
                    {(
                      [
                        { id: 'all', label: 'All Open & Upcoming' },
                        { id: 'upcoming', label: 'Upcoming Due' },
                        { id: 'overdue', label: 'Past Due' },
                        { id: 'commitments', label: 'Promises to Pay' },
                      ] as const
                    ).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={filterScope === t.id}
                        data-active={filterScope === t.id ? 'true' : 'false'}
                        onClick={() => setFilterScope(t.id)}
                        className="hig-segmented-item whitespace-nowrap"
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full lg:w-auto">
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Filter tenant or unit..."
                      aria-label="Filter calendar due dates"
                      className="hig-input w-full sm:w-52"
                    />
                    <button
                      type="button"
                      onClick={handleToggleAllVisible}
                      className="hig-btn-secondary whitespace-nowrap shrink-0"
                    >
                      Toggle Visible ({scopedCandidates.length})
                    </button>
                  </div>
                </div>

                <div className="max-h-64 overflow-y-auto rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] divide-y divide-[var(--border-subtle)]">
                  {scopedCandidates.length === 0 ? (
                    <p className="p-6 text-center hig-callout">
                      No due dates or payment commitments match your filter.
                    </p>
                  ) : (
                    scopedCandidates.map((c) => {
                      const checked = selectedKeys.includes(c.key);
                      const synced = syncedByKey.get(c.key);
                      return (
                        <label
                          key={c.key}
                          className={`min-h-[56px] flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 p-3.5 cursor-pointer text-[13px] transition-colors ${
                            checked ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--bg-hover)]'
                          }`}
                        >
                          <span className="flex items-center gap-3 min-w-0 flex-1">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleKey(c.key)}
                              className="w-4 h-4 rounded accent-[var(--accent)] shrink-0"
                            />
                            <span className="min-w-0">
                              <span className="font-medium text-[var(--ink-primary)] block truncate">
                                {c.title}
                              </span>
                              <span className="hig-caption font-mono-nums block">
                                Due {formatDateShort(c.dueDate)} · {c.periodLabel}
                                {c.daysPastDue > 0 ? ` · ${c.daysPastDue}d overdue` : ''}
                              </span>
                            </span>
                          </span>
                          <span className="flex items-center gap-2.5 shrink-0 pl-7 sm:pl-0">
                            <span className="font-mono-nums font-semibold text-[var(--ink-primary)]">
                              {formatNaira(c.amount)}
                            </span>
                            {synced ? (
                              <a
                                href={synced.htmlLink}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--status-success-bg)] text-[var(--status-success-ink)] text-[12px] font-medium hover:underline"
                              >
                                <span>On Calendar</span>
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            ) : (
                              <StatusBadge
                                label={c.isMultiYear ? 'Multi-Year' : c.kind}
                                tone={c.isMultiYear ? 'danger' : 'neutral'}
                              />
                            )}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Active Reminders Already on Google Calendar */}
              {syncedEvents.length > 0 && (
                <div className="space-y-2">
                  <span className="hig-caption uppercase tracking-[0.04em] font-semibold block">
                    Synced Reminders on Google Calendar ({syncedEvents.length})
                  </span>
                  <div className="max-h-40 overflow-y-auto rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] divide-y divide-[var(--border-subtle)] text-[13px]">
                    {syncedEvents.map((ev) => (
                      <div key={ev.id} className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-medium text-[var(--ink-primary)] block truncate">
                            {ev.summary}
                          </span>
                          <span className="hig-caption font-mono-nums block">
                            {ev.start?.dateTime || ev.start?.date || ''}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {ev.htmlLink && (
                            <a
                              href={ev.htmlLink}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 min-h-[44px] px-2.5 text-[12.5px] font-medium text-[var(--accent-ink)] hover:underline"
                            >
                              <span>Open</span>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => setConfirmAction({ type: 'delete', event: ev })}
                            className="hig-touch-icon text-[var(--status-danger-ink)] hover:bg-[var(--status-danger-bg)]"
                            aria-label={`Remove ${ev.summary}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!confirmAction && (
          <div className="px-4 sm:px-6 py-4 border-t border-[var(--border-subtle)] bg-[var(--bg-surface-secondary)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="hig-footnote tabular-nums">
              {selectedCandidates.length} due-date reminder(s) selected
            </span>
            <div className="flex flex-wrap items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={closeCalendarSync}
                className="hig-btn-secondary"
              >
                Close
              </button>
              <button
                type="button"
                disabled={!isGmailConnected || selectedCandidates.length === 0}
                onClick={() => setConfirmAction({ type: 'sync', candidates: selectedCandidates })}
                className="hig-btn-primary"
              >
                <Calendar className="w-4 h-4" />
                <span>
                  Review & Sync {selectedCandidates.length} to Google Calendar
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
