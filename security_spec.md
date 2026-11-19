# PropLedger Security Specification (Phase 0)

## 1. Data Invariants
1. **Strict Workspace Ownership (Master Gate)**: Every subcollection record under `/workspaces/{workspaceId}` MUST carry `ownerUid` matching both `request.auth.uid` and the parent workspace document's `ownerUid`. Access is immediately revoked if parent ownership changes or authentication is absent.
2. **Verified Identity Mandate**: All read/write mutations require an authenticated user (`request.auth != null`) with `request.auth.token.email_verified == true`.
3. **PII Isolation**: User emails/roles reside exclusively in `/users/{userId}/private/{docId}` (`isOwner(userId) || isAdmin()`). Tenant phone/email and stakeholder PII reside in `/workspaces/{workspaceId}/tenants` and `/contacts`, accessible only to the verified workspace owner or bootstrapped admin (`theibraheemagbaje@gmail.com`).
4. **Immutable Ownership & Timestamps**: `ownerUid` and `createdAt` cannot be modified after creation. Server-side timestamps (`syncedAt`, `createdAt`, `updatedAt`) MUST equal `request.time`.
5. **Strict Key Allowlists & Size Bounds**: Every document enforces `keys().hasAll(...) && keys().hasOnly(...)` along with explicit `.size()` caps on every string and array field to prevent shadow fields and resource exhaustion.
6. **Immutable Audit Trail**: `/workspaces/{workspaceId}/auditLogs/{auditId}` forbids updates (`allow update: if false`), allowing append-only creation and authorized workspace reset cleanup only.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return `PERMISSION_DENIED`)
1. **Unauthenticated Read/Write**: Any unauthenticated read or write to `/workspaces/*`, `/users/*`, or any subcollection.
2. **Unverified Email Spoof**: Signed-in user with `email_verified: false` claiming `email: "theibraheemagbaje@gmail.com"` attempting admin or owner actions.
3. **Cross-Tenant / Identity Spoofing**: Authenticated user B (`uid: "userB"`) creating a unit/tenant under `/workspaces/userA/tenants/t1` with `ownerUid: "userA"` or `"userB"`.
4. **Self-Assigned Privilege Escalation**: Authenticated user writing `/users/{uid}/private/info` with `role: "admin"` or creating `/admins/{uid}`.
5. **Shadow Update / Ghost Field Injection**: Updating `/workspaces/{uid}/tenants/t1` with `{ ...validFields, isVerifiedAdmin: true }`.
6. **Immutable Owner Tampering**: Updating `/workspaces/{uid}` or any sub-document to change `ownerUid` from `userA` to `userB`.
7. **Timestamp Forgery**: Creating/updating a document with `syncedAt` or `updatedAt` set to a client-chosen past/future timestamp instead of `request.time`.
8. **ID Poisoning**: Writing a document with an ID > 128 chars or invalid characters (e.g. `t-1/../../admin` or `$badId`).
9. **Value Poisoning (Type/Size Mismatch)**: Setting `agreedRent: "free"`, `notes` > 1000 chars, or `allocations` array length > 50.
10. **PII Blanket Scraping**: User B attempting `list` on `/users`, `/users/{userA}/private`, or `/workspaces/{userA}/tenants`.
11. **Terminal Audit Log Tampering**: Attempting `update` on `/workspaces/{userA}/auditLogs/{auditId}` to alter historical financial actions.
12. **Orphaned / Unowned Workspace Sub-document**: Creating a payment under `/workspaces/nonexistent/payments/p1` where parent workspace does not exist or belongs to another user.
