// What became of each event the messenger had someone to send to: sent on, passed over and why, or
// failed with what Slack or the console said, kept a month, newest first. It is read by whoever keeps
// the messenger, of every project it is on, those they may not see among them: so a line says when, of
// which kind, how it went and why, and never which project, what it was about or whom it was for
// (ADR-0019). An event that was for nobody is not listed, since all it tells is what happens on a board.
import { arg, defineQuery } from "@skillcdn/console/plugin";
import type { ActivityRow } from "../shared/contracts.js";
import { ROLE, requireRole } from "./access.js";
import { type DeliveryData, deliveries } from "./collections.js";

/** The lines read at a time, and how often at most while those not listed are passed over. */
const PAGE = 200;
const PAGES_AT_MOST = 10;

/** Whether a line is listed: one of the console's events that was for nobody is not. */
function listed(data: DeliveryData): boolean {
  return !(data.kind.startsWith("console:") && data.note === "nobody");
}

export const activity = defineQuery({
  about: "What the messenger told lately, and what it passed over or failed to tell.",
  args: {
    outcome: arg.enum(["sent", "skipped", "failed"], {
      about: "only the events that ended so; all unless said",
      optional: true,
    }),
    limit: arg.number({
      about: "how many lines; twenty unless said",
      optional: true,
      integer: true,
      min: 1,
      max: 200,
    }),
  },
  roles: [ROLE],
  async run(ctx, args): Promise<ActivityRow[]> {
    requireRole(ctx);
    const limit = args.limit ?? 20;
    const rows: ActivityRow[] = [];
    let after: string | undefined;
    for (let pages = 0; pages < PAGES_AT_MOST && rows.length < limit; pages += 1) {
      const page = await ctx.records(deliveries).list({
        ...(args.outcome === undefined ? {} : { where: { outcome: args.outcome } }),
        order: { field: "at", descending: true },
        limit: PAGE,
        ...(after === undefined ? {} : { after }),
      });
      for (const { id, data } of page.items) {
        if (listed(data)) {
          rows.push({
            id,
            at: data.at,
            kind: data.kind,
            outcome: data.outcome,
            note: data.note,
            attempt: data.attempt,
          });
        }
      }
      if (page.after === null) {
        break;
      }
      after = page.after;
    }
    return rows.slice(0, limit);
  },
});
