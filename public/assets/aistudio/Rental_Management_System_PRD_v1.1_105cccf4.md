# Rental Management System (Internal Tool)

| Document Field | Details |
|---|---|
| Document Version | 1.1 |
| Date | 18 November 2026 |
| Author | IA (Property Manager) |
| Status | Draft – For Review |
| Target Release | MVP (Phase 1) |
| Product Type | Internal property operations and rental management tool |
| Primary Operating Context | One residential/commercial property with multiple units and tenants |

---

# 1. Introduction

## 1.1 Overview

The Rental Management System is an internal tool for managing the rental and financial operations of one residential/commercial property. It provides a central record of units, tenants, tenancy agreements, rent obligations, payments, arrears, receipt issuance, lawyer commissions, expenses and maintenance activities.

The system is intended to replace the current manual Excel-and-phone-call process with a single, reliable operating record. It must make it easy for the Property Manager to know what is due, who has paid, who is owing, how long an amount has remained outstanding, which tenants repeatedly pay late, which payment commitments have been made, and whether receipts have been issued after payment.

The product has two connected core workflows:

1. **Rent collection and arrears management:** Track every rental obligation from the point it becomes due, make outstanding balances visible, remind tenants and relevant stakeholders, identify repeated late-payment patterns, and support structured follow-up.
2. **Payment administration and receipt issuance:** Record confirmed payments, allocate them to the correct obligations, update balances, notify the designated receipt issuer, and track each receipt request until the official receipt has been issued.

The system must not treat a notification as proof that an action has been completed. A rent reminder is not proof that rent has been paid; a payment notification is not proof that a receipt has been issued. Each business outcome must have its own status and history.

## 1.2 Problem Statement

The current property management process relies on spreadsheets, memory, phone calls and separate messages. This creates several operational problems:

- Payments are manually recorded in Excel and can be difficult to match to the correct tenant, unit and rental period.
- The Property Manager does not have a dependable, consolidated view of all rent obligations, partial payments, advance payments and outstanding balances.
- Some tenants delay payment, repeatedly miss due dates or accumulate arrears. These patterns are difficult to identify and consistently follow up when information is spread across spreadsheets and conversations.
- There is no reliable arrears ageing and escalation process showing how long each outstanding obligation has remained unpaid.
- Tenants may make verbal payment commitments, but those commitments and whether they are honoured are not consistently tracked.
- The person responsible for issuing an official receipt must be contacted separately after a payment is recorded. The receipt may then remain outstanding without a clear owner, deadline or escalation.
- Pre-due reminders, overdue reminders and stakeholder updates are manual and can be forgotten or sent inconsistently.
- Historical tenant, payment, expense and maintenance information is scattered across records.

The result is weak visibility over rent collection, delayed follow-up on debtors, avoidable administrative effort, delayed receipt issuance and incomplete operational records.

## 1.3 Product Users and Stakeholders

| User / Stakeholder | Role in the process | MVP access |
|---|---|---|
| Property Manager | Maintains property records, records payments, manages arrears, follows up tenants, records commitments and confirms receipt issuance | Single administrator login |
| Tenant | Owes rent and other agreed charges; receives reminders and payment-related communication | Notification recipient only; no login |
| Receipt Issuer | Issues the official receipt after a payment has been recorded | Notification recipient only; no login |
| Lawyer | Supports rent collection and matters referred for follow-up; may be entitled to commission | Notification recipient only; no login |
| Additional Property Contacts | Receive agreed property-level or tenant-related updates | Notification recipient only; no login |

The Property Manager is the only authenticated user in the MVP. Secondary stakeholders receive one-way SMS and/or email notifications according to their assigned role and notification preferences. They do not have access to the application or to other tenants' records in Phase 1.

## 1.4 Product Scope

### In Scope — MVP (Phase 1)

- One property with multiple residential and commercial unit types.
- Tenant, unit and tenancy agreement management.
- Creation and tracking of rental obligations by agreement and rental period.
- Manual recording of confirmed rent and other agreed payments.
- Allocation of a payment across one or more eligible obligations, including partial and advance payments.
- Outstanding balance and arrears calculations.
- Rent due-date monitoring, arrears ageing and configurable delinquency escalation.
- Historical tenant payment behaviour and configurable indicators for repeated late payment or chronic arrears.
- Recording and monitoring of tenant payment commitments (promise to pay).
- One-way SMS and email notifications to tenants and assigned stakeholders.
- Receipt request tracking from payment recording through official receipt issuance.
- Lawyer commission calculation and tracking.
- Expense and maintenance records.
- CSV/Excel import of existing tenants, units, agreements and historical payments.
- Single administrator login, activity history and audit trail.

### Out of Scope — MVP (Phase 1)

- Tenant login, tenant self-service portal or mobile application.
- Login or workflow access for receipt issuers, lawyers or additional contacts.
- Online rent payment, payment gateway integration or automatic bank statement reconciliation.
- Automatic confirmation of bank transfers through a bank API.
- Automated creation or issuance of official receipts by the system.
- Multi-property or multi-owner management.
- Full accounting, tax or general ledger functionality.
- Automated legal notices, eviction processes or legal case management.
- Automated determination of a tenant's intention to default.
- Integration with external property, accounting or legal platforms.

---

# 2. Goals

## 2.1 Product Goals

1. **Improve rent collection visibility:** Provide one reliable view of rent expected, rent collected, outstanding rent and arrears by tenant, unit and rental period.
2. **Improve follow-up on late and non-paying tenants:** Ensure the Property Manager and assigned stakeholders are aware of overdue obligations, the length of the delay, repeated late-payment patterns and broken payment commitments.
3. **Standardise rent reminders and escalation:** Replace memory-based follow-up with scheduled, configurable and auditable notifications.
4. **Improve payment record accuracy:** Ensure each confirmed payment is associated with the correct tenant, agreement, unit and rental obligation, with clear treatment of partial, advance, corrected and reversed payments.
5. **Reduce receipt issuance delays:** Ensure every recorded payment creates a trackable receipt request, not merely an untracked message to the receipt issuer.
6. **Establish clear accountability:** Make it possible to identify the person responsible for an action, the action's current status, when it was created and whether its deadline has been missed.
7. **Provide a single source of truth:** Consolidate tenant, agreement, payment, arrears, receipt, commission, expense and maintenance records.
8. **Reduce administrative effort:** Reduce time spent updating spreadsheets, calculating balances, identifying debtors and manually remembering follow-up dates.

