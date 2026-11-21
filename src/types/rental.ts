export type UnitType =
  | 'Bedroom'
  | 'Room'
  | 'Room & Parlour'
  | 'Shop'
  | 'Kiosk'
  | 'Container Shop'
  | 'Other';
export type UnitOccupancyStatus = 'Occupied' | 'Vacant' | 'Under Maintenance';

export type AgreementStatus =
  | 'Draft'
  | 'Active'
  | 'Expired'
  | 'Renewed / Superseded'
  | 'Terminated'
  | 'Cancelled';

export type RentCycle = 'Yearly' | 'Bi-Annual' | 'Quarterly' | 'Monthly';

export type ObligationChargeType = 'Rent' | 'Security Levy' | 'Other Charge';
export type SettlementPosition = 'Unpaid' | 'Partially Paid' | 'Paid / Settled';
export type DueDatePosition = 'Upcoming' | 'Due' | 'Overdue' | 'Under Review';

export type PaymentMethod =
  | 'Bank Transfer'
  | 'POS'
  | 'Cash'
  | 'Cheque'
  | 'Prior Manager / Handover';
export type PaymentStatus = 'Confirmed' | 'Reversed';

export type ReceiptRequestStatus =
  | 'Created'
  | 'Notified'
  | 'Acknowledged'
  | 'Overdue'
  | 'Issued'
  | 'Correction Required'
  | 'Cancelled';

export type NotificationStatus =
  | 'Queued'
  | 'Sent'
  | 'Delivered'
  | 'Failed'
  | 'Retry Pending'
  | 'Exhausted / Action Required'
  | 'Cancelled';

export type NotificationChannel = 'SMS' | 'Email';

export type NotificationEventType =
  | 'Payment Recorded / Receipt Request'
  | 'Receipt Correction / Cancellation'
  | 'Receipt SLA Breach'
  | 'Pre-Due Reminder'
  | 'Due-Date Reminder'
  | 'Overdue Reminder'
  | 'Arrears Escalation'
  | 'Promise-to-Pay Due / Breached'
  | 'Receipt Issued Update'
  | 'Custom Direct Message'
  | 'Custom Scheduled Message';

export type EmailClientProvider = 'gmail' | 'smtp' | 'mailto' | 'ledger-only';
export type NotificationDeliveryProvider =
  | 'Gmail'
  | 'SMTP'
  | 'Mailto / EML'
  | 'BulkSMSLive'
  | 'SMS Gateway'
  | 'Ledger Only';

export type CommitmentStatus =
  | 'Open'
  | 'Partially Fulfilled'
  | 'Fulfilled'
  | 'Breached'
  | 'Cancelled';

export type BehaviourIndicator =
  | 'Current'
  | 'Occasional Late Payment'
  | 'Repeated Late Payment'
  | 'Persistent Arrears'
  | 'Chronic Delinquency'
  | 'Under Review';

export type AgeingBucket =
  | 'Not Yet Due'
  | '1–7 days'
  | '8–30 days'
  | '31–60 days'
  | '61–90 days'
  | '> 90 days';

export type StakeholderRole = 'Property Manager' | 'Receipt Issuer' | 'Lawyer' | 'Additional Contact';

export interface PropertyProfile {
  id: string;
  name: string;
  address: string;
  timezone: string;
  currencySymbol: string;
  managerName: string;
  managerEmail: string;
}

export interface Unit {
  id: string;
  code: string;
  name: string;
  type: UnitType;
  floorOrWing: string;
  occupancyStatus: UnitOccupancyStatus;
  notes?: string;
}

export interface Tenant {
  id: string;
  firstName: string;
  lastName: string;
  alias?: string;
  phone: string;
  email: string;
  archived: boolean;
  notificationsPaused: boolean;
  pauseReason?: string;
  behaviourOverride?: BehaviourIndicator;
  behaviourOverrideReason?: string;
  historicalLateCycles: number;
  createdAt: string;
  notes?: string;
}

export interface Agreement {
  id: string;
  tenantId: string;
  unitId: string;
  status: AgreementStatus;
  rentCycle: RentCycle;
  agreedRent: number;
  securityLevy: number;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  dueDate: string;   // YYYY-MM-DD
  supersededById?: string;
  previousAgreementId?: string;
  exceptionNote?: string;
  createdAt: string;
}

