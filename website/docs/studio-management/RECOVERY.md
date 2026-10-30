# Business backup and recovery

## Scope and safety

This procedure applies only to `rise-roost-experience-preview` and its D1 database `rise-roost-experience-preview-db`. Never point it at the original beta, Register, Admin, Supabase, Square, or a custom domain. A backup does not prove ownership, restore an owner session, recover a lost access key, or authorize replacing an existing workspace.

Studio Settings → Download business backup exports documents, retained revisions, order snapshots and financial history, member contact profiles, recorded benefits, comments, and uploaded photo bytes. It excludes owner credential hashes, member passkeys, recovery hashes, and sessions. The download contains private customer information and tracking links: keep it in encrypted, access-controlled storage; do not attach it to issues, PRs, chat, or public artifacts.

The in-app photo archive supports up to 8 MB of source photo bytes. Larger complete archives need an operator-assisted Cloudflare D1 export. Request a full database export before any future schema migration. No migration is part of this release.

## Tested restore into a private copy

The automated management backend test exports synthetic data, uploads/remaps its photo, and actually restores products, unpublished content, published content, orders, a member/contact relationship, and comments into a new empty private workspace. It compares the source row before and after and confirms it is unchanged. Restoration to the main preview or an occupied workspace is rejected.

Operator procedure, with an authenticated owner's approval:

1. Keep the source backup intact. Create a **new private recovery workspace** through the existing owner workflow; retain its newly issued access details privately. Do not change `PUBLIC_WORKSPACE_ID`.
2. Using that workspace's authenticated browser session, upload each archived photo through `/api/upload` (MIME and base64 bytes). Build an `assetMap` from the old asset ID to the returned `/api/assets/...` path. Existing source asset ownership cannot be reused across workspaces.
3. Fetch `/api/manage/snapshot` with `X-RR-Workspace` set to the new target. POST `/api/manage/import` with the target's `revision`, one UUID `operationId`, `confirmPrivateCopy: true`, the backup document (omit the `assets` byte archive after uploading), and `assetMap`. Use the same origin and secure HttpOnly owner cookie. Do not put keys or session tokens on the command line. Respect the request size limit; the original backup file must remain unchanged.
4. Check the response and inspect the private copy. Compare product/photo/revision/order totals and contact associations. Test a fresh tracking link: restored links use rotated secrets, old links are not a route to the copy. Notification queues are cleared to avoid resending old messages.
5. Download and compare a backup of the copy. Existing member sign-in credentials are deliberately not copied: these are business contacts/history, not active restored customer accounts. Member account relinking requires a separately approved, verified recovery process.
6. Leave the original site and routing unchanged. Replacing a public workspace or restoring over existing data is **not supported by this endpoint** and requires a separately reviewed migration and explicit approval.

Imports are atomic and idempotent; a conflicting target change fails rather than partially overwriting records. Oversized restores fail closed. This is an operator/API procedure, not a self-service import screen. Larger databases need a staged operator recovery procedure and Cloudflare-plan query-limit checks before execution.

## Owner account recovery remains separate

Descope is not configured. Existing workspace access and 12-hour HttpOnly sessions remain unchanged, including the requirement for the matching private key or an already authenticated owner to approve a device connection. A pairing code alone cannot recover ownership. Neither a backup nor Cloudflare read access is used to bypass authentication.

Create the Descope project, configure both individual owners and passkeys/remembered sessions, verify ownership of the exact existing workspace, test recovery and revocation, then obtain the user's approval before switching owner authentication. Do not reset, replace, or merge workspaces as an authentication shortcut.

## Pre-deployment operator backup evidence

For this rollout, a complete private logical snapshot of all 11 preview D1 tables was saved outside the repository with mode `0600`. All tables were restored into local SQLite; all 45 pre-existing workspace rows matched the read-only preservation fingerprints exactly. The normal Cloudflare SQL-export request succeeded, but its temporary download hostname was unreachable from this environment, so the snapshot was obtained through authenticated, read-only D1 queries. No remote restore or existing-data mutation was performed. The private snapshot includes credential hashes for disaster recovery and must never be published; the owner-facing business export continues to exclude authentication material.
