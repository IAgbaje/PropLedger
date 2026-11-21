import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Download,
  ExternalLink,
  Mail,
  MessageSquare,
  Plus,
  Send,
  Sparkles,
  UserPlus,
  Users,
  Wand2,
  X,
} from 'lucide-react';
import { useIntegrations } from '../context/IntegrationContext';
import { useRentalStore, type CustomRecipientDraft } from '../context/RentalStore';
import type { NotificationRecord, StakeholderRole } from '../types/rental';
import {
  downloadEmlFile,
  generateAiMessageDraft,
  openMailClientDraft,
  sendEmailViaGmail,
  sendEmailViaSmtp,
  sendSmsViaGateway,
} from '../utils/emailClient';
import { formatNaira, formatTenantName } from '../utils/format';
import {
  calculateSmsSegments,
  interpolateTemplate,
  isWithinQuietHours,
  validateEmailAddress,
  validatePhoneNumber,
} from '../utils/messaging';
import { getSmsRecordCostNaira, getSmsRecordUnits } from '../utils/smsAnalytics';
import { GoogleSignInButton } from './GoogleSignInButton';

type ChannelMode = 'Email' | 'SMS' | 'Both';
type ImmediateEmailMode = 'gmail' | 'smtp' | 'mailto' | 'eml';

function toLocalDateTimeInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function getNextBusinessPreset(type: '1h' | 'tomorrow9' | 'monday9'): string {
  const d = new Date();
  if (type === '1h') {
    d.setHours(d.getHours() + 1);
    d.setMinutes(0, 0, 0);
    return toLocalDateTimeInput(d);
  }
  if (type === 'tomorrow9') {
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return toLocalDateTimeInput(d);
  }
  const day = d.getDay();
  const addDays = day === 1 ? 7 : (8 - day) % 7 || 7;
  d.setDate(d.getDate() + addDays);
  d.setHours(9, 0, 0, 0);
  return toLocalDateTimeInput(d);
}

interface DirectoryEntry {
  id: string;
  name: string;
  role: StakeholderRole | 'Tenant';
  email: string;
  phone: string;
  unitCode?: string;
  unitName?: string;
  outstandingBalance?: number;
  dueDate?: string;
  firstName?: string;
  alias?: string;
  notificationsPaused?: boolean;
  tenantId?: string;
}