export interface RentalObligation {
  id: string;
  agreementId: string;
  tenantId: string;
  unitId: string;
  chargeType: ObligationChargeType;
  categoryId?: string;
  categoryLabel?: string; // e.g., "Waste Levy", "Service Charge", "Generator Levy"
  commissionEligible?: boolean;
  rentalPeriodLabel: string; // e.g., "2026/2027 Annual Rent"
  originalAmount: number;
  dueDate: string; // YYYY-MM-DD
  underReview: boolean;
  reviewReason?: string;
  settledAt?: string;
  settledLateDays?: number;
  createdAt: string;
}

export interface PaymentAllocation {
  obligationId: string;
  amount: number;
}

export interface Payment {
  id: string;
  systemRef: string;
  tenantId: string;
  agreementId: string;
  unitId: string;
  amount: number;
  dateReceived: string; // YYYY-MM-DD
  timeReceived?: string; // HH:mm or HH:mm:ss (bank statement timestamp)
  dateRecorded: string; // ISO timestamp
  method: PaymentMethod;
  bankReference: string;
  status: PaymentStatus;
  allocations: PaymentAllocation[];
  unappliedAmount: number;
  rentYearCovered?: string; // e.g., "2025", "2026", "2027", "2025/2026"
  notes: string;
  recordedBy: string;
  duplicateFlag?: boolean;
  reversalReason?: string;
  reversedAt?: string;
  adjustedFromPaymentId?: string;
  lastEditedAt?: string;
}

export interface ReceiptRequest {
  id: string;
  paymentId: string;
  paymentRef: string;
  tenantId: string;
  unitId: string;
  amount: number;
  datePaid: string;
  rentalPeriodCovered: string;
  securityLevyIncluded: number;
  remainingBalanceAtPayment: number;
  issuerContactId: string;
  status: ReceiptRequestStatus;
  createdAt: string; // ISO timestamp
  slaDeadlineAt: string; // ISO timestamp
  acknowledgedAt?: string;
  acknowledgedNote?: string;
  officialReceiptNumber?: string;
  issuedDate?: string;
  evidenceNote?: string;
  cancellationReason?: string;
}

export interface NotificationRecord {
  id: string;
  eventId: string;
  eventType: NotificationEventType;
  relatedRecordId: string;
  tenantId?: string;
  recipientName: string;
  recipientRole: StakeholderRole | 'Tenant' | 'Custom';
  recipientContact: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  subject?: string;
  messageBody: string;
  scheduledAt: string;
  attemptedAt?: string;
  retryCount: number;
  failureReason?: string;
  isCustom?: boolean;
  deliveryProvider?: NotificationDeliveryProvider;
  externalMessageId?: string;
  smsUnits?: number;
  smsCostNaira?: number;
  createdBy?: string;
  overrideQuietHours?: boolean;
  cancelledAt?: string;
}

export type SmsTemplateCategory =
  | 'Rent Reminder'
  | 'Payment Receipt'
  | 'Maintenance Update'
  | 'General';

export interface SmsTemplate {
  id: string;
  name: string;
  category: SmsTemplateCategory;
  body: string;
  updatedAt: string;
}

export interface CommitmentInstalment {
  id: string;
  dueDate: string;
  amount: number;
}

export interface PaymentCommitment {
  id: string;
  tenantId: string;
  obligationIds: string[];
  promisedAmount: number;
  promisedDate: string; // YYYY-MM-DD
  extendedUntilDate?: string;
  instalments: CommitmentInstalment[];
  status: CommitmentStatus;
  dateRecorded: string;
  recordedBy: string;
  notes: string;
  cancellationReason?: string;
}

export interface CommissionRecord {
  id: string;
  paymentId: string;
  agreementId: string;
  tenantId: string;
  ratePercent: number;
  eligibleRentCollected: number;
  accruedAmount: number;
  createdAt: string;
  isReversalAdjustment?: boolean;
  note: string;
}

export interface CommissionPayout {
  id: string;
  lawyerContactId: string;
  amount: number;
  payoutDate: string;
  reference: string;
  notes: string;
  recordedBy: string;
  createdAt: string;
}

export type ActivityScopeCategory = 'Common Area' | 'Unit' | 'Other';