## 2.2 Success Metrics

The following are proposed MVP measures. Baselines should be captured from the current operating process before launch. Targets that depend on business policy must be confirmed before implementation.

| Metric | Definition | Proposed MVP expectation |
|---|---|---|
| Rent obligation coverage | Active agreements with a valid rental obligation and due date | 100% of active agreements |
| Arrears visibility | Unpaid obligations correctly reflected in the arrears view | 100% in agreed acceptance scenarios |
| Payment record accuracy | Payment records correctly matched to tenant, agreement, unit and allocated obligation | 100% in agreed reconciliation and test scenarios |
| Payment notification initiation | Confirmed payment records that create a receipt notification event within five minutes | 100% of eligible payment records |
| Receipt issuance within SLA | Receipt requests closed as issued within the agreed receipt issuance SLA | Target to be agreed; proposed starting point is at least 95% |
| Reminder processing | Eligible scheduled reminders processed without being missed or duplicated | 100% of eligible reminder events |
| Promise-to-pay visibility | Open and breached commitments visible to the Property Manager | 100% of recorded commitments |
| Audit coverage | In-scope record changes and status changes captured in the activity/audit history | 100% of defined auditable actions |
| Rent collection rate | Rent collected divided by rent due for the selected period | Baseline first; improvement target to be agreed |
| Repeat delinquency rate | Tenants meeting the approved repeated-late-payment criteria divided by active tenants | Baseline first; reduction target to be agreed |
| Administrative time | Time spent on rent tracking, debtor follow-up and receipt coordination | Measure baseline; target at least 70% reduction, subject to validation |

**Measurement rules:**

- Payment notification initiation measures creation and dispatch to the messaging provider; it does not guarantee that a recipient has read the message.
- Provider delivery status must be reported separately where the SMS or email provider supplies delivery information.
- Receipt issuance time is measured from the time a confirmed payment is recorded to the time the official receipt is confirmed as issued.
- Rent collection and delinquency metrics must be calculated from rental obligations and payment allocations, not from manually maintained summary figures.

---

# 3. Confirmed Architectural Decisions

The following decisions are carried forward from the original Rental Management System PRD and the requirements agreed during product review.

| SN | Decision | Position for MVP |
|---|---|---|
| 1 | Property coverage | The MVP supports one property with multiple units. |
| 2 | Primary user | One Property Manager uses the application through a single administrator login. |
| 3 | Secondary stakeholders | Tenants, receipt issuers, the lawyer and additional contacts are notification-only recipients; they do not log in during the MVP. |
| 4 | Payment capture | Payments are recorded manually by the Property Manager after the funds have been confirmed as received. |
| 5 | Bank integration | Payment gateway integration and automatic bank reconciliation are out of scope for the MVP. |
| 6 | Official receipt | The official receipt remains a human-issued document. The system creates and tracks the request but does not generate or issue the official receipt in Phase 1. |
| 7 | Notification channels | One-way SMS and email are in scope. Tenant or stakeholder replies are not processed by the application. |
| 8 | Rent cycle | Yearly rent is the default cycle. The agreement must retain the actual agreed dates and amounts. |
| 9 | Unit types | Bedroom, Room, Room & Parlour, Shop, Kiosk and Other are supported. |
| 10 | Security levy | The current property levy is ₦4,000 as stated in the original PRD. Its charging frequency and treatment must be confirmed before the related calculations are finalised. |
| 11 | Historical records | Existing tenant, unit, agreement and payment information will be onboarded through a validated CSV/Excel import process. |
| 12 | Receipt notification | Saving a confirmed payment triggers a receipt request notification to the assigned receipt issuer. The request remains open until issuance is recorded. |

The following product rules are required for the proposed MVP but remain subject to business confirmation. They must not be treated as confirmed policy until the open decisions in Section 6 are resolved:

- The grace period, if any, before an obligation is considered overdue.
- The exact schedule and frequency of post-due reminders and stakeholder escalations.
- The criteria used to identify repeated late payment and chronic delinquency.
- The receipt issuance service-level agreement (SLA) and escalation recipient.
- The default allocation order when a tenant makes a payment without specifying which obligation it covers.
- The treatment of security levy and other non-rent charges for commission and reporting.

---

# 4. Feature / Module Specifications

## 4.1 Property, Unit and Tenant Management

| SN | Item | Description |
|---:|---|---|
| 1 | User Story | As the Property Manager, I want to maintain accurate property, unit and tenant records so that every agreement, payment and outstanding obligation can be linked to the correct tenant and unit. |
| 2 | Flow | The Property Manager creates or updates the property and its units, records tenant details, and links a tenant to a unit through a tenancy agreement. A tenant record must remain available after the tenant moves out so that historical agreements and payment behaviour can still be reviewed. |
| 3 | Acceptance Criteria | The system supports the unit types Bedroom, Room, Room & Parlour, Shop, Kiosk and Other. Each unit has a unique identifier within the property and a clear occupancy status. Tenant records support full name, phone number and email address where available. The system supports a tenant having more than one agreement over time. A tenant must not be permanently embedded in a unit record. A unit cannot have overlapping active agreements unless an approved exception is recorded. Historical tenant and unit records must not be silently deleted when a tenancy ends. All tenant, unit and property create/update/archive actions are written to the activity log and audit log: record ID, changed fields, previous value, new value, action performed by and timestamp. |
| 4 | Notifications / Emails | No external notification is required for ordinary tenant or unit record creation or editing in the MVP. The Property Manager sees the updated record in the application. Any future tenant-facing agreement notification must be separately approved. |

## 4.2 Tenancy Agreements and Rental Obligations

