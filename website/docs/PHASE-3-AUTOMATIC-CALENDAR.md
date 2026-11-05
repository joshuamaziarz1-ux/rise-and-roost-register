# Phase 3: final automatic pickup calendar

**Deployment update:** the authorized production attempt was rolled back after a legacy-calendar compatibility blocker. See [PHASE-3-DEPLOYMENT-RESULTS.md](PHASE-3-DEPLOYMENT-RESULTS.md) for the current production state. Earlier verification/release-preparation statements below are historical.
Prepared November 5, 2026, America/New_York. Branch: `feature/phase-3-website-studio`, continuing the completed Phase 3 candidate `3d09b4f`. Application implementation commits: `cae00ca`, `c321ffd` and `548b7deb2712cd8163830ca96ab57684ae7d5a65` (final application source).

Danielle has confirmed successful sign-in to the live Phase 2 Studio. Phase 3 remains **undeployed**. This work makes no production D1 writes, schema changes, Worker uploads, traffic changes, Access changes, or changes to checkout activation.

## Pickup behavior

Regular pickups repeat every **Wednesday, Thursday and Friday**. The server calculates a rolling nine-week calendar, providing at least eight weeks ahead without weekly creation, deletion, a scheduled job, or a database migration.

| Pickup | Ordering deadline in America/Indiana/Indianapolis |
| --- | --- |
| Wednesday | Monday, 12:00 PM |
| Thursday | Tuesday, 12:00 PM |
| Friday | Wednesday, 12:00 PM |

An order is eligible strictly before its deadline. Exact noon and later are closed. Two **calendar** days are subtracted before converting local noon to an instant, so daylight-saving changes do not alter the rule. There are no next-day exceptions, including for special dates. Thursday at 6 PM advances to the following Wednesday. Existing ordering pauses, checkout locks, payment readiness, product visibility, stock and production limits continue to apply; ordering is not restricted to pickup weekdays.

Both customer availability and order reservation use `server/pickup-calendar.mjs`. Supplying an expired, closed, full, unknown or fabricated pickup ID directly to checkout cannot bypass eligibility. The existing compare-and-swap checks on the ledger and published revision protect concurrent orders and concurrent calendar edits; request and operation IDs retain their idempotent behavior.

The basket uses server time, hides expired options at their deadline, and selects the next date that can accommodate **every** basket product and quantity. A deadline timer handles an open page at noon, and regular refresh handles changed availability and the advancing horizon even when the database revision has not changed. Server validation remains authoritative if a browser is offline or its clock is wrong. Automatic date rollover retains the checkout request ID, allowing a retry to recover an already accepted order if its response was lost, without creating or moving an order.

## Simple Studio controls and preserved history

Calendar shows upcoming dates, ordering deadlines, capacity and scheduled orders. Danielle can:

- Skip or close a date; a date closure covers all existing windows that day.
- Reopen a closed window by editing it.
- Add or copy a special pickup date and name its event.
- Adjust window capacity, combined daily order capacity and per-product production limits.
- Inspect scheduled orders and print pickup and production lists.

The finite “Set recurring days” generator is removed. The recurring weekdays and two-day noon rule require no owner setup and cannot accidentally become a next-day rule through the editing form.

Recurring windows have deterministic IDs. A saved date exception takes precedence over generation for that date; exact duplicate active windows are rejected. Ordinary reads generate availability in memory and do not insert or delete records. Only explicit owner exceptions are saved. A normal edit therefore does not store nine weeks of generated dates.

Existing stored pickup records remain in the document. Booked generated pickups remain in each order's saved snapshot and are included in Studio history after their date leaves the rolling horizon. Past windows are immutable. Changes affecting booked dates require confirmation, and time changes retain the old window closed to new orders while creating a replacement. No existing order is canceled, moved, repriced or given a different accepted pickup deadline by a calendar edit.

The optional JSON field `document.pickupSchedule` retains recurring pickup hours and order capacity when the first calendar edit freezes defaults. For older documents without it, the server adopts existing pickup hours and the most conservative existing window/daily order capacity; an empty calendar defaults to 3–6 PM and 12 orders. Generated product availability uses each product's current production capacity. Date-specific product limits remain confined to that date. Existing manual windows retain their capacities; future ordering deadlines follow the confirmed policy without rewriting stored history.

Calendar saves include automatic audit entries with the actor, time and changed window values. Product price/quantity audits, existing order audit trails and history remain intact. Content publication and content restoration retain the current operational schedule and exceptions.

## All seven Phase 3 improvements retained

| Improvement | Preserved behavior |
| --- | --- |
| Three selling methods | Online Ordering, Preorder and In-Store Only retain their existing stock and production accounting. |
| Fresh at The Roost! | Home/Shop listings, multiple in-store products and the editable daily announcement remain available. |
| Simple inventory | The relevant available/in-store/make-ahead quantity controls remain in place. |
| Pickup management | Fully automatic regular calendar with simple date exceptions and order lists. |
| Automatic audits | Product adjustments need no manually entered reason; actor, time and before/after values remain recorded. |
| Hiding and history | Hide/Show Product preserves identities, photos, order lines and history. |
| Sold-out visibility | Exhausted products stay listed; replenishing stock or capacity restores purchasing. |

