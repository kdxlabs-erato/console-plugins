// The records brought from one `dataVersion` to the next, once, by the console's `migrate` role,
// before the new code serves anything: the contract's lifecycle. Each upgrade writes what the new
// shape adds to every record that lacks it, and is safe to run again.
import type { PluginContext, UpgradeDefinition } from "@skillcdn/console/plugin";
import type { Announcement, Config, LeaveRequest, LeaveType } from "../shared/contracts.js";
import { announcements, config, requests, types } from "./collections.js";
import { waitingIn } from "./leave/approval.js";
import { cancelRuleOf } from "./leave/types.js";
import { listAll } from "./store.js";

/**
 * Whom a request's live decision was addressed to: as the console holds the decision, else whom
 * its step asks, which is what the pages read before the request kept it.
 */
async function askedOf(ctx: PluginContext, data: LeaveRequest): Promise<string[]> {
  const live =
    data.state === "requested"
      ? data.decisionId
      : data.state === "cancelling"
        ? data.cancelDecisionId
        : null;
  if (live === null) {
    return [];
  }
  try {
    const decision = await ctx.console.decisions.get(live);
    if (decision !== null) {
      const ids = decision.deciders?.map((person) => person.id) ?? [];
      return ids.length > 0 ? ids : [decision.decider.id];
    }
  } catch {
    // The step stands in for a decision the console does not answer.
  }
  if (data.state === "cancelling") {
    return [...(data.steps[0]?.deciderIds ?? [])];
  }
  const step = data.steps[data.step];
  return step === undefined ? [] : [...waitingIn(step)];
}

/**
 * Writes on every kind without a rule of cancelling the one the configuration held. Run before
 * anything writes the configuration again, since a write through the current schema drops it.
 */
async function keepCancelRules(ctx: PluginContext): Promise<void> {
  const stored = await listAll<Config>(ctx.records(config));
  const legacy = (stored[0]?.data as { cancellation?: unknown } | undefined)?.cancellation;
  for (const record of await listAll<LeaveType>(ctx.records(types))) {
    if ((record.data as Partial<LeaveType>).cancel === undefined) {
      await ctx.records(types).update(record.id, {
        cancel: cancelRuleOf(legacy, record.data.notice),
      });
    }
  }
}

export const upgrades: UpgradeDefinition[] = [
  {
    to: 2,
    about:
      "A request keeps whom its decision went to and the plugin it came through; an exception and an announcement may name teams.",
    async run(ctx) {
      // Run by a later version, this writes the configuration through a schema without its rule
      // of cancelling, so each kind takes the rule first, as the upgrade to 3 would.
      await keepCancelRules(ctx);
      for (const record of await listAll<Config>(ctx.records(config))) {
        if (record.data.rules.some((rule) => !Array.isArray(rule.teams))) {
          await ctx.records(config).update(record.id, {
            rules: record.data.rules.map((rule) => ({ ...rule, teams: rule.teams ?? [] })),
          });
        }
      }
      for (const record of await listAll<Announcement>(ctx.records(announcements))) {
        if (!Array.isArray(record.data.audience)) {
          await ctx.records(announcements).update(record.id, { audience: [] });
        }
      }
      const all = await listAll<LeaveRequest>(ctx.records(requests));
      for (const record of all) {
        const data = record.data as Partial<LeaveRequest> & LeaveRequest;
        if (Array.isArray(data.asked) && data.requestedVia !== undefined) {
          continue;
        }
        await ctx.records(requests).update(record.id, {
          asked: Array.isArray(data.asked) ? data.asked : await askedOf(ctx, data),
          requestedVia: data.requestedVia ?? null,
        });
      }
    },
  },
  {
    to: 3,
    about:
      "Each kind of leave keeps its own rule of cancelling, written from the configuration's one, which goes.",
    async run(ctx) {
      await keepCancelRules(ctx);
      // The configuration is written again without the field: the schema keeps none of it.
      for (const record of await listAll<Config>(ctx.records(config))) {
        if ("cancellation" in record.data) {
          await ctx.records(config).update(record.id, {});
        }
      }
    },
  },
];