| SN | Item | Description |
|---:|---|---|
| 1 | User Story | As the Property Manager, I want each tenancy agreement to define the rent and other agreed charges for a specific period so that the system can determine what each tenant owes and when payment is due. |
| 2 | Flow | The Property Manager creates an agreement for a tenant and unit, records the agreement start and end dates, rent amount, rent cycle and applicable charges, and confirms the due date rules. The system uses the agreement to establish the rental obligations for each applicable period. Renewals and rent changes must preserve the previous agreement terms and history. |
| 3 | Acceptance Criteria | Each agreement is linked to one tenant and one unit. The agreement stores its start date, end date where applicable, rent cycle, agreed rent amount, due date and agreed additional charges. Yearly rent is the default cycle, but the system must retain the actual dates and amounts agreed for the tenancy. One active agreement per unit is allowed at a time unless an approved exception is recorded. A renewal or rent increase must preserve the previous terms and create a traceable new agreement or agreement version; historical rent values must not be overwritten. The system distinguishes rent obligations from other charges, including security levy. Each obligation has an amount, due date, rental period and outstanding balance. The system must not infer that a new rent amount applies to an earlier period. Agreement status changes and obligation creation are written to the activity log and audit log: agreement ID, tenant, unit, previous and new terms, effective dates, action performed by and timestamp. |
| 4 | Notifications / Emails | The system schedules configured pre-due, due-date and post-due notifications for each active obligation. Notifications are sent only to recipients assigned to the relevant tenant/agreement or property. Creating or editing an agreement does not automatically send a tenant message unless that notification is explicitly enabled in the approved notification configuration. Agreement expiry, renewal, termination and cancellation are reflected in the Property Manager's application view; no external message is sent by default unless configured. |

## 4.3 Payment Recording, Allocation and Adjustment

| SN | Item | Description |
|---:|---|---|
| 1 | User Story | As the Property Manager, I want to record a confirmed payment and allocate it to the correct rental obligation or obligations so that tenant balances and rent collection records remain accurate. |
| 2 | Flow | The Property Manager selects the tenant and agreement, records the amount, date received, payment method and available bank/payment reference, and identifies the obligation or obligations being settled. The system updates the allocated and outstanding amounts. A payment may settle an obligation fully, settle it partially, cover more than one obligation or create an unapplied credit where the allocation is not yet determined. |
| 3 | Acceptance Criteria | A payment is recorded as confirmed only after the Property Manager has verified that the funds were received. Each payment has a unique system reference and records the tenant, agreement, unit, amount, date received, date recorded, payment method, bank/payment reference where available, notes and recording user. The system supports full, partial and advance payments. One payment may be allocated across multiple obligations, and one obligation may be settled by multiple payments. The system shows total amount received, allocated amount, unapplied amount and remaining balance separately. Rent, security levy and other agreed charges must remain distinguishable. The system must not allocate an excess amount to a future rental period unless the allocation is explicitly selected or follows an approved allocation rule. Incorrect records must be corrected through an auditable adjustment or reversal; the original payment record must remain traceable and must not be silently overwritten or deleted. A reversed payment must restore the affected obligation balance and trigger recalculation of arrears and commission. Duplicate payment references or suspicious duplicate entries must be flagged for review. All payment creation, allocation, adjustment and reversal actions are written to the activity log and audit log: payment ID, tenant, agreement, unit, amount, payment date, allocation by obligation, reference, previous and new values, reason, action performed by and timestamp. |
| 4 | Notifications / Emails | On confirmation of a payment, the system creates a receipt request and notifies the assigned receipt issuer by the configured channel(s). The Property Manager receives an in-application confirmation. The relevant rent and arrears views are updated. A tenant payment confirmation may be enabled as a separate notification, but it is not assumed as a mandatory MVP notification until approved. If a payment is adjusted or reversed after a receipt request has been sent, the receipt issuer must receive a correction/cancellation notice and the Property Manager must be alerted. |

## 4.4 Rent Arrears and Delinquency Management

| SN | Item | Description |
|---:|---|---|
| 1 | User Story | As the Property Manager, I want to see every unpaid rental obligation, how long it has been outstanding and the tenant's payment history so that late-paying and chronically delinquent tenants can be identified and followed up consistently. |
| 2 | Flow | The system monitors each rental obligation against its due date and configured grace period. When an amount remains unpaid, it appears in the arrears view with the amount outstanding and days past due. As arrears continue, the system applies the configured reminder and escalation schedule. The tenant's historical payment behaviour is updated from verified payment and obligation records. |
| 3 | Acceptance Criteria | The system calculates outstanding rent by tenant, agreement, unit and rental period using the payment allocation records. It displays the original obligation amount, amount paid, amount outstanding, due date and days past due. Arrears ageing is grouped into configurable buckets; proposed starting buckets are Not Yet Due, 1–7 days, 8–30 days, 31–60 days, 61–90 days and more than 90 days. The Property Manager can identify all overdue tenants and sort/filter by amount outstanding, days overdue, unit, rental period and payment behaviour. The system retains historical late-payment and default records after an obligation is settled. It identifies repeated late-payment patterns using approved configurable criteria, such as the number of late rental cycles within a selected lookback period, total arrears and longest period overdue. The system may classify behaviour as Current, Occasional Late Payment, Repeated Late Payment, Persistent Arrears or Chronic Delinquency once the criteria are approved. These labels describe recorded payment behaviour only; the system must not infer or state that a tenant intentionally defaulted. A newly reached Repeated Late Payment or Chronic Delinquency threshold must be surfaced to the Property Manager. Partial payments reduce the outstanding balance but do not mark an obligation as settled until the full amount due is allocated. A payment correction or reversal recalculates arrears and may reinstate an overdue status. A disputed obligation or approved notification pause must remain visible and must not be silently removed from arrears totals. All arrears status changes, classification changes, overrides and notification holds are written to the activity log and audit log: obligation ID, tenant, unit, amount outstanding, due date, days overdue, previous and new status/classification, reason, action performed by and timestamp. |
| 4 | Notifications / Emails | The tenant receives configured pre-due, due-date and overdue reminders. The Property Manager receives alerts when an obligation becomes overdue, when configured escalation thresholds are reached and when a tenant newly meets an approved repeated-late-payment or chronic-delinquency threshold. The lawyer and additional contacts receive alerts only where assigned and permitted by the notification configuration. A notification must show the amount outstanding and the relevant due date; where a partial payment has been recorded, it must show the remaining balance rather than implying that no payment has been made. Behavioural classifications are internal indicators and must not be presented to the tenant as an accusation or statement of intent. When an obligation is fully settled, further reminders for that obligation are suppressed. When an obligation is partially settled, reminders continue only for the remaining balance according to the configured policy. |

## 4.5 Tenant Payment Commitments (Promise to Pay)

