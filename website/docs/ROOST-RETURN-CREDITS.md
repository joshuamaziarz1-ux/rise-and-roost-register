# The Roost customer experience and return credits

Branch: `feature/roost-customer-experience`. Base: deployed customer-login source `42d2b4aa52bb8bde7a604779ed3f10712d0d5ea5` and its deployment report `7e41464`. Before development, every deployed server source in the active source map matched this base. The Help Guide, Home/Back controls, pickup cards and passkey/rolling-session upgrade are retained. Studio's Cloudflare Access authentication is unchanged.

## Customer and owner controls

The customer home uses the authenticated membership's preferred name (or first name), an Indiana-time greeting, upcoming pickup details, the existing published `freshAnnouncement`, available/reserved dollar credit, private orders and favorites. Contact names remain editable pickup information, never evidence of account ownership. Guest orders still require their complete private tracking secret to be claimed.

Save favorite / Remove favorite appears on product cards for signed-in customers. Favorites are private to the membership. Cards use the current published catalog, variants, prices and availability; unavailable saved IDs show an unavailable message and remain removable. Reorder links open the current product, so old prices or quantities cannot bypass basket or server validation. Logout clears private favorites, credits, orders and account state.

Studio → The Roost → Return Credits contains:

- Review program settings, including a legal/accounting review acknowledgement and explicit confirmation.
- Add return item / Edit [name], with Credit value ($) and Active, Inactive or Retired eligibility. Active reactivates an item. There are no default items, bottle values or egg-carton entries. No destructive delete exists.
- Search Roost accounts by name, email or phone, then select the actual membership. Contact matching never creates or merges accounts.
- Record customer return with multiple item quantities, a calculated review total, acceptance checkbox and Confirm return credit.
- Available and reserved balances, a dated transaction history, Correct balance and one-time Reverse this transaction, all with confirmation and recorded reason.
- Review expired reservation after the pickup deadline, with a required owner review and reason. It cancels the unverified order and releases both credit and inventory. Unresolved contact, disputes and final resolutions block this shortcut. Other abandoned orders use existing Orders → Update fulfillment → Canceled.

The Settings-only Help Guide documents these actual controls. No Help content is added to Studio Home.

## Financial model and lifecycle

Money is integer cents throughout. Decimal text is parsed without floating-point money arithmetic. Item values range from $0 to $1,000; quantities are integers from 1 to 100; a return or correction is capped at $10,000. A zero-value item may be configured but cannot independently issue a zero-value monetary return. Balances and reserved totals are bounded and validated as safe integers.

`workspaces.ledger_json.returnCredits` contains configuration and append-only monetary events. `roostFavorites` stores private saved product IDs. No new database table, migration or balance reseed is needed. The existing single-row D1 compare-and-swap updates credit, orders and inventory reservations in one database commit, guarded by the current ledger and publication versions. Conflicts retry checkout against current balances; owner changes require fresh review. A failed commit leaves all financial and order state unchanged.

Events record amount, available/reserved deltas, member, date, description and applicable order or original transaction reference. Accepted returns snapshot the actual item name, unit cents and quantity. Later item edits, retirement or reactivation never recalculate prior money. Authorized owner actions are also recorded in the existing actor-tagged audit and idempotency log. Neither ledger is pruned; the existing 1.2 MB workspace ledger limit and 2,000 owner-operation limit fail before accepting further work. Storage expansion is required before those limits are reached; history must never be silently removed.

1. A member opts into full or partial credit at checkout. The server derives membership and order subtotal, rejects invalid amounts, and verifies the current available balance. Guests cannot spend credit. The browser shows subtotal, applied credit and remaining payment before ordering.
2. Mixed-payment order creation appends `reserved`: available decreases and reserved increases in the same commit as the order. External payment choices and manual verification remain unchanged. Opening an app link is not payment evidence.
3. Danielle's existing Verify payment checks the remaining external amount, then appends `used`, removing the reservation without a second available-balance deduction. Receipts and verified-payment reports record the external amount; order value retains the full subtotal and separately discloses used return credit.
4. Credit-only orders append reservation and use in their successful creation commit. Their external total is zero and payment is `not_required`; no external verification or app link is necessary.
5. Cancellation appends `released` for reserved credit or `restored` for already-used credit, once. External refunds stay separate. Reopening rechecks credit, inventory and pickup capacity and atomically reserves credit again. Payment-verification corrections retain the credit deduction pending owner review; cancellation still restores it exactly once.
6. Time passing never expires a customer's monetary balance or silently releases possibly paid orders. Expired and abandoned reservations remain visible pending owner review, then can be canceled safely. Pending reservations cannot be buried by a final pickup resolution.
7. Reversals reference a specific earned/adjustment event once. Reductions and reversals cannot spend reserved credit or make available credit negative. Increasing an owner's balance, item settings and history are never customer-authorized operations.

JSON same-origin CSRF checks, existing Studio owner authorization, independent customer sessions, server ownership checks and idempotency apply to every mutation. A member checkout retry cannot reveal a different member's tracking secret. Private responses are not cacheable.

## Activation and requirements still requiring owner review

The software ships with the return program **paused by default** and no eligible items. Production ordering and checkout remain in their preexisting disabled state. Danielle can configure items and inspect the controls immediately. Before enabling the return program, she should review the classification and handling of promotional/container credits, applicable Indiana and federal store-credit or gift-certificate rules, unclaimed property, tax treatment and ledger liability/accounting with her adviser. The repository cannot establish those legal/business facts. No expiration, cash-redemption, transfer, forfeiture, tax-offset or refund policy has been invented. The Settings confirmation records the owner's review; it does not provide legal certification or activate production ordering.

The inspected production ledger contained no legacy monetary benefit entries or orders. Existing membership, credential, session, comment, product, payment and calendar records are preserved. Other environments containing legacy monetary benefits are blocked from activating until ownership and value have a verified migration. Bottle counts are not converted into dollars. The legacy records remain visible; no automatic duplicate balance is created.

Complete D1 backup/recovery already captures the monetary ledger with original account IDs. The contact-only business-copy import refuses backups with monetary transactions, because that workflow deliberately replaces account identities and cannot establish ownership of stored money. Use verified full-database recovery instead; never restore production data for a code rollback.

## Verification and deployment

Use isolated fixtures only. Run `npm test`, `python tests/production_schema_guards.py`, the return-credits, roost-login, phase3, production, commerce and navigation Playwright configurations, and the compiled production Worker smoke test. The new monetary tests exercise returns, configuration, history, concurrent balance updates and checkout, idempotency, failed writes, corrections, reversals, cancellation/reopening, expiry review, private favorites, guest access, CSRF and owner isolation. The new browser matrix covers all five desktop/mobile profiles including WebKit.

For production, fetch current refs and active version again. Stop on unexplained source/configuration/data drift. Generate a private Wrangler configuration from every current binding and actual asset/runtime setting; do not deploy the checked-in preparation-only config. Dry-build and test that exact bundle, stage it with `wrangler versions upload`, stage the exact prebuilt executable that passed workerd/D1 testing, verify candidate bindings and runtime metadata, recheck original table/schema and Access fingerprints, then shift traffic using the versions deployment API. Download and compare the active executable and source map immediately after activation. Do not modify routes, Access, payment destinations, scheduled jobs or checkout gates. Verify read-only public pages, asset hashes, authorization and preserved data afterward. Retain the previous version and its matching assets for code rollback, checking for newer work first. Never reset or restore D1 for rollback.
