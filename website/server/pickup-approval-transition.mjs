import { calendarPickups } from "./pickup-calendar.mjs";
import { weekStart } from "./pickup-booking.mjs";
import { localInstant } from "../public/model.mjs";
// An operator invokes this exactly once against the inspected production row.
// Normal requests never call it and never approve rolling future weeks.
export function approvalTransition(document, ledger, now, actor) {
  if (ledger.pickupBooking)
    throw new Error("Approval transition already exists. Do not replace it.");
  const candidates = calendarPickups(document, now, ledger).filter(
    (p) =>
      !p.closed &&
      p.capacity > 0 &&
      localInstant(p.cutoffDate, p.cutoffTime) > now,
  );
  const weeks = [...new Set(candidates.map((p) => weekStart(p.date)))].slice(
    0,
    2,
  );
  if (!weeks.length)
    throw new Error(
      "No near-term eligible dates. Review live availability before proceeding.",
    );
  const at = new Date(now).toISOString();
  return {
    weeks: Object.fromEntries(
      weeks.map((week) => [
        week,
        {
          status: "approved",
          at,
          actor,
          source: "one-time-near-term-transition",
        },
      ]),
    ),
    dates: {},
    closedDates: {},
    transition: {
      at,
      actor,
      preservedDates: [
        ...new Set(
          candidates
            .filter((p) => weeks.includes(weekStart(p.date)))
            .map((p) => p.date),
        ),
      ],
      reason:
        "Preserve the next two eligible pickup weeks during initial deployment. Later weeks require explicit owner approval.",
    },
  };
}
