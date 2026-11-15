// The records brought from one `dataVersion` to the next, once, by the console's `migrate` role,
// before the new code serves anything: the contract's lifecycle. Each upgrade writes what the new
// shape adds to every record that lacks it, and is safe to run again; the hourly job runs the last
// one again where it finds records of the shape before, so that a console that did not run it
// still brings them on.
import type { PluginContext, PluginRecord, UpgradeDefinition } from "@skillcdn/console/plugin";
import { apps, connections, routes, slackId, threads } from "./collections.js";

/** The secret the bot's token is kept in, by workspace from data version 3. */
const BOT_TOKEN = "slackBotToken";

/** The one connection of data version 2: the app and the one workspace it was installed in. */
interface ConnectionV2 {
  readonly phase: "app" | "connected" | "disconnected";
  readonly appId: string | null;
  readonly clientId: string | null;
  readonly teamId: string | null;
  readonly teamName: string | null;
  readonly botUserId: string | null;
  readonly language: "en" | "ko";
  readonly appName?: string | null;
  readonly botName?: string | null;
  readonly botHandle?: string | null;
  readonly iconUrl?: string | null;
  readonly iconSetUrl?: string | null;
  readonly iconProblem?: string | null;
  readonly shortcut: boolean;
  readonly manifestDigest: string | null;
  readonly manifestAt: string | null;
  readonly connectedAt: string | null;
  readonly connectedBy: string | null;
  readonly problem: string | null;
  readonly problemAt: string | null;
  readonly matchedAt: string | null;
  readonly matched: number;
  readonly unmatched: number;
  readonly rotatedAt: string | null;
}

function isV2(data: unknown): data is ConnectionV2 {
  return typeof data === "object" && data !== null && "phase" in data;
}

/** Every live record of a collection, a page at a time, bounded. */
async function everyRecord(
  ctx: PluginContext,
  name: string,
): Promise<PluginRecord<Record<string, unknown>>[]> {
  const found: PluginRecord<Record<string, unknown>>[] = [];
  let after: string | undefined;
  for (let page = 0; page < 200; page += 1) {
    const read = await ctx.records(name).list({
      limit: 200,
      ...(after === undefined ? {} : { after }),
    });
    found.push(...(read.items as PluginRecord<Record<string, unknown>>[]));
    after = read.after ?? undefined;
    if (after === undefined) {
      break;
    }
  }
  return found;
}

/**
 * Data version 3 (ADR-0014): the one connection becomes the app and the workspace it is installed
 * in, the default for every project; the routes and the threads name that workspace, a thread's
 * direct messages and channel posts too; the bot's token, kept from before it was keyed, is moved
 * under the workspace's id where the secrets can be reached, else by the hourly job. The connection
 * of before is archived last, so that one found means the upgrade is still to finish.
 */
export async function toVersion3(ctx: PluginContext): Promise<void> {
  const before = (await ctx.records(connections).list({ limit: 50 })).items.filter((record) =>
    isV2(record.data),
  );
  const old = before[0];
  if (old === undefined) {
    return;
  }
  const data = old.data as unknown as ConnectionV2;
  const teamId =
    data.phase === "connected" && data.teamId !== null && slackId.safeParse(data.teamId).success
      ? data.teamId
      : null;
  for (const record of await everyRecord(ctx, routes.name)) {
    if (record.data.teamId !== undefined) {
      continue;
    }
    if (teamId === null) {
      await ctx.records(routes.name).archive(record.id);
    } else {
      await ctx.records(routes.name).update(record.id, { teamId });
    }
  }
  for (const record of await everyRecord(ctx, threads.name)) {
    if (record.data.teamId !== undefined) {
      continue;
    }
    const steps = (record.data.steps as Record<string, unknown>[] | undefined) ?? [];
    const posts = (record.data.posts as Record<string, unknown>[] | undefined) ?? [];
    if (teamId === null) {
      await ctx.records(threads.name).archive(record.id);
      continue;
    }
    await ctx.records(threads.name).update(record.id, {
      teamId: record.data.channelId === null ? null : teamId,
      steps: steps.map((step) => ({
        ...step,
        dms: ((step.dms as Record<string, unknown>[] | undefined) ?? []).map((dm) => ({
          teamId,
          ...dm,
        })),
      })),
      posts: posts.map((post) => ({ teamId, ...post })),
    });
  }
  const app = (await ctx.records(apps).list({ where: { provider: "slack" }, limit: 1 })).items[0];
  if (app === undefined) {
    await ctx.records(apps).create({
      provider: "slack",
      appId: data.appId,
      clientId: data.clientId,
      language: data.language,
      appName: data.appName ?? null,
      botName: data.botName ?? null,
      iconUrl: data.iconUrl ?? null,
      iconSetUrl: data.iconSetUrl ?? null,
      iconProblem: data.iconProblem ?? null,
      shortcut: data.shortcut,
      manifestDigest: data.manifestDigest,
      manifestAt: data.manifestAt,
      installs: [],
      problem: data.problem,
      problemAt: data.problemAt,
      rotatedAt: data.rotatedAt,
    });
  }
  if (teamId !== null) {
    // The connection of before has the same workspace: the one of data version 3 is told apart.
    const kept = (await ctx.records(connections).list({ where: { teamId }, limit: 5 })).items.find(
      (record) => !isV2(record.data),
    );
    if (kept === undefined) {
      await ctx.records(connections).create({
        provider: "slack",
        teamId,
        teamName: data.teamName,
        botUserId: data.botUserId,
        botHandle: data.botHandle ?? null,
        state: "connected",
        default: true,
        projects: [],
        connectedAt: data.connectedAt,
        connectedBy: data.connectedBy,
        installedBy: null,
        problem: null,
        problemAt: null,
        matchedAt: data.matchedAt,
        matched: data.matched,
        unmatched: data.unmatched,
      });
    }
    // An upgrade reaches the secrets only where the deployment gives its role the sign-in
    // configuration; elsewhere the hourly job moves the token, and calls wait for it till then.
    if (!(await ctx.secrets.has(BOT_TOKEN, teamId).catch(() => false))) {
      await ctx.secrets.move(BOT_TOKEN, teamId).catch(() => false);
    }
  }
  for (const record of before) {
    await ctx.records(connections).archive(record.id);
  }
}

export const upgrades: UpgradeDefinition[] = [
  {
    to: 2,
    about:
      "The connection keeps the names chosen for the app and its bot, the bot's handle and the icon: none yet.",
    // Written into data version 3 by the next step, which reads a connection without them as
    // having none: the shape of version 2 no longer fits the collection to be written as such.
    async run() {},
  },
  {
    to: 3,
    about:
      "The connection becomes the app and the workspace it is installed in, the default; the routes and the threads name that workspace, and the bot's token is kept under its id.",
    run: toVersion3,
  },
];