export function CustomMessageComposerModal() {
  const {
    state,
    computedObligations,
    composerOpen,
    setComposerOpen,
    composerPrefill,
    appendNotifications,
    updateNotificationRecord,
  } = useRentalStore();
  const {
    status: integrationStatus,
    gmailUser,
    gmailAccessToken,
    isGmailConnected,
    isGmailSigningIn,
    gmailError,
    connectGmail,
    clearGmailSessionToken,
  } = useIntegrations();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [customRecipients, setCustomRecipients] = useState<CustomRecipientDraft[]>([]);
  const [recipientSearch, setRecipientSearch] = useState('');

  // Add Anyone inline fields
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customEmail, setCustomEmail] = useState('');
  const [customPhone, setCustomPhone] = useState('');
  const [customRole, setCustomRole] = useState<StakeholderRole | 'Tenant' | 'Custom'>('Custom');
  const [customAddError, setCustomAddError] = useState('');

  // Content & Channels
  const [channelMode, setChannelMode] = useState<ChannelMode>('Both');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [subject, setSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [smsBody, setSmsBody] = useState('');
  const [activeField, setActiveField] = useState<'subject' | 'emailBody' | 'smsBody'>('emailBody');

  // Schedule & Overrides
  const [scheduleMode, setScheduleMode] = useState<'now' | 'later'>('now');
  const [scheduledAtLocal, setScheduledAtLocal] = useState(() => getNextBusinessPreset('tomorrow9'));
  const [overrideQuietHours, setOverrideQuietHours] = useState(false);
  const [includePausedTenants, setIncludePausedTenants] = useState(true);
  const [scheduleSmsViaGatewayNow, setScheduleSmsViaGatewayNow] = useState(false);

  // Delivery provider & Confirmation
  const [immediateEmailMode, setImmediateEmailMode] = useState<ImmediateEmailMode>('gmail');
  const [confirmingSend, setConfirmingSend] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendResultBanner, setSendResultBanner] = useState<{
    tone: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  // AI Assistant state
  const [aiIntent, setAiIntent] = useState('Rent Reminder');
  const [aiTone, setAiTone] = useState('Professional & Polite');
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiTenantId, setAiTenantId] = useState('');
  const [aiLoading, setAiLoading] = useState<'generate' | 'polish' | null>(null);
  const [aiError, setAiError] = useState('');
  const [aiNote, setAiNote] = useState('');

  const directory = useMemo<DirectoryEntry[]>(() => {
    const entries: DirectoryEntry[] = [];
    for (const t of state.tenants.filter((item) => !item.archived)) {
      const activeAg =
        state.agreements.find((a) => a.tenantId === t.id && a.status === 'Active') ||
        state.agreements.find((a) => a.tenantId === t.id);
      const unit = activeAg ? state.units.find((u) => u.id === activeAg.unitId) : undefined;
      const obs = computedObligations.filter(
        (c) => c.obligation.tenantId === t.id && c.amountOutstanding > 0
      );
      const outstanding = obs.reduce((s, c) => s + c.amountOutstanding, 0);
      const earliestDue = obs
        .map((c) => c.obligation.dueDate)
        .sort()[0] || activeAg?.dueDate;
      entries.push({
        id: t.id,
        tenantId: t.id,
        firstName: t.firstName?.trim() || t.alias?.trim() || t.lastName?.trim() || 'Tenant',
        alias: t.alias,
        name: formatTenantName(t),
        role: 'Tenant',
        email: t.email,
        phone: t.phone,
        unitCode: unit?.code,
        unitName: unit?.name,
        outstandingBalance: outstanding,
        dueDate: earliestDue,
        notificationsPaused: t.notificationsPaused,
      });
    }
    for (const c of state.contacts) {
      entries.push({
        id: c.id,
        name: c.name,
        firstName: c.name.split(' ')[0],
        role: c.role,
        email: c.email,
        phone: c.phone,
      });
    }
    return entries;
  }, [state.tenants, state.contacts, state.agreements, state.units, computedObligations]);

  // Reset / Apply prefill on open
  useEffect(() => {
    if (!composerOpen) return;
    const normalizedIds = (composerPrefill?.directoryRecipientIds ?? []).map((id) =>
      id.replace(/^(tenant|contact):/, '')
    );
    const normalizedLinkedId = (
      composerPrefill?.linkedTenantId ??
      normalizedIds[0] ??
      ''
    ).replace(/^(tenant|contact):/, '');
    setSelectedIds(normalizedIds);
    setCustomRecipients(composerPrefill?.customRecipients ?? []);
    setChannelMode(composerPrefill?.channelMode ?? 'Both');
    setSelectedTemplateId('');
    setSubject(composerPrefill?.subject ?? '');
    setEmailBody(composerPrefill?.emailBody ?? '');
    setSmsBody(composerPrefill?.smsBody ?? '');
    setScheduleMode(composerPrefill?.scheduleMode ?? 'now');
    setScheduledAtLocal(
      composerPrefill?.scheduledAtLocal ?? getNextBusinessPreset('tomorrow9')
    );
    setAiTenantId(normalizedLinkedId);
    setAiIntent(composerPrefill?.intent ?? 'Rent Reminder');
    setAiError('');
    setAiNote('');
    setSendResultBanner(null);
    setConfirmingSend(false);
    setShowAddCustom(false);
    setCustomAddError('');
    setOverrideQuietHours(false);
    if (isGmailConnected) {
      setImmediateEmailMode('gmail');
    } else if (integrationStatus?.smtpConfigured) {
      setImmediateEmailMode('smtp');
    } else {
      setImmediateEmailMode('gmail');
    }
  }, [composerOpen, composerPrefill, isGmailConnected, integrationStatus?.smtpConfigured]);

  const selectedDirectoryEntries = useMemo(
    () => directory.filter((d) => selectedIds.includes(d.id)),
    [directory, selectedIds]
  );

  const allResolvedRecipients = useMemo<CustomRecipientDraft[]>(() => {
    const dirList: CustomRecipientDraft[] = selectedDirectoryEntries.map((d) => ({
      name: d.name,
      email: d.email,
      phone: d.phone,
      role: d.role,
      tenantId: d.tenantId,
      unitCode: d.unitCode,
    }));
    return [...dirList, ...customRecipients];
  }, [selectedDirectoryEntries, customRecipients]);

  const pausedTenantsSelected = useMemo(
    () => selectedDirectoryEntries.filter((d) => d.notificationsPaused),
    [selectedDirectoryEntries]
  );

  const effectiveRecipients = useMemo(() => {
    if (includePausedTenants) return allResolvedRecipients;
    const pausedIds = new Set(pausedTenantsSelected.map((p) => p.tenantId));
    return allResolvedRecipients.filter((r) => !r.tenantId || !pausedIds.has(r.tenantId));
  }, [allResolvedRecipients, includePausedTenants, pausedTenantsSelected]);

  const needsEmail = channelMode === 'Email' || channelMode === 'Both';
  const needsSms = channelMode === 'SMS' || channelMode === 'Both';

  const validEmailTargets = useMemo(
    () =>
      needsEmail
        ? effectiveRecipients.filter((r) => r.email && validateEmailAddress(r.email))
        : [],
    [effectiveRecipients, needsEmail]
  );
  const validSmsTargets = useMemo(
    () =>
      needsSms
        ? effectiveRecipients.filter((r) => r.phone && validatePhoneNumber(r.phone))
        : [],
    [effectiveRecipients, needsSms]
  );

  const missingEmailRecipients = useMemo(
    () =>
      needsEmail
        ? effectiveRecipients.filter((r) => !r.email || !validateEmailAddress(r.email))
        : [],
    [effectiveRecipients, needsEmail]
  );
  const missingSmsRecipients = useMemo(
    () =>
      needsSms
        ? effectiveRecipients.filter((r) => !r.phone || !validatePhoneNumber(r.phone))
        : [],
    [effectiveRecipients, needsSms]
  );

  const targetTimeIso = useMemo(() => {
    if (scheduleMode === 'now') return new Date().toISOString();
    const dt = new Date(scheduledAtLocal);
    return Number.isNaN(dt.getTime()) ? new Date().toISOString() : dt.toISOString();
  }, [scheduleMode, scheduledAtLocal]);

  const quietHoursTriggered = useMemo(
    () =>
      isWithinQuietHours(
        targetTimeIso,
        state.settings.quietHoursStart,
        state.settings.quietHoursEnd
      ),
    [targetTimeIso, state.settings.quietHoursStart, state.settings.quietHoursEnd]
  );

  const filteredDirectory = useMemo(() => {
    const q = recipientSearch.trim().toLowerCase();
    if (!q) return directory;
    return directory.filter((d) =>
      `${d.name} ${d.alias || ''} ${d.role} ${d.unitCode || ''} ${d.unitName || ''} ${d.email} ${d.phone}`
        .toLowerCase()
        .includes(q)
    );
  }, [directory, recipientSearch]);

  const smsStats = useMemo(() => calculateSmsSegments(smsBody), [smsBody]);

  if (!composerOpen) return null;

  const toggleRecipientId = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const applyPresetGroup = (preset: 'overdue' | 'allTenants' | 'lawyers' | 'issuers') => {
    let ids: string[] = [];
    if (preset === 'overdue') {
      const overdueTenantIds = new Set(
        computedObligations
          .filter((c) => c.amountOutstanding > 0 && c.dueDatePosition === 'Overdue')
          .map((c) => c.obligation.tenantId)
      );
      ids = directory
        .filter((d) => d.tenantId && overdueTenantIds.has(d.tenantId))
        .map((d) => d.id);
    } else if (preset === 'allTenants') {
      ids = directory.filter((d) => d.role === 'Tenant').map((d) => d.id);
    } else if (preset === 'lawyers') {
      ids = directory
        .filter((d) => d.role === 'Lawyer' || d.role === 'Additional Contact')
        .map((d) => d.id);
    } else if (preset === 'issuers') {
      ids = directory.filter((d) => d.role === 'Receipt Issuer').map((d) => d.id);
    }
    setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
  };

  const handleAddCustomRecipient = () => {
    setCustomAddError('');
    if (!customName.trim()) {
      setCustomAddError('Recipient name is required.');
      return;
    }
    const emailTrim = customEmail.trim();
    const phoneTrim = customPhone.trim();
    if (!emailTrim && !phoneTrim) {
      setCustomAddError('Provide at least an email address or phone number.');
      return;
    }
    if (emailTrim && !validateEmailAddress(emailTrim)) {
      setCustomAddError('Please enter a valid email address.');
      return;
    }
    if (phoneTrim && !validatePhoneNumber(phoneTrim)) {
      setCustomAddError('Please enter a valid phone number (7–15 digits).');
      return;
    }

    setCustomRecipients((prev) => [
      ...prev,
      {
        name: customName.trim(),
        email: emailTrim || undefined,
        phone: phoneTrim || undefined,
        role: customRole,
      },
    ]);
    setCustomName('');
    setCustomEmail('');
    setCustomPhone('');
    setShowAddCustom(false);
  };

  const insertToken = (token: string) => {
    if (activeField === 'subject') {
      setSubject((prev) => `${prev}${prev ? ' ' : ''}${token}`);
    } else if (activeField === 'smsBody') {
      setSmsBody((prev) => `${prev}${prev ? ' ' : ''}${token}`);
    } else {
      setEmailBody((prev) => `${prev}${prev ? ' ' : ''}${token}`);
    }
  };

  const getTemplateVars = (rec: CustomRecipientDraft) => {
    const dirMatch = directory.find(
      (d) => (rec.tenantId && d.tenantId === rec.tenantId) || d.name === rec.name
    );
    const tenantReceipt = rec.tenantId
      ? state.receiptRequests.find((r) => r.tenantId === rec.tenantId && r.officialReceiptNumber)
      : undefined;
    const unitObj = dirMatch?.unitCode
      ? state.units.find((u) => u.code === dirMatch.unitCode)
      : undefined;
    const unitMaintenance = unitObj
      ? state.maintenance.find((m) => m.unitId === unitObj.id && m.status !== 'Resolved')
      : undefined;
    return {
      firstName: dirMatch?.firstName || rec.name.split(' ')[0] || rec.name,
      fullName: rec.name,
      unitCode: rec.unitCode || dirMatch?.unitCode || '',
      unitName: dirMatch?.unitName || '',
      outstandingBalance:
        dirMatch?.outstandingBalance !== undefined
          ? formatNaira(dirMatch.outstandingBalance)
          : '',
      dueDate: dirMatch?.dueDate || '',
      propertyName: state.property.name,
      managerName: state.property.managerName,
      receiptNumber: tenantReceipt?.officialReceiptNumber || '',
      maintenanceIssue: unitMaintenance?.issue || '',
    };
  };

  const handleAiAssist = async (mode: 'generate' | 'polish') => {
    setAiError('');
    setAiNote('');
    setAiLoading(mode);
    try {
      const targetDir =
        directory.find((d) => d.id === aiTenantId) ||
        selectedDirectoryEntries[0] ||
        undefined;
      const recipientSummary = targetDir
        ? {
            name: targetDir.name,
            role: targetDir.role,
            unitCode: targetDir.unitCode,
            unitName: targetDir.unitName,
            outstandingBalanceNaira: targetDir.outstandingBalance,
            dueDate: targetDir.dueDate,
          }
        : customRecipients[0]
        ? {
            name: customRecipients[0].name,
            role: customRecipients[0].role,
          }
        : {
            audienceCount: effectiveRecipients.length,
            note: 'Multi-recipient or general communication; keep tokens like {{firstName}} if helpful.',
          };

      const res = await generateAiMessageDraft({
        mode,
        intent: aiIntent,
        tone: aiTone,
        instruction: aiInstruction,
        existingSubject: subject,
        existingEmailBody: emailBody,
        existingSmsBody: smsBody,
        recipientContext: recipientSummary,
        propertyContext: {
          propertyName: state.property.name,
          propertyAddress: state.property.address,
          managerName: state.property.managerName,
          managerEmail: state.property.managerEmail,
          referenceDate: state.referenceDate,
        },
      });

      setSubject(res.subject);
      setEmailBody(res.emailBody);
      setSmsBody(res.smsBody);
      setAiNote(res.recommendedScheduleNote);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Unable to generate AI draft.');
    } finally {
      setAiLoading(null);
    }
  };

  const canAttemptAction = () => {
    if (effectiveRecipients.length === 0) {
      setSendResultBanner({ tone: 'error', text: 'Select or add at least one recipient.' });
      return false;
    }
    if (needsEmail && validEmailTargets.length === 0 && !needsSms) {
      setSendResultBanner({
        tone: 'error',
        text: 'None of the selected recipients have a valid email address.',
      });
      return false;
    }
    if (needsSms && validSmsTargets.length === 0 && !needsEmail) {
      setSendResultBanner({
        tone: 'error',
        text: 'None of the selected recipients have a valid phone number.',
      });
      return false;
    }
    if (needsEmail && !emailBody.trim()) {
      setSendResultBanner({ tone: 'error', text: 'Email body cannot be empty.' });
      return false;
    }
    if (needsSms && !smsBody.trim()) {
      setSendResultBanner({ tone: 'error', text: 'SMS message body cannot be empty.' });
      return false;
    }
    if (scheduleMode === 'later') {
      const dt = new Date(scheduledAtLocal);
      if (Number.isNaN(dt.getTime())) {
        setSendResultBanner({ tone: 'error', text: 'Select a valid scheduled date and time.' });
        return false;
      }
    }
    return true;
  };

  const handleScheduleMessages = async () => {
    setSendResultBanner(null);
    if (!canAttemptAction()) return;

    const scheduledIso = new Date(scheduledAtLocal).toISOString();
    const evtId = `evt-sched-${Date.now().toString(36)}`;
    const records: NotificationRecord[] = [];
    let gatewayScheduledCount = 0;

    if (needsEmail) {
      for (const rec of validEmailTargets) {
        const vars = getTemplateVars(rec);
        records.push({
          id: `ntf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          eventId: evtId,
          eventType: 'Custom Scheduled Message',
          relatedRecordId: rec.tenantId || 'custom',
          tenantId: rec.tenantId,
          recipientName: rec.name,
          recipientRole: rec.role,
          recipientContact: rec.email!,
          channel: 'Email',
          status: 'Queued',
          deliveryProvider:
            state.settings.preferredEmailProvider === 'smtp' ? 'SMTP' : 'Gmail',
          subject: interpolateTemplate(
            subject.trim() || `Notice from ${state.property.name}`,
            vars
          ),
          messageBody: interpolateTemplate(emailBody, vars),
          scheduledAt: scheduledIso,
          retryCount: 0,
          isCustom: true,
          createdBy: state.property.managerName,
          overrideQuietHours,
        });
      }
    }

    if (needsSms) {
      for (const rec of validSmsTargets) {
        const vars = getTemplateVars(rec);
        const resolvedSms = interpolateTemplate(smsBody, vars);
        const recId = `ntf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

        if (scheduleSmsViaGatewayNow && integrationStatus?.bulkSmsConfigured) {
          try {
            const smsRes = await sendSmsViaGateway({
              to: rec.phone!,
              message: resolvedSms,
              reference: recId,
              sendtime: scheduledIso,
            });
            const parsedUnits = smsRes.units !== undefined ? Number(smsRes.units) : NaN;
            const effectiveUnits =
              Number.isFinite(parsedUnits) && parsedUnits > 0
                ? parsedUnits
                : getSmsRecordUnits({
                    status: 'Sent',
                    messageBody: resolvedSms,
                  }).billableUnits;
            const costNaira = getSmsRecordCostNaira(
              {
                status: 'Sent',
                messageBody: resolvedSms,
                smsUnits: effectiveUnits,
              },
              state.settings.smsUnitCostNaira
            );
            records.push({
              id: recId,
              eventId: evtId,
              eventType: 'Custom Scheduled Message',
              relatedRecordId: rec.tenantId || 'custom',
              tenantId: rec.tenantId,
              recipientName: rec.name,
              recipientRole: rec.role,
              recipientContact: rec.phone!,
              channel: 'SMS',
              status: 'Sent',
              deliveryProvider: smsRes.provider,
              externalMessageId: smsRes.messageId,
              smsUnits: effectiveUnits,
              smsCostNaira: costNaira,
              messageBody: resolvedSms,
              scheduledAt: scheduledIso,
              attemptedAt: new Date().toISOString(),
              retryCount: 0,
              isCustom: true,
              createdBy: state.property.managerName,
              overrideQuietHours,
            });
            gatewayScheduledCount++;
            continue;
          } catch (err) {
            records.push({
              id: recId,
              eventId: evtId,
              eventType: 'Custom Scheduled Message',
              relatedRecordId: rec.tenantId || 'custom',
              tenantId: rec.tenantId,
              recipientName: rec.name,
              recipientRole: rec.role,
              recipientContact: rec.phone!,
              channel: 'SMS',
              status: 'Failed',
              deliveryProvider: 'BulkSMSLive',
              messageBody: resolvedSms,
              scheduledAt: scheduledIso,
              attemptedAt: new Date().toISOString(),
              retryCount: 0,
              failureReason:
                err instanceof Error ? err.message : 'BulkSMSLive sendtime scheduling failed',
              isCustom: true,
              createdBy: state.property.managerName,
              overrideQuietHours,
            });
            continue;
          }
        }

        records.push({
          id: recId,
          eventId: evtId,
          eventType: 'Custom Scheduled Message',
          relatedRecordId: rec.tenantId || 'custom',
          tenantId: rec.tenantId,
          recipientName: rec.name,
          recipientRole: rec.role,
          recipientContact: rec.phone!,
          channel: 'SMS',
          status: 'Queued',
          deliveryProvider: integrationStatus?.bulkSmsConfigured
            ? 'BulkSMSLive'
            : integrationStatus?.smsWebhookConfigured
            ? 'SMS Gateway'
            : 'Ledger Only',
          messageBody: resolvedSms,
          scheduledAt: scheduledIso,
          retryCount: 0,
          isCustom: true,
          createdBy: state.property.managerName,
          overrideQuietHours,
        });
      }
    }

    if (records.length === 0) {
      setSendResultBanner({
        tone: 'error',
        text: 'No valid email/phone targets matched the chosen channel(s).',
      });
      return;
    }

    appendNotifications(
      records,
      'Custom Message Scheduled',
      `Scheduled ${records.length} custom message(s) for ${new Date(scheduledIso).toLocaleString()}${
        gatewayScheduledCount > 0 ? ` (${gatewayScheduledCount} submitted via BulkSMSLive sendtime)` : ''
      }.`
    );

    setSendResultBanner({
      tone: 'success',
      text: `Scheduled ${records.length} message(s) for ${new Date(scheduledIso).toLocaleString()}. View them in Notifications.`,
    });
    setTimeout(() => setComposerOpen(false), 900);
  };

  const handleOpenConfirmSend = () => {
    setSendResultBanner(null);
    if (!canAttemptAction()) return;
    if (needsEmail && immediateEmailMode === 'gmail' && !gmailAccessToken) {
      setSendResultBanner({
        tone: 'error',
        text: 'Sign in with Google above (or choose Server SMTP / Mail App / .eml) before sending via Gmail.',
      });
      return;
    }
    if (needsEmail && immediateEmailMode === 'smtp' && !integrationStatus?.smtpConfigured) {
      setSendResultBanner({
        tone: 'error',
        text: 'Server SMTP is not configured in environment variables. Connect Gmail or choose Mail App / .eml.',
      });
      return;
    }
    setConfirmingSend(true);
  };

  const handleConfirmedSendNow = async () => {
    setIsSending(true);
    setSendResultBanner(null);
    const evtId = `evt-custom-${Date.now().toString(36)}`;
    const nowIso = new Date().toISOString();
    const created: NotificationRecord[] = [];

    let successCount = 0;
    let failCount = 0;
    let firstError = '';

    // 1. Handle Emails
    if (needsEmail) {
      for (const rec of validEmailTargets) {
        const vars = getTemplateVars(rec);
        const resolvedSubj = interpolateTemplate(
          subject.trim() || `Message from ${state.property.name}`,
          vars
        );
        const resolvedBody = interpolateTemplate(emailBody, vars);
        const recId = `ntf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

        if (immediateEmailMode === 'mailto') {
          openMailClientDraft({
            to: rec.email!,
            subject: resolvedSubj,
            body: resolvedBody,
          });
          created.push({
            id: recId,
            eventId: evtId,
            eventType: 'Custom Direct Message',
            relatedRecordId: rec.tenantId || 'custom',
            tenantId: rec.tenantId,
            recipientName: rec.name,
            recipientRole: rec.role,
            recipientContact: rec.email!,
            channel: 'Email',
            status: 'Sent',
            deliveryProvider: 'Mailto / EML',
            subject: resolvedSubj,
            messageBody: resolvedBody,
            scheduledAt: nowIso,
            attemptedAt: nowIso,
            retryCount: 0,
            isCustom: true,
            createdBy: state.property.managerName,
          });
          successCount++;
        } else if (immediateEmailMode === 'eml') {
          downloadEmlFile({
            from: state.property.managerEmail,
            to: rec.email!,
            subject: resolvedSubj,
            body: resolvedBody,
          });
          created.push({
            id: recId,
            eventId: evtId,
            eventType: 'Custom Direct Message',
            relatedRecordId: rec.tenantId || 'custom',
            tenantId: rec.tenantId,
            recipientName: rec.name,
            recipientRole: rec.role,
            recipientContact: rec.email!,
            channel: 'Email',
            status: 'Sent',
            deliveryProvider: 'Mailto / EML',
            subject: resolvedSubj,
            messageBody: resolvedBody,
            scheduledAt: nowIso,
            attemptedAt: nowIso,
            retryCount: 0,
            isCustom: true,
            createdBy: state.property.managerName,
          });
          successCount++;
        } else if (immediateEmailMode === 'gmail') {
          try {
            const gRes = await sendEmailViaGmail(gmailAccessToken!, {
              from: gmailUser?.email || state.property.managerEmail,
              to: rec.email!,
              subject: resolvedSubj,
              body: resolvedBody,
              replyTo: state.property.managerEmail,
            });
            created.push({
              id: recId,
              eventId: evtId,
              eventType: 'Custom Direct Message',
              relatedRecordId: rec.tenantId || 'custom',
              tenantId: rec.tenantId,
              recipientName: rec.name,
              recipientRole: rec.role,
              recipientContact: rec.email!,
              channel: 'Email',
              status: 'Delivered',
              deliveryProvider: 'Gmail',
              externalMessageId: gRes.messageId,
              subject: resolvedSubj,
              messageBody: resolvedBody,
              scheduledAt: nowIso,
              attemptedAt: nowIso,
              retryCount: 0,
              isCustom: true,
              createdBy: state.property.managerName,
            });
            successCount++;
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Gmail send failed';
            if (msg.includes('401') || msg.toLowerCase().includes('unauthorized')) {
              clearGmailSessionToken();
            }
            if (!firstError) firstError = msg;
            failCount++;
            created.push({
              id: recId,
              eventId: evtId,
              eventType: 'Custom Direct Message',
              relatedRecordId: rec.tenantId || 'custom',
              tenantId: rec.tenantId,
              recipientName: rec.name,
              recipientRole: rec.role,
              recipientContact: rec.email!,
              channel: 'Email',
              status: 'Failed',
              deliveryProvider: 'Gmail',
              subject: resolvedSubj,
              messageBody: resolvedBody,
              scheduledAt: nowIso,
              attemptedAt: nowIso,
              retryCount: 0,
              failureReason: msg,
              isCustom: true,
              createdBy: state.property.managerName,
            });
          }
        } else if (immediateEmailMode === 'smtp') {
          try {
            const sRes = await sendEmailViaSmtp({
              to: rec.email!,
              subject: resolvedSubj,
              body: resolvedBody,
              replyTo: state.property.managerEmail,
            });
            created.push({
              id: recId,
              eventId: evtId,
              eventType: 'Custom Direct Message',
              relatedRecordId: rec.tenantId || 'custom',
              tenantId: rec.tenantId,
              recipientName: rec.name,
              recipientRole: rec.role,
              recipientContact: rec.email!,
              channel: 'Email',
              status: 'Delivered',
              deliveryProvider: 'SMTP',
              externalMessageId: sRes.messageId,
              subject: resolvedSubj,
              messageBody: resolvedBody,
              scheduledAt: nowIso,
              attemptedAt: nowIso,
              retryCount: 0,
              isCustom: true,
              createdBy: state.property.managerName,
            });
            successCount++;
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'SMTP send failed';
            if (!firstError) firstError = msg;
            failCount++;
            created.push({
              id: recId,
              eventId: evtId,
              eventType: 'Custom Direct Message',
              relatedRecordId: rec.tenantId || 'custom',
              tenantId: rec.tenantId,
              recipientName: rec.name,
              recipientRole: rec.role,
              recipientContact: rec.email!,
              channel: 'Email',
              status: 'Failed',
              deliveryProvider: 'SMTP',
              subject: resolvedSubj,
              messageBody: resolvedBody,
              scheduledAt: nowIso,
              attemptedAt: nowIso,
              retryCount: 0,
              failureReason: msg,
              isCustom: true,
              createdBy: state.property.managerName,
            });
          }
        }
      }
    }

    // 2. Handle SMS
    if (needsSms) {
      for (const rec of validSmsTargets) {
        const vars = getTemplateVars(rec);
        const resolvedSms = interpolateTemplate(smsBody, vars);
        const recId = `ntf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        try {
          const smsRes = await sendSmsViaGateway({
            to: rec.phone!,
            message: resolvedSms,
            reference: recId,
          });
          const parsedUnits = smsRes.units !== undefined ? Number(smsRes.units) : NaN;
          const effectiveUnits =
            Number.isFinite(parsedUnits) && parsedUnits > 0
              ? parsedUnits
              : getSmsRecordUnits({
                  status: 'Sent',
                  messageBody: resolvedSms,
                }).billableUnits;
          const costNaira = getSmsRecordCostNaira(
            {
              status: 'Sent',
              messageBody: resolvedSms,
              smsUnits: effectiveUnits,
            },
            state.settings.smsUnitCostNaira
          );
          created.push({
            id: recId,
            eventId: evtId,
            eventType: 'Custom Direct Message',
            relatedRecordId: rec.tenantId || 'custom',
            tenantId: rec.tenantId,
            recipientName: rec.name,
            recipientRole: rec.role,
            recipientContact: rec.phone!,
            channel: 'SMS',
            status: 'Sent',
            deliveryProvider: smsRes.provider,
            externalMessageId: smsRes.messageId,
            smsUnits: effectiveUnits,
            smsCostNaira: costNaira,
            messageBody: resolvedSms,
            scheduledAt: nowIso,
            attemptedAt: nowIso,
            retryCount: 0,
            isCustom: true,
            createdBy: state.property.managerName,
          });
          successCount++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'SMS dispatch failed';
          if (!firstError) firstError = msg;
          failCount++;
          created.push({
            id: recId,
            eventId: evtId,
            eventType: 'Custom Direct Message',
            relatedRecordId: rec.tenantId || 'custom',
            tenantId: rec.tenantId,
            recipientName: rec.name,
            recipientRole: rec.role,
            recipientContact: rec.phone!,
            channel: 'SMS',
            status: 'Failed',
            deliveryProvider: 'SMS Gateway',
            messageBody: resolvedSms,
            scheduledAt: nowIso,
            attemptedAt: nowIso,
            retryCount: 0,
            failureReason: msg,
            isCustom: true,
            createdBy: state.property.managerName,
          });
        }
      }
    }

    if (created.length > 0) {
      appendNotifications(
        created,
        'Custom Direct Message Dispatched',
        `Dispatched ${successCount} custom message(s) (${failCount} failed) via ${channelMode}.`
      );
    }

    setIsSending(false);
    setConfirmingSend(false);

    if (failCount > 0 && successCount === 0) {
      setSendResultBanner({
        tone: 'error',
        text: `Delivery failed: ${firstError || 'Check email/SMS provider configuration.'}`,
      });
    } else if (failCount > 0) {
      setSendResultBanner({
        tone: 'warning',
        text: `${successCount} sent, ${failCount} failed (${firstError}). Failed items can be retried in Notifications.`,
      });
    } else {
      setSendResultBanner({
        tone: 'success',
        text: `Successfully sent ${successCount} message(s).`,
      });
      setTimeout(() => setComposerOpen(false), 900);
    }
    void updateNotificationRecord;
  };

  const previewSampleRecipient = effectiveRecipients[0];
  const previewSampleVars = previewSampleRecipient ? getTemplateVars(previewSampleRecipient) : null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-2.5 sm:p-4 bg-black/45 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="custom-composer-title"
    >
      <div className="w-full max-w-5xl bg-[var(--bg-surface)] rounded-2xl shadow-[var(--shadow-sheet)] border border-[var(--border-hairline)] max-h-[94vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-[var(--border-subtle)] flex items-start sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="custom-composer-title"
              className="hig-title-3"
            >
              Compose & Schedule SMS / Email
            </h2>
            <p className="hig-footnote mt-0.5">
              Send immediately or schedule messages for tenants, lawyers, receipt issuers, or any custom contact.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setComposerOpen(false)}
            className="hig-touch-icon shrink-0"
            aria-label="Close message composer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-5">
          {sendResultBanner && (
            <div
              className={`p-3.5 rounded-xl border text-[13px] flex items-start gap-2.5 ${
                sendResultBanner.tone === 'success'
                  ? 'bg-[var(--status-success-bg)] border-[var(--status-success-ink)]/20 text-[var(--status-success-ink)]'
                  : sendResultBanner.tone === 'warning'
                  ? 'bg-[var(--status-warning-bg)] border-[var(--status-warning-ink)]/20 text-[var(--status-warning-ink)]'
                  : 'bg-[var(--status-danger-bg)] border-[var(--status-danger-ink)]/20 text-[var(--status-danger-ink)]'
              }`}
            >
              {sendResultBanner.tone === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <span>{sendResultBanner.text}</span>
            </div>
          )}

          {/* Confirmation Step Panel */}
          {confirmingSend ? (
            <div className="hig-card-inset p-4 sm:p-5 space-y-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="hig-headline">
                    Confirm Dispatch Details
                  </h3>
                  <p className="hig-footnote mt-0.5">
                    Review recipients, email/SMS providers, and message preview before sending.
                  </p>
                </div>
                <span className="px-3 py-1 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-[12px] font-semibold tabular-nums shrink-0">
                  {validEmailTargets.length} Email · {validSmsTargets.length} SMS
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[13px]">
                <div className="hig-card p-3.5">
                  <span className="hig-caption uppercase tracking-[0.04em] font-semibold block mb-1">
                    Channel & Provider
                  </span>
                  {needsEmail && (
                    <p className="text-[var(--ink-primary)] font-medium">
                      Email via{' '}
                      {immediateEmailMode === 'gmail'
                        ? `Gmail (${gmailUser?.email || 'Connected'})`
                        : immediateEmailMode === 'smtp'
                        ? `Server SMTP (${integrationStatus?.smtpHost || 'Configured'})`
                        : immediateEmailMode === 'mailto'
                        ? 'Default Mail App (mailto:)'
                        : 'RFC 2822 .eml Download'}
                    </p>
                  )}
                  {needsSms && (
                    <p className="text-[var(--ink-primary)] font-medium mt-0.5">
                      SMS via{' '}
                      {integrationStatus?.bulkSmsConfigured
                        ? `BulkSMSLive v2 (${integrationStatus.bulkSmsSenderName || 'PropLedger'})`
                        : integrationStatus?.smsWebhookConfigured
                        ? 'Configured SMS Gateway'
                        : 'PropLedger SMS Ledger'}
                    </p>
                  )}
                </div>

                <div className="hig-card p-3.5">
                  <span className="hig-caption uppercase tracking-[0.04em] font-semibold block mb-1">
                    Recipients ({effectiveRecipients.length})
                  </span>
                  <div className="max-h-24 overflow-y-auto space-y-1 text-[var(--ink-secondary)]">
                    {effectiveRecipients.map((r, i) => (
                      <div key={`${r.name}-${i}`} className="truncate">
                        {r.name} ({r.role}) — {r.email || r.phone}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {needsEmail && (
                <div className="hig-card p-4 space-y-1.5">
                  <span className="hig-caption uppercase tracking-[0.04em] font-semibold block">
                    Email Preview {previewSampleRecipient ? `(for ${previewSampleRecipient.name})` : ''}
                  </span>
                  <p className="hig-subhead font-semibold text-[var(--ink-primary)]">
                    {previewSampleVars
                      ? interpolateTemplate(subject || `Message from ${state.property.name}`, previewSampleVars)
                      : subject || `Message from ${state.property.name}`}
                  </p>
                  <pre className="whitespace-pre-wrap font-sans text-[13px] text-[var(--ink-secondary)] leading-relaxed max-h-44 overflow-y-auto">
                    {previewSampleVars ? interpolateTemplate(emailBody, previewSampleVars) : emailBody}
                  </pre>
                </div>
              )}

              {needsSms && (
                <div className="hig-card p-4 space-y-1">
                  <span className="hig-caption uppercase tracking-[0.04em] font-semibold block">
                    SMS Preview ({smsStats.segments} segment{smsStats.segments === 1 ? '' : 's'})
                  </span>
                  <p className="text-[13px] text-[var(--ink-secondary)] leading-relaxed">
                    {previewSampleVars ? interpolateTemplate(smsBody, previewSampleVars) : smsBody}
                  </p>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmingSend(false)}
                  disabled={isSending}
                  className="hig-btn-secondary"
                >
                  Back to Edit
                </button>
                <button
                  type="button"
                  onClick={handleConfirmedSendNow}
                  disabled={isSending}
                  className="hig-btn-primary"
                >
                  <Send className="w-4 h-4" />
                  <span>{isSending ? 'Sending...' : 'Confirm & Send Now'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left Column: Directory & Custom Recipients */}
              <div className="lg:col-span-5 space-y-3 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="hig-subhead font-semibold text-[var(--ink-primary)] flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-[var(--ink-tertiary)]" />
                    <span>Recipients ({effectiveRecipients.length})</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAddCustom((v) => !v)}
                    className="hig-btn-secondary px-3"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Add Anyone</span>
                  </button>
                </div>

                {/* Preset Quick-Selects */}
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => applyPresetGroup('overdue')}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--status-danger-bg)] text-[var(--status-danger-ink)] text-[12px] font-medium hover:opacity-90 active:scale-[0.98] transition-all"
                  >
                    + Overdue Tenants
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPresetGroup('allTenants')}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--bg-surface-secondary)] text-[var(--ink-secondary)] text-[12px] font-medium hover:bg-[var(--bg-surface-tertiary)] hover:text-[var(--ink-primary)] active:scale-[0.98] transition-all"
                  >
                    + All Tenants
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPresetGroup('lawyers')}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--bg-surface-secondary)] text-[var(--ink-secondary)] text-[12px] font-medium hover:bg-[var(--bg-surface-tertiary)] hover:text-[var(--ink-primary)] active:scale-[0.98] transition-all"
                  >
                    + Lawyers
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPresetGroup('issuers')}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--bg-surface-secondary)] text-[var(--ink-secondary)] text-[12px] font-medium hover:bg-[var(--bg-surface-tertiary)] hover:text-[var(--ink-primary)] active:scale-[0.98] transition-all"
                  >
                    + Receipt Issuers
                  </button>
                  {(selectedIds.length > 0 || customRecipients.length > 0) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedIds([]);
                        setCustomRecipients([]);
                      }}
                      className="min-h-[40px] px-3 py-1.5 rounded-xl text-[var(--ink-tertiary)] text-[12px] font-medium hover:text-[var(--ink-primary)] hover:bg-[var(--bg-hover)]"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Add Anyone Inline Form */}
                {showAddCustom && (
                  <div className="hig-card-inset p-3.5 space-y-2.5">
                    <span className="hig-subhead font-semibold text-[var(--ink-primary)] block">
                      Add Custom Recipient (Anyone)
                    </span>
                    {customAddError && (
                      <p className="text-[12px] text-[var(--status-danger-ink)]">{customAddError}</p>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                        placeholder="Recipient Name"
                        aria-label="Custom recipient name"
                        className="hig-input w-full"
                      />
                      <select
                        value={customRole}
                        onChange={(e) =>
                          setCustomRole(e.target.value as StakeholderRole | 'Tenant' | 'Custom')
                        }
                        aria-label="Custom recipient role"
                        className="hig-input w-full"
                      >
                        <option value="Custom">External / Custom</option>
                        <option value="Lawyer">Lawyer / Legal Counsel</option>
                        <option value="Tenant">Tenant</option>
                        <option value="Receipt Issuer">Receipt Issuer</option>
                        <option value="Additional Contact">Estate / Vendor</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="email"
                        value={customEmail}
                        onChange={(e) => setCustomEmail(e.target.value)}
                        placeholder="email@domain.com"
                        aria-label="Custom recipient email"
                        className="hig-input w-full"
                      />
                      <input
                        type="text"
                        value={customPhone}
                        onChange={(e) => setCustomPhone(e.target.value)}
                        placeholder="+234 800..."
                        aria-label="Custom recipient phone"
                        className="hig-input w-full"
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowAddCustom(false)}
                        className="hig-btn-secondary"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleAddCustomRecipient}
                        className="hig-btn-primary"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Add Recipient</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Custom Added Chips */}
                {customRecipients.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="hig-caption uppercase tracking-[0.04em] font-semibold block">
                      Custom Recipients ({customRecipients.length})
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {customRecipients.map((cr, idx) => (
                        <span
                          key={`${cr.name}-${idx}`}
                          className="inline-flex items-center gap-1.5 min-h-[36px] pl-3 pr-1.5 py-1 rounded-xl bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] text-[12.5px] text-[var(--ink-primary)]"
                        >
                          <span className="font-medium">{cr.name}</span>
                          <span className="text-[var(--ink-tertiary)]">({cr.role})</span>
                          <button
                            type="button"
                            onClick={() =>
                              setCustomRecipients((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-[var(--ink-tertiary)] hover:text-[var(--status-danger-ink)] hover:bg-[var(--bg-hover)]"
                            aria-label={`Remove ${cr.name}`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Directory Search & Checkbox List */}
                <input
                  type="text"
                  value={recipientSearch}
                  onChange={(e) => setRecipientSearch(e.target.value)}
                  placeholder="Filter tenants, lawyers, or unit code..."
                  aria-label="Filter directory recipients"
                  className="hig-input w-full"
                />

                <div className="max-h-64 overflow-y-auto rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] divide-y divide-[var(--border-subtle)]">
                  {filteredDirectory.map((d) => {
                    const checked = selectedIds.includes(d.id);
                    return (
                      <label
                        key={d.id}
                        className={`min-h-[52px] flex items-start gap-3 p-3 cursor-pointer text-[13px] transition-colors ${
                          checked ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--bg-hover)]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRecipientId(d.id)}
                          className="mt-1 w-4 h-4 rounded accent-[var(--accent)] shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-[var(--ink-primary)] truncate">{d.name}</span>
                            <span className="hig-caption text-[var(--ink-secondary)] shrink-0">
                              {d.unitCode ? `${d.unitCode} · ${d.role}` : d.role}
                            </span>
                          </div>
                          <div className="hig-caption truncate">
                            {d.email || 'No email'} · {d.phone || 'No phone'}
                            {d.outstandingBalance ? ` · Owes ${formatNaira(d.outstandingBalance)}` : ''}
                          </div>
                          {d.notificationsPaused && (
                            <span className="text-[11.5px] font-medium text-[var(--status-warning-ink)] block mt-0.5">
                              Automated reminders paused on tenant profile
                            </span>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>

                {/* Warnings for Paused or Missing Contact Channel */}
                {pausedTenantsSelected.length > 0 && (
                  <label className="min-h-[44px] flex items-start gap-2.5 p-3 rounded-xl bg-[var(--status-warning-bg)] text-[12.5px] text-[var(--status-warning-ink)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includePausedTenants}
                      onChange={(e) => setIncludePausedTenants(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded accent-[var(--accent)] shrink-0"
                    />
                    <span>
                      {pausedTenantsSelected.length} selected tenant(s) have paused notifications. Include as manual manager override.
                    </span>
                  </label>
                )}

                {(missingEmailRecipients.length > 0 || missingSmsRecipients.length > 0) && (
                  <div className="p-3 rounded-xl bg-[var(--status-danger-bg)] text-[12px] text-[var(--status-danger-ink)] space-y-1">
                    {missingEmailRecipients.length > 0 && (
                      <p>
                        Missing valid email for:{' '}
                        {missingEmailRecipients.map((r) => r.name).join(', ')} (skipped for Email)
                      </p>
                    )}
                    {missingSmsRecipients.length > 0 && (
                      <p>
                        Missing valid phone for:{' '}
                        {missingSmsRecipients.map((r) => r.name).join(', ')} (skipped for SMS)
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Right Column: AI Drafting, Message Content, Channel, Scheduling & Provider */}
              <div className="lg:col-span-7 space-y-4 min-w-0">
                {/* Channel Selector & Schedule Toggle */}
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div className="hig-segmented" role="tablist" aria-label="Message channel">
                    {(['Email', 'SMS', 'Both'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        role="tab"
                        aria-selected={channelMode === mode}
                        data-active={channelMode === mode ? 'true' : 'false'}
                        onClick={() => setChannelMode(mode)}
                        className="hig-segmented-item gap-1.5 whitespace-nowrap"
                      >
                        {mode === 'Email' && <Mail className="w-3.5 h-3.5" />}
                        {mode === 'SMS' && <MessageSquare className="w-3.5 h-3.5" />}
                        {mode === 'Both' && <Send className="w-3.5 h-3.5" />}
                        <span>{mode === 'Both' ? 'Email + SMS' : mode}</span>
                      </button>
                    ))}
                  </div>

                  <div className="hig-segmented" role="tablist" aria-label="Dispatch timing">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={scheduleMode === 'now'}
                      data-active={scheduleMode === 'now' ? 'true' : 'false'}
                      onClick={() => setScheduleMode('now')}
                      className="hig-segmented-item whitespace-nowrap"
                    >
                      Send Now
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={scheduleMode === 'later'}
                      data-active={scheduleMode === 'later' ? 'true' : 'false'}
                      onClick={() => setScheduleMode('later')}
                      className="hig-segmented-item gap-1.5 whitespace-nowrap"
                    >
                      <CalendarClock className="w-3.5 h-3.5" />
                      <span>Schedule</span>
                    </button>
                  </div>
                </div>

                {/* AI Drafting Panel */}
                <div className="hig-card-inset p-3.5 sm:p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="hig-subhead font-semibold text-[var(--ink-primary)] flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-[var(--accent-ink)]" />
                      <span>AI Message Assistant (Gemini 4)</span>
                    </span>
                    <span className="hig-caption">
                      {integrationStatus?.aiConfigured ? 'Server AI Ready' : 'AI Status Unconfigured'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <select
                      value={aiIntent}
                      onChange={(e) => setAiIntent(e.target.value)}
                      aria-label="AI message intent"
                      className="hig-input w-full"
                    >
                      <option value="Rent Reminder">Rent Reminder</option>
                      <option value="Arrears Escalation">Arrears Escalation</option>
                      <option value="Lawyer Brief / Legal Demand">Lawyer Brief / Legal Notice</option>
                      <option value="Receipt Follow-Up">Receipt Issuer Follow-Up</option>
                      <option value="Payment Commitment Check-In">Promise-to-Pay Follow-Up</option>
                      <option value="Maintenance / Estate Notice">Estate / Maintenance Notice</option>
                      <option value="General Notice">General Notice</option>
                    </select>
                    <select
                      value={aiTone}
                      onChange={(e) => setAiTone(e.target.value)}
                      aria-label="AI message tone"
                      className="hig-input w-full"
                    >
                      <option value="Professional & Polite">Professional & Polite</option>
                      <option value="Firm & Urgent">Firm & Urgent</option>
                      <option value="Warm & Cooperative">Warm & Cooperative</option>
                      <option value="Formal Legal Notice">Formal Legal Notice</option>
                    </select>
                    <select
                      value={aiTenantId}
                      onChange={(e) => setAiTenantId(e.target.value)}
                      aria-label="Context tenant for AI drafting"
                      className="hig-input w-full"
                    >
                      <option value="">Context: Selected / General</option>
                      {directory
                        .filter((d) => d.role === 'Tenant')
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({t.unitCode})
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={aiInstruction}
                      onChange={(e) => setAiInstruction(e.target.value)}
                      placeholder="Optional AI prompt (e.g. 'Remind calmly about Friday tranche & ask for transfer ref')..."
                      className="hig-input flex-1"
                    />
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleAiAssist('generate')}
                        disabled={aiLoading !== null}
                        className="hig-btn-primary whitespace-nowrap"
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>{aiLoading === 'generate' ? 'Drafting...' : 'Generate Draft'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAiAssist('polish')}
                        disabled={aiLoading !== null || (!emailBody.trim() && !smsBody.trim())}
                        className="hig-btn-secondary whitespace-nowrap"
                      >
                        <Wand2 className="w-4 h-4" />
                        <span>{aiLoading === 'polish' ? 'Polishing...' : 'Polish'}</span>
                      </button>
                    </div>
                  </div>

                  {aiError && (
                    <p className="text-[12.5px] text-[var(--status-danger-ink)] bg-[var(--status-danger-bg)] px-3 py-2 rounded-xl">
                      {aiError}
                    </p>
                  )}
                  {aiNote && (
                    <p className="text-[12.5px] text-[var(--status-success-ink)] bg-[var(--status-success-bg)] px-3 py-2 rounded-xl">
                      AI Scheduling Note: {aiNote}
                    </p>
                  )}
                </div>

                {/* Merge Tokens Bar */}
                <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                  <span className="hig-caption font-semibold mr-1">Insert Token:</span>
                  {[
                    '{{tenant_name}}',
                    '{{due_date}}',
                    '{{unit_code}}',
                    '{{amount_due}}',
                    '{{receipt_number}}',
                    '{{maintenance_issue}}',
                    '{{property_name}}',
                  ].map((tok) => (
                    <button
                      key={tok}
                      type="button"
                      onClick={() => insertToken(tok)}
                      className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] text-[var(--ink-secondary)] font-mono-nums hover:bg-[var(--bg-surface-tertiary)] hover:text-[var(--ink-primary)] transition-colors"
                    >
                      {tok}
                    </button>
                  ))}
                </div>

                {/* Email Subject & Body */}
                {needsEmail && (
                  <div className="space-y-3">
                    <div>
                      <label
                        htmlFor="composer-subject"
                        className="block hig-footnote font-semibold text-[var(--ink-secondary)] mb-1.5"
                      >
                        Email Subject
                      </label>
                      <input
                        id="composer-subject"
                        type="text"
                        value={subject}
                        onFocus={() => setActiveField('subject')}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder={`Important Notice — ${state.property.name}`}
                        className="hig-input w-full"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="composer-email-body"
                        className="block hig-footnote font-semibold text-[var(--ink-secondary)] mb-1.5"
                      >
                        Email Body
                      </label>
                      <textarea
                        id="composer-email-body"
                        rows={5}
                        value={emailBody}
                        onFocus={() => setActiveField('emailBody')}
                        onChange={(e) => setEmailBody(e.target.value)}
                        placeholder={`Dear {{tenant_name}},\n\n...`}
                        className="hig-input w-full min-h-[120px] leading-relaxed"
                      />
                    </div>
                  </div>
                )}

                {/* SMS Body, Saved Template Selector & Segment Counter */}
                {needsSms && (
                  <div className="space-y-2.5">
                    {state.smsTemplates.length > 0 && (
                      <div className="hig-card-inset flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3">
                        <label
                          htmlFor="composer-sms-template"
                          className="hig-footnote font-semibold text-[var(--ink-secondary)] shrink-0"
                        >
                          Load Saved SMS Template:
                        </label>
                        <select
                          id="composer-sms-template"
                          value={selectedTemplateId}
                          onChange={(e) => {
                            const tplId = e.target.value;
                            setSelectedTemplateId(tplId);
                            const found = state.smsTemplates.find((t) => t.id === tplId);
                            if (found) {
                              setSmsBody(found.body);
                              setActiveField('smsBody');
                            }
                          }}
                          className="hig-input w-full sm:w-auto flex-1 max-w-sm"
                        >
                          <option value="">-- Choose a saved template --</option>
                          {state.smsTemplates.map((tpl) => (
                            <option key={tpl.id} value={tpl.id}>
                              [{tpl.category}] {tpl.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div>
                      <div className="flex items-center justify-between mb-1.5 gap-2">
                        <label
                          htmlFor="composer-sms-body"
                          className="block hig-footnote font-semibold text-[var(--ink-secondary)]"
                        >
                          SMS Message
                        </label>
                        <span className="hig-caption font-mono-nums">
                          {smsStats.length} chars · {smsStats.segments} segment
                          {smsStats.segments === 1 ? '' : 's'} ({smsStats.encoding})
                        </span>
                      </div>
                      <textarea
                        id="composer-sms-body"
                        rows={3}
                        value={smsBody}
                        onFocus={() => setActiveField('smsBody')}
                        onChange={(e) => setSmsBody(e.target.value)}
                        placeholder="Short SMS notice with payment reference or {{tenant_name}} / {{due_date}}..."
                        className="hig-input w-full min-h-[88px] leading-relaxed"
                      />
                    </div>
                  </div>
                )}

                {/* Schedule Date/Time Controls */}
                {scheduleMode === 'later' && (
                  <div className="hig-card-inset p-3.5 sm:p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div>
                        <label
                          htmlFor="composer-schedule-at"
                          className="block hig-subhead font-semibold text-[var(--ink-primary)]"
                        >
                          Scheduled Dispatch Date & Time
                        </label>
                        <p className="hig-caption">
                          Quiet hours: {state.settings.quietHoursStart}–{state.settings.quietHoursEnd} WAT
                        </p>
                      </div>
                      <input
                        id="composer-schedule-at"
                        type="datetime-local"
                        value={scheduledAtLocal}
                        onChange={(e) => setScheduledAtLocal(e.target.value)}
                        className="hig-input font-mono-nums w-full sm:w-auto"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setScheduledAtLocal(getNextBusinessPreset('1h'))}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[12px] font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-hover)]"
                      >
                        In 1 Hour
                      </button>
                      <button
                        type="button"
                        onClick={() => setScheduledAtLocal(getNextBusinessPreset('tomorrow9'))}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[12px] font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-hover)]"
                      >
                        Tomorrow 09:00 AM
                      </button>
                      <button
                        type="button"
                        onClick={() => setScheduledAtLocal(getNextBusinessPreset('monday9'))}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[12px] font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-hover)]"
                      >
                        Next Monday 09:00 AM
                      </button>
                    </div>
                    {needsSms && integrationStatus?.bulkSmsConfigured && (
                      <label className="min-h-[44px] flex items-start gap-2.5 pt-1 text-[13px] text-[var(--ink-primary)] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={scheduleSmsViaGatewayNow}
                          onChange={(e) => setScheduleSmsViaGatewayNow(e.target.checked)}
                          className="mt-1 w-4 h-4 rounded accent-[var(--accent)] shrink-0"
                        />
                        <span>
                          Queue scheduled SMS directly on BulkSMSLive servers now (uses BulkSMSLive <code className="text-[12px] font-mono-nums">sendtime</code>)
                        </span>
                      </label>
                    )}
                  </div>
                )}

                {/* Quiet Hours Warning */}
                {quietHoursTriggered && (
                  <label className="min-h-[44px] flex items-start gap-2.5 p-3 rounded-xl bg-[var(--status-warning-bg)] text-[12.5px] text-[var(--status-warning-ink)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={overrideQuietHours}
                      onChange={(e) => setOverrideQuietHours(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded accent-[var(--accent)] shrink-0"
                    />
                    <span>
                      Dispatch time falls inside quiet hours ({state.settings.quietHoursStart}–{state.settings.quietHoursEnd}). Check to allow urgent override.
                    </span>
                  </label>
                )}

                {/* Email Client Provider Picker (Immediate Send) */}
                {scheduleMode === 'now' && needsEmail && (
                  <div className="hig-card-inset p-3.5 sm:p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2.5">
                      <span className="hig-subhead font-semibold text-[var(--ink-primary)]">
                        Email Client Delivery Method
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {(
                          [
                            { id: 'gmail', label: 'Gmail OAuth' },
                            { id: 'smtp', label: 'Server SMTP' },
                            { id: 'mailto', label: 'Mail App' },
                            { id: 'eml', label: 'Download .eml' },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setImmediateEmailMode(opt.id)}
                            className={`min-h-[44px] sm:min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12.5px] font-medium border transition-colors ${
                              immediateEmailMode === opt.id
                                ? 'bg-[var(--accent)] text-[var(--accent-contrast)] border-[var(--accent)]'
                                : 'bg-[var(--bg-surface)] text-[var(--ink-secondary)] border-[var(--border-subtle)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-hover)]'
                            }`}
                          >
                            {opt.id === 'mailto' && <ExternalLink className="w-3.5 h-3.5" />}
                            {opt.id === 'eml' && <Download className="w-3.5 h-3.5" />}
                            <span>{opt.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {immediateEmailMode === 'gmail' && !isGmailConnected && (
                      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                        <span className="hig-footnote">
                          Sign in to send directly from your Gmail account:
                        </span>
                        <GoogleSignInButton
                          onClick={() => void connectGmail()}
                          loading={isGmailSigningIn}
                        />
                        {gmailError && (
                          <p className="w-full text-[12px] text-[var(--status-danger-ink)]">{gmailError}</p>
                        )}
                      </div>
                    )}
                    {immediateEmailMode === 'gmail' && isGmailConnected && (
                      <p className="text-[12.5px] font-medium text-[var(--status-success-ink)]">
                        Connected as {gmailUser?.email}. Emails will be sent via Gmail after confirmation.
                      </p>
                    )}
                    {immediateEmailMode === 'smtp' && !integrationStatus?.smtpConfigured && (
                      <p className="text-[12.5px] text-[var(--status-warning-ink)]">
                        SMTP environment variables (SMTP_HOST/USER/PASS) are not configured on the server. Use Gmail OAuth or Mail App / .eml.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        {!confirmingSend && (() => {
          const hasReachableTarget =
            (needsEmail && validEmailTargets.length > 0) ||
            (needsSms && validSmsTargets.length > 0);
          return (
            <div className="px-4 sm:px-6 py-4 border-t border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--bg-surface-secondary)]">
              <div className="space-y-0.5">
                <span className="hig-footnote tabular-nums block">
                  {scheduleMode === 'now'
                    ? `Ready: ${validEmailTargets.length} Email target(s) · ${validSmsTargets.length} SMS target(s)`
                    : `Schedule target: ${validEmailTargets.length} Email · ${validSmsTargets.length} SMS`}
                </span>
                {effectiveRecipients.length > 0 && !hasReachableTarget && (
                  <span className="text-[12px] font-medium block" style={{ color: 'var(--status-danger-ink)' }}>
                    No valid {channelMode === 'Both' ? 'phone or email' : channelMode.toLowerCase()} on file for the selected recipient(s). Add contact details or switch channels.
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setComposerOpen(false)}
                  className="hig-btn-secondary"
                >
                  Cancel
                </button>
                {scheduleMode === 'later' ? (
                  <button
                    type="button"
                    disabled={!hasReachableTarget}
                    onClick={() => void handleScheduleMessages()}
                    className="hig-btn-primary"
                  >
                    <CalendarClock className="w-4 h-4" />
                    <span>Schedule Message(s)</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!hasReachableTarget}
                    onClick={handleOpenConfirmSend}
                    className="hig-btn-primary"
                  >
                    <Send className="w-4 h-4" />
                    <span>Review & Send</span>
                  </button>
                )}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