| SN | Item | Description |
|---:|---|---|
| 1 | User Story | As the Property Manager, I want to record the amount and date a tenant promises to pay so that verbal commitments can be monitored and missed commitments can be followed up. |
| 2 | Flow | During a follow-up, the Property Manager records the tenant's promised amount, promised payment date and any agreed instalment schedule. The system displays the commitment alongside the tenant's arrears. When the promised date passes, the system checks whether the required payment has been recorded and allocated. The commitment is updated as fulfilled, partially fulfilled or breached. |
| 3 | Acceptance Criteria | A commitment is linked to a tenant and one or more outstanding obligations. It records the promised amount, promised date, any instalment dates and amounts, date recorded, notes and the person who recorded it. The system supports more than one commitment against an outstanding balance where the Property Manager records an agreed instalment plan. A commitment is fulfilled only when the corresponding payment has been recorded and allocated. A commitment is partially fulfilled where some, but not all, of the promised amount has been paid by the relevant date. A commitment is breached when the promised date passes and the expected payment has not been recorded, subject to any approved extension recorded by the Property Manager. The system must not treat a promise as payment or reduce arrears before funds are confirmed. The Property Manager can view open, due, fulfilled and breached commitments. A commitment can be amended or cancelled only with a recorded reason and audit history. All commitment creation, amendment, extension, fulfilment, breach and cancellation actions are written to the activity log and audit log: commitment ID, tenant, linked obligation, promised amount, promised date, actual amount paid, previous and new status, reason, action performed by and timestamp. |
| 4 | Notifications / Emails | The Property Manager is alerted when a commitment becomes due and when it is breached. A tenant reminder may be sent before a promised date if enabled in the notification configuration. A breached commitment may trigger the next configured arrears escalation. A fulfilled commitment updates the tenant's arrears and commitment views; no separate stakeholder notification is required unless configured. |

## 4.6 Receipt Issuance Management

| SN | Item | Description |
|---:|---|---|
| 1 | User Story | As the Property Manager, I want every confirmed payment to create a receipt request with an assigned issuer and a trackable status so that no payment is left without a clear receipt follow-up. |
| 2 | Flow | When a payment is confirmed, the system creates a receipt request linked to that payment and assigns the configured receipt issuer. The issuer receives an SMS and/or email with the payment details and a request to issue the official receipt. The receipt request remains open until the Property Manager records that the receipt has been issued. Because the receipt issuer has no application login in the MVP, acknowledgement and issuance confirmation are recorded by the Property Manager after confirmation through the existing communication process. |
| 3 | Acceptance Criteria | Each confirmed payment creates one receipt request unless the payment is reversed or an authorised exception applies. The request includes the payment reference, tenant name, unit number and type, amount paid, date paid, rental period covered, security levy treatment and remaining balance where relevant. The request has an assigned receipt issuer, creation timestamp, current status and target issuance deadline where an SLA has been configured. Notification status and receipt request status must be tracked separately. The system distinguishes notification queued, sent, delivered where supported, and failed from receipt request statuses. The Property Manager can record acknowledgement, official receipt number/reference, issue date, notes and supporting receipt evidence where available. A request is not marked as issued merely because an SMS or email was sent or delivered. Requests that exceed the configured issuance SLA are flagged as overdue and remain visible until resolved. If the payment is corrected or reversed, the related receipt request must be marked for correction or cancellation and the issuer notified. The system must prevent duplicate open receipt requests for the same confirmed payment unless the previous request was cancelled with a reason. All receipt request creation, assignment, acknowledgement, overdue escalation, issue confirmation, correction and cancellation actions are written to the activity log and audit log: receipt request ID, payment ID, issuer, recipient, notification reference, status changes, receipt number, issue date, reason, action performed by and timestamp. |
| 4 | Notifications / Emails | **Payment recorded:** notify the assigned receipt issuer immediately by the configured SMS and/or email channel. **Acknowledgement recorded:** update the Property Manager's receipt queue; no external message is required by default. **SLA breached:** alert the Property Manager and configured escalation contact. **Receipt issued:** update the dashboard and close the request; tenant or other stakeholders are notified only if receipt delivery/notification is enabled. **Payment corrected or reversed:** send a correction/cancellation notification to the issuer where a prior request was sent. |

## 4.7 Notifications, Recipient Routing and Escalation

| SN | Item | Description |
|---:|---|---|
| 1 | User Story | As the Property Manager, I want notifications to be sent to the correct people at the correct time so that tenants are reminded of their obligations and stakeholders are informed of the actions they are responsible for. |
| 2 | Flow | The system creates notification events from payment, rental obligation, arrears, payment commitment and receipt request status changes. It selects recipients based on their assigned role and the property/tenant configuration, then sends the message through the configured SMS and/or email channel. The Property Manager can review the notification history and pause notifications globally or for a specific tenant where required. |
| 3 | Acceptance Criteria | Notification types include payment recorded/receipt request, pre-due reminder, due-date reminder, overdue reminder, arrears escalation, payment commitment due/breached, receipt SLA breach and configured receipt-issued/correction updates. Recipients are role-based: tenants receive only their own obligation and payment messages; receipt issuers receive assigned receipt requests; the lawyer receives only the agreed rent or arrears events; the Property Manager receives operational alerts; additional contacts receive only the events and level of detail assigned to them. The system must not send one tenant's financial details to another tenant or to a contact who is not authorised for that record. SMS and email delivery outcomes are tracked independently. A failure on one channel must not suppress a successful message on the other channel. Failed messages are retried according to a configurable policy and remain visible for manual review if retries are exhausted. The same event/recipient/channel combination must not be sent more than once because of a retry or repeated scheduled processing. Every status transition defined in this PRD must either trigger its specified notification or explicitly remain an in-application/audit-only update; no status transition may be left without a defined notification decision. Notifications must stop or be recalculated when an obligation is settled, reversed or placed under an authorised notification hold. A paused notification must not erase or change the underlying rent obligation or arrears position. The Property Manager can configure recipients, channel preferences, reminder offsets, escalation thresholds and notification pauses. All configuration changes, notification attempts, retries, failures, pauses and recipient changes are written to the activity log and audit log: event ID, type, related record, recipient, channel, scheduled time, attempt time, result, failure reason, configuration change, action performed by and timestamp. |
| 4 | Notifications / Emails | This module generates the notifications defined in the relevant feature tables. Every status transition that requires an external notification must have a configured message and recipient. Where no external notification is required, the relevant feature table states that the change is reflected in the application only. The system must not interpret provider acceptance as proof that a recipient read or acknowledged a message. Message content must be appropriate to the recipient's role and must include the tenant name, unit, relevant rental period, amount due or paid, due/payment date and next action where applicable. Overdue messages must state the outstanding balance and must not disclose internal delinquency labels. Payment-recorded messages to receipt issuers must include tenant name, unit number and type, amount paid, date paid, rental period covered, security levy treatment, remaining balance where applicable and a clear instruction to issue the official receipt. Email templates use a subject line, `Dear [First Name]`, a concise body with key amounts and dates clearly emphasised, and a property-management sign-off. SMS content must remain concise while retaining the essential amount, date and action. |

