# Using the Phase 1 controls — 5.2.0-rc.3

These instructions describe the release candidate. It has not been deployed. Use synthetic preview records for acceptance testing and do not send payments during testing.

## Comments & Requests

1. Sign in to Admin and open **Comments & Requests**, after the existing tabs.
2. Use **Show** to view all, new, reviewed or resolved submissions.
3. Choose **Mark Reviewed**, **Resolve** or **Reopen**. Wait for the shared-store save confirmation.

Other Admin devices receive the updated status automatically. Original submissions and their saved review timestamps remain available. If another device changed the same record, review its latest version before repeating your change.

## Spending Roost credits

1. The customer signs into their own Roost account and adds products as usual.
2. At checkout, select **Use my Roost credits**. The chooser shows the available balance, credit value, discount and remaining payment.
3. For a partial discount, select the existing cash or QR-wallet method and confirm only the remaining amount.
4. If credits cover the purchase, choose **Continue with Roost Credits**, then **Confirm Purchase with Roost Credits**.

The shared store confirms the sale, stock and credit changes together. Purchase history shows the credits spent, and Admin sales identify a fully credit-paid sale as **Roost Credits**. A changed balance, value, price or member session requires reviewing payment again. An unconfirmed purchase must be retried using its existing recovery control; do not pay again.

Unconfirmed profile saves and returns retain their original requests too. Repeating Save confirms the previous profile change; after reload, **Confirm Previous Returns** confirms an interrupted return. Sign into the original member account to recover its pending operation.

## Pickup appointments

### Prepare availability

Open Admin → **Pickup Orders** → **Pickup Availability**. Enable member requests, confirm the store time zone, enter the appointment length (15–240 minutes) and choose the enabled days and comma-separated 24-hour times. Save and wait for **Saved**.

The configured length reserves the full appointment window. Members receive future configured times for the next 45 days. When no schedule exists, member time requests remain disabled until you configure it.

### Link and schedule an order

For a new pickup, use the optional **Roost member** field in the existing Create Pickup Order form. The member's name and phone fill the contact fields. Add products and submit the order; wait for cloud confirmation.

For an existing pickup, choose **Schedule Pickup** or **Schedule / Approve**. Use **Linked Roost member** to associate the correct account. Existing order contact details stay saved. The same dialog sets or clears a time, approves or declines it, and saves a note visible to that member.

### Review a member request

In **My Roost → Pickup Orders**, the member selects **Choose Pickup Time** or **Change Pickup Time**, selects an offered time and chooses **Request Time**. The request appears as pending on their other Registers and in Admin.

In Admin, open **Schedule / Approve**, review the time, choose **Approved** or **Declined**, and save. Pending or declined appointments cannot be completed. Declining a time retains the order and its inventory reservation; the existing **Cancel** control releases the order reservation.

If a request loses its confirmation, **Retry Previous Request** confirms the original request, including after reloading. **Reload Times** obtains fresh options when a time becomes unavailable. Competing bookings and stale editors receive a conflict instead of overwriting another device's update.

Scheduling preserves saved access-code fields. This release adds no PIN delivery, door-unlock integration, customer notification service or payment processor.

## Acceptance still required

Review [the release report](PHASE-1-RELEASE.md), [QA evidence](PHASE-1-QA.md) and actual-control screenshots before approving an isolated candidate preview. Real iPhone/Android/tablet behavior and approved-admin magic-link delivery remain unverified. Supabase access and the fresh read-only production audit were completed on October 23; all 18 table fingerprints remained unchanged. Production cutover requires separate explicit approval.