export interface PropertyExpense {
  id: string;
  date: string;
  amount: number;
  category: 'Repairs' | 'Security' | 'Utilities' | 'Cleaning' | 'Legal & Admin' | 'Other';
  customCategoryLabel?: string; // e.g., "Remembrance for Dad", "Community Donation"
  isNonPropertyOutgoing?: boolean; // true for owner/personal/donation disbursements from property purse
  scopeCategory?: ActivityScopeCategory;
  scopeLabel?: string; // e.g., "Compound Area / Exterior", "Soakaway & Drainage", "Shared Tenants' Toilet"
  unitId?: string;
  linkedMaintenanceId?: string;
  description: string;
  vendor: string;
  paymentMethod?: PaymentMethod;
  reference?: string;
  notes?: string;
  createdAt: string;
}

export interface MaintenanceRecord {
  id: string;
  unitId?: string; // undefined = compound/shared/custom scope
  scopeCategory?: ActivityScopeCategory;
  scopeLabel?: string; // e.g., "Soakaway & Drainage", "Shared Tenants' Toilet", or custom "Other" text
  issue: string;
  dateReported: string;
  status: 'Open' | 'In Progress' | 'Resolved';
  assignedTo: string;
  estimatedOrActualCost: number;
  resolutionDetails?: string;
  resolvedDate?: string;
  linkedExpenseId?: string;
}

export interface StakeholderContact {
  id: string;
  name: string;
  role: StakeholderRole;
  phone: string;
  email: string;
  isPrimaryReceiptIssuer?: boolean;
  isBackupEscalation?: boolean;
  smsEnabled: boolean;
  emailEnabled: boolean;
  receivesArrearsEscalations: boolean;
}

export interface PaymentCategoryDefinition {
  id: string;
  label: string;
  defaultAmount?: number;
  commissionEligible: boolean;
  createdAt: string;
}

export interface SystemSettings {
  defaultRentCycle: RentCycle;
  securityLevyAmount: number;
  lawyerCommissionRatePercent: number;
  gracePeriodDays: number;
  receiptSlaHours: number;
  defaultAllocationOrder: 'Oldest Overdue First' | 'Rent Before Levy' | 'Manual Only';
  repeatedLateThresholdCycles: number;
  persistentArrearsDays: number;
  chronicDelinquencyDays: number;
  globalNotificationsPaused: boolean;
  globalPauseReason?: string;
  quietHoursStart: string; // "20:00"
  quietHoursEnd: string;   // "07:00"
  sendTenantPaymentConfirmation: boolean;
  sendLawyerCommissionAlert: boolean;
  preDueOffsetsDays: number[]; // [90, 45, 20, 7, 3, 0]
  postDueOffsetsDays: number[]; // [1, 3, 7, 14, 30]
  post30DayCadenceDays: number; // e.g., 14
  preferredEmailProvider: EmailClientProvider;
  autoSendPaymentReceipts: boolean;
  autoSendScheduledReminders: boolean;
  autoSendCustomScheduled: boolean;
  autoSendArrearsEscalations: boolean;
  smsUnitCostNaira: number;
  customPaymentCategories?: PaymentCategoryDefinition[];
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  entityType:
    | 'Property'
    | 'Unit'
    | 'Tenant'
    | 'Agreement'
    | 'Obligation'
    | 'Payment'
    | 'Receipt'
    | 'Commitment'
    | 'Notification'
    | 'Commission'
    | 'Expense'
    | 'Maintenance'
    | 'Import'
    | 'Settings'
    | 'Template'
    | 'Contact';
  entityId: string;
  action: string;
  summary: string;
  previousValue?: string;
  newValue?: string;
  reason?: string;
}

export interface RentalAppState {
  referenceDate: string; // ISO date used as "today" (2026-11-18)
  property: PropertyProfile;
  units: Unit[];
  tenants: Tenant[];
  agreements: Agreement[];
  obligations: RentalObligation[];
  payments: Payment[];
  receiptRequests: ReceiptRequest[];
  notifications: NotificationRecord[];
  smsTemplates: SmsTemplate[];
  commitments: PaymentCommitment[];
  commissions: CommissionRecord[];
  commissionPayouts: CommissionPayout[];
  expenses: PropertyExpense[];
  maintenance: MaintenanceRecord[];
  contacts: StakeholderContact[];
  settings: SystemSettings;
  auditLogs: AuditLogEntry[];
}
