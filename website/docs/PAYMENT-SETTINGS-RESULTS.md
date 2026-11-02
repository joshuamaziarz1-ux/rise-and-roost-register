# Payment Settings release report — November 1, 2026

Local validation completed November 2, 2026. [Machine-readable evidence](payment-settings/verification.json).

Payment Settings is deployed only to the isolated Rise & Roost experience preview. It continues the approved Website Studio and customer design on development branch `codex/complete-preview`, in [unmerged draft PR #11](https://github.com/joshuamaziarz1-ux/rise-and-roost-register/pull/11). This report supersedes the earlier combined payment/business-day setup instructions.

## Completed

**More → Settings → Payments** lets the authenticated owner add, edit, save, cancel, enable, disable and test PayPal, Venmo and Cash App destinations without code changes. Settings persist in the existing isolated D1 workspace and synchronize between Studio sessions and customer pages. Server validation rejects unsupported/unsafe URLs. Owner-version conflict checks, idempotent retries, preserved drafts, server-confirmed saves and before/after audit protect changes.

Test Link opens the saved destination without sending money. An explicit owner confirmation records the recipient check; opening alone cannot satisfy readiness. URL edits invalidate the previous test. Customer checkout receives only valid, enabled, commercially acknowledged destinations with a matching owner-confirmed test. Other methods are disabled. Positive-total orders are refused server-side before inventory reservation if none is ready, including concurrent disable/order races. Studio remains available without configured links. Zero-total orders do not require payment.

Manual payment verification, financial reporting and existing orders remain independent. Opening a link, confirming its test, canceling payment or returning to tracking never verifies receipt or changes verified sales. No payment URL or account identifier is invented or seeded in the hosted preview. The main preview currently has no ready payment destinations, so payable checkout intentionally remains paused pending owner setup.

## Actual validation

| Check | Result |
| --- | --- |
| Backend/security/commerce | **127 passed**, zero failures/skips/cancellations, including seven payment setup/readiness cases and restored-copy payment safety |
| Desktop/iPhone commerce and payment settings | **8 passed**, desktop Chromium and iPhone-sized WebKit; independent owner/customer sessions, all three providers, failed/malformed saves, unsafe URLs, stale tests, enable/disable, URL edits, draft recovery, conflicts and manual verification |
| Full five-profile browser regression | **120 passed**, desktop Chromium, desktop WebKit, iPhone WebKit, Android Chromium and tablet Chromium; zero failures |
| Actual local Cloudflare workerd/D1 | Passed owner PIN/session protection, persisted payment setup/test confirmation, customer checkout, private messages, manual verification, fulfillment and approved extensions |
| Worker compilation | Both isolated preview and original-beta configurations passed dry-run compilation. The beta was not deployed |
| Private preview backup/restore | All **14 application tables and two explicit indexes**, every record and schema restored locally and matched; rereads confirmed stable remote records; zero remote writes |
| Post-deployment data preservation | All current pre-deployment records in all 14 preview tables matched, with no added rows. Original beta's six tables, Worker settings and deployment matched the protected baseline |
| Hosted HTTPS/browser acceptance | **Blocked**, not passed: a fresh post-deployment request received proxy CONNECT 403 for the preview hostname |
| Runtime dependency audit | Zero reported vulnerabilities with `npm audit --omit=dev`; existing development-tool dependencies are noted below |

Provider pages in automated tests are fictional intercepts; no money was sent. Actual recipient identity, commercial-use approval, native provider apps, account existence, real payment handoff and physical iPhone/MacBook acceptance are not certified by these tests. CI is separate and is not counted as passed while pending.

The first GitHub run passed all 127 backend checks and all 120 regression cases, then passed seven of eight commerce cases. One desktop assertion selected both the Customer Contacted indicator and a temporary message-retry status. The test now explicitly waits for the confirmed-send form to close and selects the Customer Contacted indicator. This is a test-only correction; application assets are unchanged. All eight affected desktop/iPhone commerce cases passed again locally after the correction. Current CI results are available in the PR's Checks tab and remain separate from these local passing totals.

## Deployment and data

- Customer: https://rise-roost-experience-preview.joshua-maziarz1.workers.dev/
- Studio: https://rise-roost-experience-preview.joshua-maziarz1.workers.dev/studio#Settings%2FPayments
- Application source: `a586150ee60134b157fcb12da7eff8ab50522891`.
- Worker: `rise-roost-experience-preview`; deployment: `33ea5ada-a966-4cc2-85ab-cb1039096e1c`.
- Version: `147988f7-5432-4e9b-86cf-d920d6bf1013`, **100% traffic**, deployed November 1, 2026 at **23:17:27 UTC**.
- Database: `rise-roost-experience-preview-db` (`21352b95-d7f6-406f-8527-4b8dbcebf1bf`). Cloudflare control-plane read-back confirms the separate D1 binding, preserved original bindings/private PIN pepper, enabled workers.dev and disabled alternate preview URLs.
- **No SQL migration or hosted data write for this feature.** Additive payment fields use the existing JSON ledger. Existing legacy links without enable/test certification fail closed until the owner enables and tests them.
- Backup restoration into a new private copy disables destinations and clears test certification, retaining private URLs for owner review and retesting. It does not alter source settings.
- Preview-only rollback can use prior version `cb19c0f3-651c-48d8-a8d2-f9f729ed1399` on this exact Worker after a fresh backup. No database downgrade is required. That older version does not enforce the new tested-link requirement, so retain ordering protection when considering rollback. No rollback was performed.

## Danielle's acceptance

1. Open Studio with the existing preview PIN. Choose **More → Settings → Payments**. Studio must open before any links are configured.
2. Add a provider-approved business destination, enable it, confirm commercial use and save. Use **Test … Link**, inspect the recipient without sending money, return and confirm the recipient check. Confirm **Ready** appears. Repeat for other providers as needed.
3. Open Studio on the other device and confirm the saved settings appear. Disable the last ready method: payable checkout must pause. Re-enable the unchanged tested link: it becomes available again. Edit a URL: it must require a new test.
4. Place a fictional order through the customer preview. Confirm checkout offers only ready methods and tracking opens the exact saved destination. Cancel or return without paying: status must remain **Awaiting Payment Verification**. Do not mark a real order paid unless independently received funds were checked.
5. Use the [complete Payment Settings guide and launch-readiness checklist](PAYMENT-SETTINGS.md). Real-app/recipient acceptance must be completed from an authorized network. The existing fictional private tracking example remains unchanged and is handed over privately; this feature created no additional hosted test orders.

## Remaining launch work and protection

Danielle must supply her actual business destinations; none was fabricated. URL validation and an owner-confirmed test cannot establish provider authorization, account ownership or provider terms. The temporary shared PIN identifies an owner device rather than an individual Danielle identity. Individual production accounts/recovery and the other documented [production launch gates](COMMERCE-RESULTS.md#incomplete-setup-blockers-and-security-concerns) remain required. Hosted acceptance is blocked by this environment's network allowlist.

The full dependency audit reports six high-severity entries in the existing Wrangler development-tool tree (`wrangler`, `miniflare`, `sharp`, `undici`, `ws`, `zod`). The runtime-only audit reports zero. Dependencies were not changed by this feature; a separately validated tooling upgrade remains before production release.

No merge, production deployment/database write, roadside Register/Admin change, original beta deployment/data change, Supabase or Square change, live-customer modification, GoDaddy/DNS/nameserver change, Cloudflare custom routing or official-domain activation was performed. The [separate later GoDaddy/Cloudflare checklist](GODADDY-CLOUDFLARE-CHECKLIST.md) remains preparation only.
