# Studio preview verification — October 30, 2026

## Local results

- **83/83 backend tests pass:** 17 management checks plus the existing 66 security/customer/order tests.
- **60 existing browser cases pass** across desktop Chrome, desktop WebKit/Safari, iPhone WebKit, Android Chromium and tablet Chromium.
- **30 management browser cases pass across the same five profiles**, including targeted reruns after correcting failures. A single clean full-suite CI run is also configured for the final commit.
- The session-renewal tests found that the preserved form stayed behind the sign-in screen. The corrected desktop Chromium/WebKit rerun passes **2/2**; iPhone/Android/tablet recovery also passes.
- Conflicting-edit tests found a missing review banner after live polling; fixed and rerun successfully in all profiles. Delayed save reconciliation now checks operation/form identity before closing a form.
- Approved customer Home/Shop screenshots compare exactly at matched viewport and normalized 1× raster density in all five profiles. Actual device-profile screenshots retain their native density. Fractional Pixel 7 raster rounding was a test capture artifact; product photos/design were not changed.
- Original-beta and experience Worker bundle dry runs pass. Only the experience preview is an authorized deployment target.
- Read-only baseline: **125 original beta workspaces** and **45 existing preview workspaces**, plus existing assets/member/comment rows. Original deployment/settings and preview bindings are fingerprinted for post-deployment comparison.
- Complete private preview data backup: **11 tables**, 1,417,941 bytes, mode `0600`, outside Git. Actual local SQLite restore succeeded, with all **45 workspace rows exactly matching** the source baseline. No remote restore was performed. Separate synthetic owner-export/import recovery also passes with photo/member/order/comment relationships and protected original data.

## Hosted verification

The exact preview-only hosted suite creates fresh synthetic private workspaces; it does not edit existing workspaces or place orders on the main storefront. It reads both actual HTTPS root and `/studio`, checks server-acknowledged saves, two-context owner/customer synchronization, photo upload, independent payment verification, tracking, calendar, comment moderation, reconnection and unauthorized access.

The cloud environment cannot directly reach this preview hostname. Hosted verification runs on GitHub Actions after the preview deployment using the opt-in `[verify-studio-preview]` commit marker. The PR description records the final hosted/CI run and deployment results; see its checks for the latest status and screenshot artifacts. No hosted success is claimed by this local-results file before that run completes.

## Remaining gates

This is a management **preview**, not a production-ready rollout. Descope has not been created; both real individual owner accounts, passkeys/remembered sessions/recovery and explicit approval are required before switching authentication. Existing 12-hour workspace sessions/device pairing stay in place. No access keys, accounts, workspaces or credentials were reset.

Physical-device installation/photo-library/Touch ID/VoiceOver/printing and real weak-network checks remain. External messaging is disabled; provider acceptance/failure tests are mocked and are not real deliveries. Preview storage limits remain (300 orders, 2,000 management operations, 60 products, 100 pickup slots, 500 listed members/comments, 30 retained content revisions, 8 MB in-app photo archive, ledger/history byte guards). Business-scale normalized storage, larger recovery and account relinking need a separately tested rollout.

No Register/Admin, Supabase, Square, custom domain or production integration is part of this change. Nothing is merged.