### 4.7.1 Proposed Reminder and Escalation Schedule

The following schedule is a proposed starting point for business approval. The final schedule must be configurable and must respect the agreement's due date, any approved grace period and the notification suppression rules.

| Event | Proposed timing | Default recipient(s) | Purpose |
|---|---|---|---|
| Pre-due reminder 1 | 3 months before due date | Tenant | Early notice of upcoming rent |
| Pre-due reminder 2 | 45 days before due date | Tenant | Advance reminder |
| Pre-due reminder 3 | 20 days before due date | Tenant | Payment preparation |
| Pre-due reminder 4 | 7 days before due date | Tenant | Upcoming payment reminder |
| Pre-due reminder 5 | 3 days before due date | Tenant | Final pre-due reminder |
| Due date | On due date | Tenant | Rent is due |
| Early arrears | 1 and 3 days after the overdue date | Tenant; Property Manager on first overdue event | Prompt early follow-up |
| Continued arrears | 7 and 14 days after the overdue date | Tenant; Property Manager; lawyer only if configured | Escalated follow-up |
| Serious arrears | 30 days after the overdue date | Tenant; Property Manager; assigned escalation contacts | Management attention |
| Long-standing arrears | After 30 days, at a reduced configurable frequency | Tenant and assigned stakeholders | Continued visibility without unnecessary daily messaging |
| Receipt request | Immediately after confirmed payment | Assigned receipt issuer | Request official receipt |
| Receipt SLA breach | When configured SLA is exceeded | Property Manager and assigned escalation contact | Follow up on outstanding receipt |
| Promise-to-pay due/breach | On promised date / after missed commitment | Property Manager; tenant if configured | Track and follow up on commitment |

**Notification suppression and exception rules:**

- Do not send an overdue reminder for an obligation that is fully settled.
- For a partially settled obligation, communicate the remaining balance and do not imply that no payment has been made.
- If a payment is recorded but not yet allocated, the Property Manager must be able to review it; the system must not suppress a specific obligation reminder unless the applicable balance has been reduced by an allocation or an authorised hold has been recorded.
- Do not send duplicate reminders for the same configured event, recipient and rental period.
- A global or tenant-specific pause must be auditable and must not change the amount owed or the tenant's payment history.
- Notification frequency must be controlled to avoid daily messages continuing indefinitely. Any post-30-day cadence must be explicitly configured.
- Quiet hours and any legally required restrictions on communication timing must be confirmed before launch.

## 4.8 Lawyer Commission Tracking

| SN | Item | Description |
|---:|---|---|
| 1 | User Story | As the Property Manager, I want the lawyer's commission to be calculated from eligible rent actually collected and tracked as accrued or paid so that commission obligations are transparent and can be reconciled. |
| 2 | Flow | The Property Manager configures the applicable commission rate. When a payment is allocated to eligible rent, the system calculates the commission attributable to that collected rent. The commission record remains outstanding until a commission payment is recorded. Adjustments or reversals to the underlying rent payment update the commission position. |
| 3 | Acceptance Criteria | The commission rate is configurable. The system calculates commission against eligible rent actually collected, not the full contractual rent merely because an agreement exists. Partial rent payments generate proportionate commission where this matches the approved commission arrangement. Security levy and other non-rent charges are excluded unless the business explicitly confirms otherwise. The system maintains commission accrued, commission paid and commission outstanding. Each commission entry is traceable to the payment and rent allocation that created it. The Property Manager can record a commission payment, payment date, amount, reference and notes. Reversed or corrected rent payments result in a corresponding commission adjustment. Historical commission rates must be preserved for the relevant agreement or payment period. All commission rate changes, accruals, adjustments and payments are written to the activity log and audit log: commission entry ID, payment ID, agreement, rate, eligible amount, accrued amount, amount paid, previous and new values, reason, action performed by and timestamp. |
| 4 | Notifications / Emails | Commission accrual and payment updates appear in the Property Manager's application view. No external commission notification is required by default. An email or SMS to the lawyer is sent only if explicitly enabled in the approved notification configuration. |

## 4.9 Expenses and Maintenance

| SN | Item | Description |
|---:|---|---|
| 1 | User Story | As the Property Manager, I want to record property expenses and maintenance activities so that property-related outgoings and work history are available alongside rent collection records. |
| 2 | Flow | The Property Manager records an expense or maintenance activity with its date, amount where applicable, description, recipient/vendor and supporting details. The system retains the record and makes it available for filtering and financial summaries. |
| 3 | Acceptance Criteria | Expense records support date, amount, description, paid-to/vendor, payment method or bank details where needed, category, notes and attachment where available. The system must not require a bank account number when it is not needed to identify or reconcile the expense; the business must confirm which payment details are genuinely required. Maintenance records must capture the issue/activity, date reported, status, person/vendor responsible, cost where known and resolution details. The Property Manager can filter records by date, category, amount and vendor and view total expenses for a selected period. Expenses must remain separate from tenant rent payments and must not reduce a tenant's rent obligation. All expense and maintenance creation, amendment, status changes and archival actions are written to the activity log and audit log: record ID, date, amount, description, vendor, changed fields, reason, action performed by and timestamp. |
| 4 | Notifications / Emails | No external notification is required for ordinary expense entry in the MVP. If a maintenance activity is assigned to an additional contact or vendor for follow-up, any notification must be explicitly enabled and must not expose unrelated tenant or financial information. |

## 4.10 Historical Data Import

