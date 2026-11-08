# Account deletion — separate backend approval required

Status: design only. No endpoint, migration, destructive SQL or enabled deletion interface is included in this change.

## Architecture inspected

The website uses its own Cloudflare Worker/D1 membership system, separate from the legacy Register/Supabase system. `server/roost.mjs` resolves a member from an HttpOnly session cookie using `server/customer-sessions.mjs`. `/api/roost/me` returns only that member's profile, devices, orders and credits; `/api/roost/profile` saves only `profile_json` for the session member and workspace. Profile contact email is distinct from the verified sign-in email. Existing profile APIs suffice for checkout prefill; no backend or database change is needed for autofill.

Membership records include `roost_members`, passkeys in `roost_credentials`, `roost_sessions` and `roost_session_details`, verified `roost_contacts`, `roost_codes`, `roost_passwords`, `roost_password_grants`, `roost_email_identities`, `roost_email_tokens` and `roost_auth_events`. Orders, favorites, cash privileges and credit history are stored inside the versioned workspace `ledger_json`. There are no membership foreign-key cascades in the inspected schema. No self-deletion route exists in the inspected server source or among the Roost routes in the downloaded active executable. The currently active executable must also be reconciled with source before backend implementation because live source is newer than the repository.

## Proposed user flow

1. At the bottom of Account Settings, explain the consequences and identify any active order blocking deletion. No deletion by email/name/phone lookup.
2. Require the current account password, checked against the signed-in member's existing password verifier. Do not use login to a supplied email as reauthentication: it could switch identities. Legacy accounts without a password must establish an approved password method first; a frontend password prompt alone is insufficient.
3. Issue a short-lived, single-use server grant bound to member, workspace, current session and password revision, for deletion only. Require same-origin JSON/CSRF checks and rate limits; never log the password or grant.
4. Present a separate final confirmation explaining retained business records. Require an explicit unchecked confirmation plus a final “Permanently delete my account” action. Reauthenticate after expiry or an identity/session change.
5. The final POST derives member/workspace exclusively from the authenticated session, ignores/rejects client account IDs, consumes the grant once, checks the credential revision and rechecks active orders atomically. Do not race deletion against new checkout, password resets, email linking or profile changes.

## Proposed records policy and transaction

- Block deletion while any order, pickup change, unpaid obligation, refund/dispute or reserved credit is unresolved. Do not cancel, move, refund or erase orders to make deletion possible. Business/legal policy must define resolution and retention before implementation.
- Keep immutable order/payment/inventory/credit events and legally required receipts, contact snapshots and audit records for their approved retention periods, with access limited to authorized business users. Retained historic email must not serve as a login identity or attach old orders to a new account.
- In one guarded D1 batch/transaction, revoke all member sessions and device details; remove the member's passkeys, password verifier, verified login contacts/email identities, recovery verifier and eligible outstanding authentication challenges/codes/tokens. Mixed-purpose token payloads require explicit member-scoped ownership handling; do not delete unrelated pending registrations or grants. Delete membership/profile and nonrequired preferences/favorites only after retention approval. Preserve unrelated members and workspace owner/Studio credentials.
- Serialize the versioned ledger update with membership deletion and checkout. Add schema/transaction support if needed; do not promise atomicity from several sequential requests. A tombstone/grant table may be needed and requires a separately reviewed migration. Tombstones must not reserve deleted email addresses.
- Clear the HttpOnly cookie and browser private state, notify other tabs, and reject copied sessions and unused recovery/reset/verify tokens immediately. Handle failure without reporting success or leaving a partly deleted identity.
- Release uniqueness reservations for the deleted email/username/contact where policy allows. Prove that registration can reuse the email and receives a new member ID with no prior orders, favorites, credits, privileges or recovery access. Marketing consent/suppression is a separate purpose; deletion must not re-enable marketing.

## Approval and validation required

Approve the retention/active-order policy and this backend scope first. Then prepare the exact migration/API implementation for review against a fresh production schema and executable baseline; take and rehearse an encrypted restore before any approved production change. Do not implement or deploy under the current frontend approval.

Required isolated tests: wrong password, CSRF, anonymous access, another member ID, cross-workspace access, expired/replayed grants, all sessions and token revocation, concurrent checkout/reset/link/delete, active-order rejection, complete transaction rollback, unrelated-row/ledger preservation, legal-record retention, email reuse with a fresh identity, and browser history/multiple-tab clearing. Real Safari and owner acceptance follow automated desktop/iPhone WebKit checks.
