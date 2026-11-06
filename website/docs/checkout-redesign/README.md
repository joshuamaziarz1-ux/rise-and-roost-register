# Checkout visual redesign

The checkout now places contact information and the existing pickup date cards in the left column. A balanced, slightly wider right column holds product quantities and prices, selected pickup, amount due, payment selection, the original pickup policy and the full-width order action. Mobile stacks these sections; provider cards become full-width below 360px. Inputs use 16px text, and keyboard focus and selection have visible indicators.

PayPal, Venmo and Cash App use accurate provider names in a restrained typographic treatment rather than imitation or unlicensed logo artwork. Unavailable methods are visibly disabled. Selecting a method preserves focus, the selected pickup and entered details. Existing backend method values and all payment links/QR generation remain unchanged. The order button shows its submitting state and remains protected by the existing submission guard and retry identifier.

The Roost dashboard, return credits and customer passkey login were already deployed. This branch starts at `feature/roost-customer-experience` commit `e35281c3f6174ab494398e1eeb2d6ca995e5b643`, including that work, instead of the legacy main branch. Return-credit controls, calculations, order payloads, policy text, pickup availability, inventory rules and validation are retained. No server, Studio, authentication, payment destination, schema or business-setting file changes are included.

## Visual evidence

These screenshots use disposable local production-style fixtures and the same synthetic product, provider settings and customer details. Before images serve the original deployed application/CSS; after images serve this branch. They demonstrate checkout states without creating real orders or payments.

| View | Original | Redesigned |
| --- | --- | --- |
| Desktop 1440px | [Before](before-desktop.png) | [After](after-desktop.png) |
| Mobile 390px | [Before](before-mobile.png) | [After](after-mobile.png) |

Additional browser evidence under ignored `website/qa-results/checkout/` captures every selected provider, unavailable methods, invalid email, selected pickup, disabled submission and ready submission across desktop Chromium, desktop WebKit, iPhone WebKit, Android Chromium and tablet Chromium. Tests additionally check widths 320, 375, 390, 768 and 1440px, keyboard selection/focus, and no horizontal overflow. The existing header and navigation are untouched.

## Verification

The relevant backend suite covers pricing, inventory, ordering guards, authentication, pickup deadlines, payment availability and credit integrity. Browser suites cover guest/member checkout, every provider, pickup changes, policy/name/email validation, duplicate submissions, order confirmation/tracking, paused ordering, return-credit redemption, customer remembered login/recovery/logout, Studio owner sessions, Help and navigation. All orders/accounts/payments are synthetic and local. Payment-provider apps and physical-device biometric prompts are not certified by browser emulation.

The exact downloaded production executable also passed the local workerd/D1 smoke for passkeys, remembered sessions/recovery/revocation, owner authorization, guest ordering, atomic inventory, payment verification, tracking, calendar rules, credit reservation/finalization/cancellation and credit-only orders. It retains SHA-256 `7207f528e8f931490e6c5da922a383fb4a543cd6a499840b9e148163ce44f4db`; all 15 deployed application server sources match the branch. The visual release uses that executable without rebundling.

Private release preparation reads the actual production bindings/runtime settings and fingerprints every original row across 13 application tables, the schema, Access applications/policies and public ordering settings. Pre-staging verification matches the original baseline. The repository and active production release are checked again before activation; a newer conflicting release blocks activation. No database or Access mutation, production order/payment, or ordering activation is part of this release.

Final local results: **328 automated cases passed**, with zero unresolved failures or skips, plus the exact-executable workerd/D1 smoke:

| Suite | Passed |
| --- | ---: |
| Backend/security/monetary integrity | 243 |
| Checkout/pickup/payment/accessibility, five profiles | 20 |
| Return credits/favorites/member checkout, five profiles | 10 |
| Production-style owner/payment/QR regressions | 10 |
| Guest/member/passkey/remembered-session browser matrix | 30 |
| Studio navigation/Help browser matrix | 15 |

The final checkout matrix was rerun after adding the submitting button's `aria-busy` attribute and passed all 20 cases. Initial verification used an outdated installed WebKit bundle and an older assertion for the pending button label; the matching browser was installed and the assertion now checks the visible submitting action. All final suites pass. Read-only live desktop/mobile basket and Roost rendering also passed without JavaScript errors; the order action stayed disabled with `checkoutEnabled=false` and `orderingPaused=true`.