| SN | Item | Description |
|---:|---|---|
| 1 | User Story | As the Property Manager, I want to import the existing Excel records so that the system can be used without manually recreating every current tenant, agreement and historical payment. |
| 2 | Flow | The Property Manager downloads the approved import templates, prepares the source data, uploads one or more files and reviews validation results. The system shows valid records, errors, warnings and potential duplicates before the Property Manager confirms the import. After import, the Property Manager reviews record counts and financial totals against the source files. |
| 3 | Acceptance Criteria | The system provides templates for tenants, units, agreements, rental obligations where required, historical payments and expenses where included in the approved import scope. Import can be performed in one file or separate files where supported by the approved templates. The system validates mandatory fields, date formats, numeric amounts, tenant/unit/agreement references and required relationships before committing records. Potential duplicate tenants, units, agreements and payments are flagged for review. The Property Manager can preview the records that will be created or rejected. The system must not silently discard invalid rows. An import summary shows accepted, rejected, skipped and duplicate records with reasons. Imported payments must be linked to the correct tenant, agreement, unit and rental period where the source information supports that relationship. The system recalculates balances and arrears from imported agreements and payments and provides a reconciliation summary against the source records. A failed or cancelled import must not leave a partially committed set of records without a clear result. All import attempts and confirmations are written to the activity log and audit log: import ID, source filename, record counts, accepted/rejected counts, validation results, reconciliation totals, action performed by and timestamp. |
| 4 | Notifications / Emails | No tenant, lawyer or receipt issuer notification is sent solely because historical data is imported. The Property Manager receives an import result and reconciliation summary. Historical payment imports must not create new receipt requests or send payment-recorded notifications unless the Property Manager explicitly selects an approved backfill action. |

## 4.11 Dashboard and Operational Reporting

| SN | Item | Description |
|---:|---|---|
| 1 | User Story | As the Property Manager, I want a current operational view of rent collection, arrears, tenant payment behaviour, payment commitments and receipt issuance so that I can identify what requires attention without manually reviewing multiple spreadsheets. |
| 2 | Flow | The dashboard consolidates information from active agreements, rental obligations, payment allocations, arrears records, commitments, receipt requests, commissions and expenses. The Property Manager can filter the information by tenant, unit, status and period and open the relevant record to take action. |
| 3 | Acceptance Criteria | The dashboard shows expected rent, rent collected, outstanding rent, overdue tenant count, arrears by ageing bucket, upcoming obligations, repeated-late-payment/chronic-arrears indicators, open and breached payment commitments, pending and overdue receipt requests, commission outstanding and expenses for the selected period. It provides filters for All, Upcoming, Due, Partially Paid, Overdue, Paid/Settled, Repeated Late Payment, Persistent Arrears, Chronic Delinquency, Promise-to-Pay Pending/Breached and Receipt Pending/Overdue. Figures must reconcile to the underlying rental obligations and payment allocations. The dashboard distinguishes current arrears from historical late-payment behaviour. A tenant who previously paid late but has fully settled must not be shown as currently owing solely because of historical delinquency. The Property Manager can navigate from a summary figure to the underlying tenant, agreement, payment or receipt request. The dashboard must not show a tenant as paid where only part of the obligation has been allocated. Dashboard access and any export of tenant/payment information are recorded in the activity/audit history where supported. All manual overrides to dashboard classifications or reported data are written to the activity log and audit log: affected record, previous and new value, reason, action performed by and timestamp. |
| 4 | Notifications / Emails | The dashboard itself does not send external notifications. Alerts are generated by the relevant obligation, arrears, commitment and receipt workflows. The dashboard displays notification and action statuses so the Property Manager can see which events were processed and which require intervention. |

## 4.12 Administration, Settings and Audit History

| SN | Item | Description |
|---:|---|---|
| 1 | User Story | As the Property Manager, I want to manage property contacts, notification rules and system settings, and review changes to important records so that the application reflects the property's operating rules and remains accountable. |
| 2 | Flow | The Property Manager configures the property details, contact list, notification preferences, reminder offsets, grace period, escalation thresholds, receipt issuance SLA and commission rate. The Property Manager can review the activity/audit history and pause notifications globally or for an individual tenant where an approved exception applies. |
| 3 | Acceptance Criteria | The MVP supports one administrator account. The system supports contact records with name, phone, email and role, including Receipt Issuer, Lawyer and Additional Contact. Contacts can be assigned at property level and, where required, to a specific tenant or agreement. The system supports a primary receipt issuer and a backup/escalation contact where configured. Settings include property details, default rent cycle, security levy amount, commission rate, grace period, reminder offsets, overdue escalation schedule, receipt issuance SLA, channel preferences and notification pause controls. The system clearly identifies which values are defaults and which are specific to an agreement or tenant. Changes to settings apply prospectively unless the Property Manager explicitly selects an authorised retrospective recalculation. Critical financial records must not be silently deleted. The system provides an activity/audit history showing who performed an action, what changed and when. The application uses secure authentication, protects contact and financial information, and supports appropriate data backup and recovery. Provider credentials must be protected and must not be exposed in ordinary user views. All settings changes, contact changes, login/security events and audit-history access are recorded: account or setting ID, changed fields, previous and new values, action performed by, outcome, reason where applicable and timestamp. |
| 4 | Notifications / Emails | A change to notification settings does not itself generate a tenant notification unless the change affects an active notification or the Property Manager explicitly requests one. Failed critical notification processing is surfaced to the Property Manager. Changes to recipient routing must be reflected in future notifications; previously sent notifications remain in the history. |

---

# 5. Status Reference

Statuses must be used consistently across the dashboard, tenant records, arrears views, payment history and notification history. Payment settlement status must be kept separate from whether the due date has passed.

## 5.1 Agreement Statuses

| Status | Definition |
|---|---|
| Draft | Agreement is being prepared and is not yet active. |
| Active | Agreement is currently in effect and can create rental obligations. |
| Expired | Agreement has reached its end date and has not been renewed. |
| Renewed / Superseded | Agreement has been replaced by a new agreement or version, with the previous terms retained. |
| Terminated | Agreement ended before its planned end date. |
| Cancelled | Agreement was created but invalidated before taking effect. |

## 5.2 Rental Obligation Statuses

The system must maintain both a **settlement position** and a **due-date position** so that a partially paid obligation can also be overdue without losing either fact.

### Settlement Position

| Status | Definition |
|---|---|
| Unpaid | No payment has been allocated to the obligation. |
| Partially Paid | Some amount has been allocated, but a balance remains. |
| Paid / Settled | The full obligation amount has been allocated and no balance remains. |

### Due-Date Position