The approved stylesheets, layout, images, Phase 1 transport protections, Phase 2 authentication, Cloudflare Access code/configuration and SQL schema are unchanged. The example pickup FAQ now describes the confirmed schedule. Local-time conversion has a bounded cache for repeated calendar calculations; invalid and ambiguous local times still reject.

## Verification

Final results, source hashes, protected-file comparisons and local build hashes are recorded in [automatic-calendar-verification.json](phase3/automatic-calendar-verification.json). All application mutations in these checks use synthetic records in disposable local SQLite/D1 instances. Payment links are fictional/intercepted.

| Check | Final result |
| --- | --- |
| Complete backend suite | **206 passed**, zero failures/skips. |
| Local production schema guards | **7 passed**. |
| Full browser matrix | **145 unique cases verified** across all five profiles: 143 passed in the complete run; 2 iPhone screenshot-export failures resolved by the fresh focused/capture reruns below. |
| Focused Phase 3 browser matrix | **25 passed** across all five profiles, including stable checkout retry identity at rollover. |
| Calendar capture regression | **5 passed** across all five profiles after selecting CSS-resolution screenshots for the nine-week calendar. |
| Production browser regression | **10 passed** on desktop Chromium and iPhone WebKit. |
| Commerce browser regression | **8 passed** on desktop Chromium and iPhone WebKit. |
| Production, classic and experience builds | All three dry-runs passed; nothing uploaded. |
| Actual local Worker/D1 smoke checks | Production guards, generated pickup concurrency/closure and preserved orders, manual payment/fulfillment, classic compatibility and PIN/commerce passed. |
| Production dependency audit | Zero known runtime dependency vulnerabilities. |

Coverage includes all three pickup days at one millisecond before noon, exact noon and after; Thursday-evening/week/month/year rollover; past dates; spring/fall DST; multiple preorder products and variants; physical stock; per-date production, window and daily order limits; concurrent reservations; stable IDs; duplicate rejection; skip/reopen/special dates; booked-date confirmation; immutable order snapshots; historical generated dates; paused ordering; both signed owner identities; same-origin protections; browser clock skew; and deadline refresh with unchanged revisions.

Browser profiles are desktop Chromium, desktop WebKit, iPhone WebKit, Android Chromium and landscape tablet Chromium. They are automated browser profiles, not physical-device certification. Fresh synthetic calendar screenshots: [desktop](phase3/automatic-calendar-desktop-chromium.png) and [iPhone](phase3/automatic-calendar-iphone-webkit.png). Additional profiles are included with the local release evidence. Earlier production fingerprints and screenshots in the original Phase 3 report are historical evidence and were not represented as new live checks in this work.

Reproduce with Node 24, `npm ci`, the Playwright browsers matching the lockfile, then `npm test`, `python3 tests/production_schema_guards.py`, `npm run test:browser`, `npm run test:production-browser`, and `npm run test:commerce-browser`. The supplied cloud environment additionally uses its existing user-space WebKit libraries through `RR_WEBKIT_LIBRARY_ROOT`; that is test infrastructure only.

## Safe production deployment procedure — for a later authorized release

1. **Obtain explicit Phase 3 deployment authorization.** Danielle's Phase 2 sign-in confirmation is complete. This task expressly withholds Phase 3 deployment and production D1 modification. The checked-in `wrangler.production.toml` is a preparation profile without the active owner configuration; do not deploy it directly.
2. Freeze the reviewed commit and verify its build/asset hashes. Read the currently active production version, actual bindings and runtime settings, Access owner/audience configuration, asset routing, routes/domains and checkout state. Compare them with the retained Phase 2 baseline and investigate unexplained drift. Retain the active version for application rollback and verify the existing backup/recovery record.
3. Keep the current D1 binding and all existing data. **No migration, initialization, reset, reseed, deletion or database restore is required.** Preserve `REAL_CHECKOUT_ENABLED=false` and the existing `orderingPaused=true`; releasing this calendar does not authorize opening checkout. Do not change Access policies, owner identities, session duration, DNS, routes or TLS.
4. Using Cloudflare's supported assets/version workflow, upload the complete matching static asset set and the built Worker as an **inactive version**, preserving the actual production bindings and runtime settings. The release requires the changed browser modules and the existing Phase 3 `selling.mjs`; retaining only the older Phase 2 assets would produce a mismatched release. Inspect the candidate metadata, bindings and asset association before activation. These upload/activation steps have not been performed in this task.
5. After review, activate only the authorized candidate. Repeat the HTTPS redirects/HSTS, anonymous Studio/owner-API denial, closed legacy routes, checkout lock/pause and no-cache availability checks. Have Danielle check the automatic Calendar, its orders/history, Products and Fresh in her authenticated Studio. Compare read-only D1 fingerprints and account for any legitimate concurrent owner activity. Do not create synthetic production orders or payments.
6. If rollback is required, review configuration drift, retain the checkout lock/pause and switch Worker traffic back to the retained verified Phase 2 version. Preserve all D1 records and owner changes. Older code does not generate the new recurring calendar, but existing orders retain their original saved pickup details. Restore the automatic calendar with a reviewed forward fix; never restore D1 to roll back application code.

The release artifact is a local build and review package only. No Phase 3 version has been uploaded or deployed, and no production business record has been modified by this work.
