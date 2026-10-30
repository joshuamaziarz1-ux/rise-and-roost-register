# Verification record

All mutation tests use throwaway synthetic workspaces. No tests place orders or edit an existing preview/beta workspace. Hosted tests reject any hostname except the exact experience preview. No external email/payment provider is called by these tests.

## Automated coverage

The backend suite includes 17 new management tests plus the existing 66 API/security/customer/order tests. The local browser suite includes six new management journeys across desktop Chromium, desktop WebKit, iPhone WebKit, Pixel Android Chromium, and tablet Chromium, plus 60 existing browser cases.

| Requested reliability check | Evidence |
| --- | --- |
| Final available physical item; simultaneous buyers | Management backend concurrent requests: one order succeeds, one conflicts, zero free stock |
| Duplicate checkout | Same request ID returns one order and one reservation |
| Interrupted save | Browser drops a response after commit; operation lookup confirms one audit entry |
| Concurrent owner editing | Two independent contexts; stale save rejected, fields retained, reviewed three-way rebase |
| Live price/stock edits | Other public browser observes changed product name/price without reload; backend free-unit and date-capacity checks |
| Archive with existing orders | Backend preserves historical product/price snapshots; future checkout blocked; restore supported |
| Booked pickup changes | Backend requires warning confirmation, retains original slot/snapshot and closes old slot |
| Reported vs verified | Customer reporting does not generate paid receipt or sales; owner checks independent record; tracking/receipt update |
| Financial totals/refunds/cancellations | Integer-cent reports, independent external refund references/idempotency, wrong-verification void/reverify, cancellation does not refund |
| Notifications/failures | Existing transactional outbox tests exercise rejection/timeout/retry/acceptance; order survives failures; managed in-app preferences tested; actual email disabled |
| Guest/member tracking | Existing independent-session guest tracking, member passkey/session/history and isolation browser journeys |
| Actual backup restore | Synthetic export/photo remap/private-copy restore; member relationship/comments/orders restored, source unchanged, occupied/root target rejected |
| Unauthorized access | Anonymous/wrong-workspace/CSRF/expired-session checks; legacy builder mutation endpoints denied when managed |
| Responsive touch UI | Five browser profiles; overflow checks/screenshots; iPhone bottom navigation and desktop sidebar/table |
| Failed/valid uploads | Invalid GIF rejected with form retained; actual canvas PNG uploads, reencodes and displays; server spoof/SVG/size/cross-workspace tests |
| Time/date boundaries | Indiana-local reporting; both 23-hour and 25-hour DST days; customer locale/time-zone-independent 12-hour browser checks |
| Offline/reconnect | Offline save reports unsaved, fields retained, later save succeeds; pending operation fencing |
| Customer design unchanged | Identical seeded Home/Shop PNG comparison with management flag off/on in all five profiles |
| Flexible calendars/comments | Sunday/Wednesday recurrence, pause, live approved/hidden comments without customer reload |

Test screenshots contain synthetic data only. Failure traces are disabled remotely; local retained traces must not be published because test owner access credentials can appear in network payloads. CI publishes only named PNG evidence.

## Commands

```sh
npm --prefix website test
npm --prefix website run test:browser
npm --prefix website run check
npm --prefix website run check:experience
```

The original-beta `check` is a bundle **dry run**, never a deployment. Only `deploy:experience` may be used for this branch. `STUDIO_MANAGEMENT_ENABLED` is configured only in `wrangler.experience.toml`; default Worker behavior remains gated off.

Hosted browser checks require explicit `RR_MANAGEMENT_PREVIEW_URL` equal to the exact isolated preview, then `npm --prefix website run test:studio-hosted`. They create fresh synthetic private workspaces and read the actual root/Studio without changing them. Visual equality uses local paired fixtures, not a fabricated hosted baseline. CI opt-in is the `[verify-studio-preview]` commit marker.

## Still manual / pending

- Descope project, both real individual owner accounts, passkey/recovery/remembered-session checks and explicit approval of an eventual auth switch.
- Physical iPhone/iPad/Android photo-library/camera file formats, installation, screen reader/VoiceOver, print dialogs, real Touch ID/passkey syncing, and real weak/mobile network behavior. Emulated WebKit is not a physical Safari device.
- External notification delivery: no provider or paid messaging is enabled. Acceptance tests use a mock provider and do not claim actual delivered email.
- Business-scale load, normalized storage/pagination and large database recovery. Preview limits are documented in GUIDE.md; these guards do not make this production-ready.

Final local/hosted counts, deployment and preservation results are recorded in RESULTS.md after verification.