| Status | Definition |
|---|---|
| Upcoming | The due date is in the future and outside any configured due-date window. |
| Due | The due date has arrived and the obligation is not fully settled. |
| Overdue | The due date and any configured grace period have passed and a balance remains. |
| Under Review | The obligation is disputed or subject to an authorised review. The balance remains visible unless an authorised adjustment changes it. |

## 5.3 Payment Statuses

| Status | Definition |
|---|---|
| Confirmed | The Property Manager has recorded the payment after confirming that funds were received. |
| Reversed | The payment has been reversed and its previous allocations have been removed or adjusted through an auditable event. |

A correction must retain the original payment and create a traceable adjustment or reversal event. A payment must not be deleted or silently overwritten.

## 5.4 Receipt Request Statuses

| Status | Definition |
|---|---|
| Created | A receipt request has been created from a confirmed payment. |
| Notified | The system has dispatched the request to the configured notification provider. |
| Acknowledged | The Property Manager has recorded that the issuer acknowledged the request through the existing communication process. |
| Overdue | The configured receipt issuance SLA has been exceeded and the receipt is still not recorded as issued. |
| Issued | The Property Manager has recorded the official receipt number/reference and issue date, with supporting evidence where available. |
| Correction Required | The related payment has been corrected or reversed and the receipt request requires issuer action. |
| Cancelled | The request has been invalidated with a recorded reason. |

`Delivered` is a notification-provider delivery outcome, not a receipt request status. A delivered message does not mean the issuer has acknowledged the request or issued the receipt.

## 5.5 Notification Statuses

| Status | Definition |
|---|---|
| Queued | Notification event has been created and is waiting to be dispatched. |
| Sent | The messaging provider accepted the send request. |
| Delivered | The provider confirms delivery, where that information is supported. |
| Failed | The provider rejected the request or delivery failed. |
| Retry Pending | A failed attempt is scheduled for another attempt under the retry policy. |
| Exhausted / Action Required | The retry policy has been exhausted and the Property Manager must review the failure. |

SMS and email outcomes must be tracked separately.

## 5.6 Payment Commitment Statuses

| Status | Definition |
|---|---|
| Open | Commitment has been recorded and its promised date has not yet passed. |
| Partially Fulfilled | Some, but not all, of the promised amount has been paid and allocated. |
| Fulfilled | The promised amount has been paid and allocated by the relevant date or within an approved extension. |
| Breached | The promised date has passed and the expected amount has not been paid, subject to any approved extension. |
| Cancelled | Commitment has been cancelled with a recorded reason. |

## 5.7 Tenant Payment Behaviour Indicators

These indicators describe documented payment behaviour. They are not a determination of intent, legal status or a permanent tenant rating.

| Indicator | Definition |
|---|---|
| Current | No outstanding overdue obligation under the configured rules. |
| Occasional Late Payment | One or more late payments that do not meet the approved repeated-late-payment threshold. |
| Repeated Late Payment | Tenant meets the approved threshold for late payments across the configured lookback period. |
| Persistent Arrears | Tenant has an outstanding balance beyond the configured persistence threshold. |
| Chronic Delinquency | Tenant meets the approved chronic-delinquency criteria based on repeated or prolonged unpaid obligations. |
| Under Review | Payment position or classification requires review by the Property Manager. |

The criteria and lookback period for these indicators must be configurable and approved before launch. The Property Manager must be able to review exceptional cases and record the reason for any manual override.

---

# 6. Open Business Decisions and Dependencies

The following items materially affect the calculation of rent, arrears, notification behaviour or stakeholder responsibility. They must be resolved before the relevant functionality is signed off for development.

| SN | Decision Required | Why It Matters | Proposed Starting Position / Note |
|---:|---|---|---|
| 1 | What is the rent due-date rule for each agreement? | Determines when reminders and arrears begin. | Use the due date recorded in the agreement. Confirm whether it is the agreement anniversary, a fixed calendar date or another contractual date. |
| 2 | Is there a grace period after the due date? | Determines when an unpaid obligation becomes overdue. | Make the grace period configurable; do not assume one until confirmed. |
| 3 | What are the exact repeated-late-payment and chronic-delinquency thresholds? | Prevents arbitrary or misleading classifications. | Agree the number of late cycles, lookback period, arrears duration and any minimum outstanding amount. |
| 4 | What post-due reminder cadence should apply? | Prevents missed follow-up and excessive messaging. | Consider 1, 3, 7, 14 and 30 days after overdue status, then a reduced configurable frequency. Do not send daily reminders indefinitely by default. |
| 5 | Who receives each overdue escalation? | Ensures the right parties are informed without oversharing tenant information. | Property Manager receives all alerts; lawyer and additional contacts receive only explicitly assigned events. |
| 6 | What is the receipt issuance SLA? | Determines when receipt requests become overdue and when escalations occur. | Agree the expected turnaround with the receipt issuer. A four-business-hour target may be considered, but is not yet confirmed. |
| 7 | Who is the primary and backup receipt issuer? | Every receipt request needs an accountable recipient. | Configure one primary issuer and a backup/escalation contact. |
| 8 | How will acknowledgement and receipt issuance be confirmed in Phase 1? | Secondary contacts do not have application logins. | Property Manager records acknowledgement and issuance after confirmation through the existing channel. Confirm whether receipt evidence must be attached. |
| 9 | How should a payment be allocated when the tenant gives no instruction? | Affects which rental period or charge is reduced. | Define an approved default allocation order. Do not silently assume FIFO or advance allocation. |
| 10 | Can a tenant pay for multiple rental years in advance? | Affects future obligations and next due dates. | Support advance payment allocation, subject to an agreed rule for excess or unallocated amounts. |
| 11 | How is the ₦4,000 security levy charged? | Affects tenant balances and financial reporting. | Confirm whether it is per tenant, per unit, per rental cycle or another basis, and whether it is refundable. |
| 12 | Is security levy included in lawyer commission? | Affects commission accuracy. | Proposed treatment is to calculate commission on eligible rent collected and exclude non-rent charges unless the agreement says otherwise. Confirm. |
| 13 | Can more than one tenant occupy a unit or can one tenant rent multiple units? | Affects how agreements and obligations are linked. | One tenant may have multiple agreements; confirm whether joint tenancy is required. |
| 14 | How are early termination, tenant replacement and rent increases handled? | Affects the validity of historic and future obligations. | Preserve the old agreement and create a new agreement/version with effective dates. Confirm any pro-rating or refund rules. |
| 15 | Should tenants receive payment confirmations or receipts once issued? | Determines whether tenant communication is one-way reminders only or includes payment/receipt updates. | Keep as configurable; do not expose the receipt issuer's internal workflow to tenants. |
| 16 | What are the approved SMS and email providers? | Required for delivery, retry and cost decisions. | Termii or Africa's Talking for SMS; Resend or SendGrid for email were suggested in the original PRD. Confirm provider accounts and delivery-report support. |
| 17 | What are the permitted notification quiet hours? | Prevents inappropriate or excessive communications. | Confirm local communication windows before enabling automated reminders. |
| 18 | What source data and historical period will be imported? | Determines migration mapping and reconciliation. | Confirm the source workbook, required columns, historical start date and expected record counts. |
| 19 | Which expense payment details are genuinely required? | Avoids collecting unnecessary bank account information. | Retain only the information needed for property expense tracking and reconciliation. |
| 20 | What is the data retention and backup policy? | Protects financial and tenancy history. | Agree retention, backup frequency, recovery expectations and who can authorise archival. |

---

# 7. Non-Functional and Operational Requirements

| Area | Requirement |
|---|---|
| Performance | Dashboard and tenant-level operational records should load in under two seconds for the expected MVP volume of up to 100 tenants, subject to agreed test conditions. |
| Reliability | Payment records must be saved independently of SMS/email provider availability. Notification failures must not cause a confirmed payment to be lost or duplicated. |
| Notification processing | Notifications must be queued, retried under a defined policy and recorded per recipient and channel. Duplicate sends caused by retries or repeated scheduled processing must be prevented. |
| Security | The MVP must use secure authentication, strong password controls, protected sessions and encryption for sensitive data at rest. Provider credentials must be stored securely and not exposed in user-facing records. |
| Access | Only the Property Manager has authenticated access in the MVP. Secondary contacts receive only the notifications assigned to them. |
| Auditability | Critical record creation, updates, reversals, status changes, configuration changes, notification attempts and manual overrides must be traceable by user, action, timestamp and affected record. |
| Data integrity | Financial balances must be derived from recorded obligations and payment allocations. Payment corrections and reversals must preserve the original history. |
| Privacy | Tenant financial information must only be sent to the tenant and stakeholders explicitly authorised to receive it. Messages must contain only the information needed for the recipient's role. |
| Availability and recovery | The application must have a documented backup and recovery process appropriate for the importance of tenant and financial records. Recovery should be tested before production use. |
| Usability | The application must be responsive and usable from a phone browser as well as a desktop browser. |
| Time and currency | Dates and notification schedules must use the property's local time zone. Financial values are recorded in Nigerian naira (₦) unless a future requirement explicitly introduces another currency. |
| Data import | Import validation, preview and reconciliation must be available before imported records are treated as operational records. |

---

# 8. Release Phasing

| Phase | Scope | Release Position |
|---|---|---|
| MVP (Phase 1) | Property, unit, tenant and agreement management; rental obligations; manual payment recording and allocation; arrears and delinquency visibility; promise-to-pay tracking; notifications and escalation; receipt request tracking; lawyer commission; expenses/maintenance; data import; dashboard and audit history | Required for initial release |
| Phase 2 | Automated official receipt PDF generation; receipt issuer or read-only stakeholder access; tenant-facing view; richer reporting and exports; enhanced maintenance workflows | Defer until MVP operating data and workflows are stable |
| Phase 3 | Multiple properties and owners; bank statement import or reconciliation; payment gateway integration; integrations with external accounting or property systems | Future consideration; not required to solve the current operating problem |

---

# 9. MVP Acceptance Conditions

The MVP is ready for operational acceptance when the following end-to-end scenarios have been demonstrated and signed off:

1. **New tenancy:** The Property Manager creates a tenant, unit and active agreement. The system establishes the correct rent obligation and due date without overwriting historical agreements.
2. **Upcoming rent:** An active unpaid obligation enters the configured pre-due reminder schedule and the correct tenant receives the reminder.
3. **Unpaid rent:** An obligation that remains unpaid after its due date and configured grace period is shown as overdue with the correct outstanding amount and days past due.
4. **Partial payment:** A tenant makes a partial payment. The system records the payment, allocates it to the selected obligation, reduces the outstanding balance and continues reminders for only the remaining balance.
5. **Advance payment:** A tenant makes a payment that covers more than one obligation or exceeds the current obligation. The system allocates the amount according to the approved rule and shows any unapplied credit separately.
6. **Repeated late payment:** A tenant's late-payment history is retained across rental cycles and the approved behavioural indicator is applied consistently. Settling current arrears does not erase historical late-payment behaviour.
7. **Promise to pay:** The Property Manager records a promised amount and date. The system tracks whether payment is made, partially made or missed and surfaces a breached commitment.
8. **Payment notification:** A confirmed payment creates one receipt request and triggers notification to the assigned issuer. Provider failure is visible and does not undo the saved payment.
9. **Receipt issuance:** The Property Manager records acknowledgement and subsequently records the official receipt number/reference and issue date. The receipt request closes only when issuance is recorded.
10. **Receipt SLA breach:** A request that remains unissued beyond the configured SLA is flagged and escalated to the agreed recipient.
11. **Payment correction/reversal:** An incorrect or reversed payment is traceably adjusted, the tenant's balance and arrears are recalculated, and any related receipt request is corrected or cancelled with the issuer notified where necessary.
12. **Import and reconciliation:** Historical tenants, units, agreements and payments are imported with validation and the resulting balances reconcile to the approved source records.
13. **Stakeholder routing:** Each notification is sent only to recipients assigned to that event and record; no tenant receives another tenant's information.
14. **Audit history:** The Property Manager can trace who performed key actions, what changed and when.

---

# 10. Items Deliberately Not Specified in This PRD

This PRD defines the product outcomes, user-facing behaviour and acceptance conditions. It does not prescribe:

- Screen layouts, page composition, button placement or visual design.
- Database tables, relationships or field-level technical schema.
- API endpoints, queue technology, hosting architecture or provider implementation.
- The exact notification provider integration mechanics.
- Detailed legal enforcement procedures or legal advice.

These matters should be addressed in design, technical specifications, implementation planning or legal review where appropriate. Product behaviour and business rules must remain consistent with the requirements in this document.

---

**End of Document**
