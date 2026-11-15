// What a person is told of their own work, as they choose (ADR-0015): the console's events of the
// projects the messenger is placed on, a task given to them, one they own moved, one of theirs
// changed, commented or put away, a decision waiting on them, and to a manager their agent
// accounts stopping or running again; each told to the person it is about, never whoever made the
// change, in their language, with who changed it and where it is on the console. In a direct
// message, in the workspace the project is told in where they have an account there, else the
// default, else another they have one in (ADR-0014); at once, or in one message a day at a time
// of the workspace's zone. Chosen on a page of the messenger's and through their agent, with the
// command `notify` and the query `notices`; each message has a button that turns its kind off.
import {
  arg,
  defineCommand,
  defineQuery,
  type HookHandler,
  type JobDefinition,
  type PluginContext,
  PluginError,
  type PluginHookEvent,
  type PluginRecord,
} from "@skillcdn/console/plugin";
import {
  CADENCES,
  type Language,
  languageOf,
  NOTICE_DEFAULTS,
  NOTICE_KINDS,
  type NoticeKind,
  type NoticesView,
  type ProjectNoticesView,
} from "../shared/contracts.js";
import { MEMBER, ROLE } from "./access.js";
import { type PreferenceData, preferences, type WaitingData, waiting } from "./collections.js";
import { HR } from "./integrations/hr/contract.js";
import { languageOfPerson } from "./people.js";
import { bot, SlackError, slack, textOf } from "./slack/api.js";
import {
  type Block,
  clean,
  context,
  fallback,
  link,
  plain,
  safe,
  section,
} from "./slack/blocks.js";
import {
  type ConnectionRecord,
  connectionsOf,
  defaultOf,
  deliver,
  deliveryOf,
  type LinkRecord,
  linksOfPerson,
} from "./store.js";
import { serverWords } from "./words.js";

/** The press of a message's button that turns its kind off. */
export const NOTICE_OFF = "notice-off";

/** The lines of a day's message, at most; the rest said as a count. */
const DAY_LINES_AT_MOST = 30;
/** What a comment's excerpt or a decision's question is held to in a line. */
const EXCERPT_AT_MOST = 200;

type PreferenceRecord = PluginRecord<PreferenceData>;

/** What someone who never chose stands on. */
export function defaultPreference(personId: string): PreferenceData {
  return {
    personId,
    kinds: { ...NOTICE_DEFAULTS },
    mutedProjects: [],
    cadence: "now",
    at: "09:00",
    ownAgents: false,
    sentOn: null,
  };
}

async function preferenceOf(
  ctx: PluginContext,
  personId: string,
): Promise<PreferenceRecord | null> {
  const page = await ctx.records(preferences).list({ where: { personId }, limit: 1 });
  return page.items[0] ?? null;
}

/** What a person chose, or the defaults. */
async function choiceOf(ctx: PluginContext, personId: string): Promise<PreferenceData> {
  return (await preferenceOf(ctx, personId))?.data ?? defaultPreference(personId);
}

/** Writes what a person chose, making their record where there is none. */
async function saveChoice(
  ctx: PluginContext,
  personId: string,
  patch: Partial<PreferenceData>,
): Promise<PreferenceData> {
  const found = await preferenceOf(ctx, personId);
  if (found === null) {
    return (
      await ctx
        .records(preferences)
        .create({ ...defaultPreference(personId), ...patch }, { owner: personId })
    ).data;
  }
  return (await ctx.records(preferences).update(found.id, patch)).data;
}

/** The day and the time of day of a moment in a time zone, as `YYYY-MM-DD` and `HH:MM`. */
export function clockIn(
  now: Date,
  timeZone: string,
): { readonly day: string; readonly time: string } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
  } catch {
    return clockIn(now, "UTC");
  }
  const part = (type: string) => parts.find((found) => found.type === type)?.value ?? "00";
  return {
    day: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
  };
}

/** The person a command or a query is about: the caller, as themselves or through their agent. */
function ownPerson(ctx: PluginContext): string {
  if (ctx.caller.kind === "person") {
    return ctx.caller.person.id;
  }
  throw new PluginError("no_person", serverWords(ctx.language).refused.noPerson);
}

/** Refuses a caller who holds neither role; the console refuses first, this is the second line. */
function requireMember(ctx: PluginContext): void {
  if (ctx.caller.kind === "console") {
    throw new PluginError("no_person", serverWords(ctx.language).refused.noPerson);
  }
  if (
    ctx.caller.kind === "person" &&
    ctx.caller.roles.some((role) => role === MEMBER || role === ROLE)
  ) {
    return;
  }
  if (ctx.caller.kind === "plugin" && ctx.caller.roles.includes(MEMBER)) {
    return;
  }
  throw new PluginError("forbidden", serverWords(ctx.language).refused.noRole);
}

/** The workspaces a person has an account in, by id. */
async function accountsOf(ctx: PluginContext, personId: string): Promise<Map<string, LinkRecord>> {
  return new Map((await linksOfPerson(ctx, personId)).map((link) => [link.data.teamId, link]));
}

/**
 * Where a person is told of something in a project: the project's workspace where they have an
 * account there, else the default, else another they have one in; none where they have none.
 */
function whereTold(
  connected: readonly ConnectionRecord[],
  accounts: ReadonlyMap<string, LinkRecord>,
  projectId: string | null,
): LinkRecord | null {
  const named =
    projectId === null
      ? undefined
      : connected.find((connection) => connection.data.projects.includes(projectId));
  const order = [named, defaultOf(connected), ...connected].filter(
    (connection): connection is ConnectionRecord => connection !== undefined && connection !== null,
  );
  for (const connection of order) {
    const account = accounts.get(connection.data.teamId);
    if (account !== undefined) {
      return account;
    }
  }
  return null;
}

/** The workspace a project is told in: the one it is named for, else the default. */
export function projectTeam(
  connected: readonly ConnectionRecord[],
  projectId: string,
): ConnectionRecord | null {
  return (
    connected.find((connection) => connection.data.projects.includes(projectId)) ??
    defaultOf(connected)
  );
}

function viewOf(
  data: PreferenceData,
  chosen: boolean,
  extra: Pick<NoticesView, "accounts" | "mutedProjects" | "timeZone" | "waiting">,
): NoticesView {
  return {
    kinds: { ...NOTICE_DEFAULTS, ...data.kinds },
    cadence: data.cadence,
    at: data.at,
    ownAgents: data.ownAgents,
    chosen,
    ...extra,
  };
}

/** What a person's choice comes to, as the page and their agent read it. */
async function noticesView(ctx: PluginContext, personId: string): Promise<NoticesView> {
  const found = await preferenceOf(ctx, personId);
  const data = found?.data ?? defaultPreference(personId);
  const workspace = await ctx.console.workspace();
  const names = new Map(
    (await ctx.console.projects.list().catch(() => [])).map((project) => [
      project.id,
      { key: project.key, name: project.name },
    ]),
  );
  const connected = await connectionsOf(ctx);
  const accounts = await accountsOf(ctx, personId);
  const waitingCount = await ctx.records(waiting).aggregate({ where: { personId }, count: true });
  return viewOf(data, found !== null, {
    mutedProjects: data.mutedProjects.map((id) => ({
      id,
      key: names.get(id)?.key ?? null,
      name: names.get(id)?.name ?? null,
    })),
    timeZone: workspace.timeZone,
    accounts: connected
      .filter((connection) => accounts.has(connection.data.teamId))
      .map((connection) => ({
        teamId: connection.data.teamId,
        teamName: connection.data.teamName,
      })),
    waiting: waitingCount[0]?.count ?? 0,
  });
}

const kindList = (about: string) =>
  arg.list(arg.enum(NOTICE_KINDS), { about, optional: true, max: NOTICE_KINDS.length });

export const notify = defineCommand({
  about: "Chooses what you are told in Slack of your own work, and when.",
  args: {
    on: kindList(
      "kinds to be told of: assigned, moved, changed, commented, archived, decisions, agents",
    ),
    off: kindList("kinds to be told nothing of"),
    mute: arg.list(arg.project(), {
      about: "projects to be told nothing of",
      optional: true,
      max: 50,
    }),
    unmute: arg.list(arg.project(), {
      about: "projects to be told of again",
      optional: true,
      max: 50,
    }),
    cadence: arg.enum(CADENCES, {
      about: "now, each as it happens, or daily, in one message a day",
      optional: true,
    }),
    at: arg.text({
      about: "the time of the day's message, HH:MM in the workspace's time zone",
      optional: true,
      max: 5,
    }),
    "own-agents": arg.boolean({
      about: "whether what your own agents did for you is told to you too",
      optional: true,
    }),
    reset: arg.boolean({ about: "go back to the defaults", optional: true }),
  },
  roles: [MEMBER],
  async run(ctx, args) {
    requireMember(ctx);
    const words = serverWords(ctx.language);
    const personId = ownPerson(ctx);
    if (args.at !== undefined && !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(args.at)) {
      throw new PluginError("at", words.refused.noticeAt);
    }
    const on = new Set(args.on ?? []);
    const off = new Set(args.off ?? []);
    const both = [...on].filter((kind) => off.has(kind));
    if (both.length > 0) {
      throw new PluginError("both", words.refused.noticeBoth(both.join(", ")));
    }
    const before =
      args.reset === true ? defaultPreference(personId) : await choiceOf(ctx, personId);
    const muted = new Set(before.mutedProjects);
    for (const project of args.mute ?? []) {
      muted.add(project.id);
    }
    for (const project of args.unmute ?? []) {
      muted.delete(project.id);
    }
    const kinds = { ...NOTICE_DEFAULTS, ...before.kinds };
    for (const kind of on) {
      kinds[kind] = true;
    }
    for (const kind of off) {
      kinds[kind] = false;
    }
    const cadence = args.cadence ?? before.cadence;
    const at = args.at ?? before.at;
    // A day's message chosen anew counts from the day due now, so that choosing it sends nothing
    // at once; a time changed later keeps the day sent last, so that no day has two.
    const starts = cadence === "daily" && before.cadence !== "daily";
    const sentOn = starts
      ? dueDay(ctx.now(), (await ctx.console.workspace()).timeZone, at)
      : args.reset === true
        ? null
        : undefined;
    const saved = await saveChoice(ctx, personId, {
      kinds,
      mutedProjects: [...muted].slice(0, 200),
      cadence,
      at,
      ownAgents: args["own-agents"] ?? before.ownAgents,
      ...(sentOn === undefined ? {} : { sentOn }),
    });
    const told = NOTICE_KINDS.filter((kind) => saved.kinds[kind]);
    return {
      text: words.said.notices(
        told.map((kind) => words.notice.kinds[kind]).join(", ") || words.notice.nothing,
        saved.cadence === "daily" ? words.notice.daily(saved.at) : words.notice.now,
      ),
      data: await noticesView(ctx, personId),
    };
  },
});

export const notices = defineQuery({
  about: "What you are told in Slack of your own work, and when, as you chose it.",
  roles: [MEMBER],
  async run(ctx): Promise<NoticesView> {
    requireMember(ctx);
    return noticesView(ctx, ownPerson(ctx));
  },
});

export const projectNotices = defineQuery({
  about: "The Slack workspace a project is told in, and whether you are told of it.",
  // `project` is a flag the command keeps for itself.
  args: { key: arg.project({ about: "the project, by key", positional: true }) },
  roles: [MEMBER],
  async run(ctx, args): Promise<ProjectNoticesView> {
    requireMember(ctx);
    const personId = ownPerson(ctx);
    const connected = await connectionsOf(ctx);
    const team = projectTeam(connected, args.key.id);
    const choice = await choiceOf(ctx, personId);
    return {
      project: { id: args.key.id, key: args.key.key, name: args.key.name },
      workspace:
        team === null
          ? null
          : {
              teamId: team.data.teamId,
              teamName: team.data.teamName,
              default: !team.data.projects.includes(args.key.id),
            },
      workspaces: connected.map((connection) => ({
        teamId: connection.data.teamId,
        teamName: connection.data.teamName,
      })),
      muted: choice.mutedProjects.includes(args.key.id),
      keeper: ctx.caller.kind === "person" && ctx.caller.roles.includes(ROLE),
    };
  },
});

/** A person the console's events name. */
interface Who {
  readonly id: string;
  readonly login?: string | undefined;
  readonly name?: string | null | undefined;
}

function nameOf(person: Who | null | undefined, language: Language): string {
  if (person === null || person === undefined) {
    return serverWords(language).thread.someone;
  }
  const name = person.name?.trim();
  return clean(name !== undefined && name.length > 0 ? name : (person.login ?? person.id), 200);
}

/** One thing to tell one person: the kind it is, and its words in their language. */
interface Notice {
  readonly personId: string;
  readonly kind: NoticeKind;
  readonly projectId: string | null;
  /** The line, in the person's language, and where it leads on the console. */
  readonly say: (language: Language) => { readonly text: string; readonly url: string | null };
}

/** The console's word for a task: its project's key and number, and its title. */
function taskRef(projectKey: string, number: number, title: string): string {
  return `${projectKey}-${number} ${clean(title, 200)}`;
}

/** What the console's task and decision events come to, to whom. */
async function noticesOfBoard(
  ctx: PluginContext,
  event: PluginHookEvent,
  origin: string | null,
): Promise<Notice[]> {
  const project = event.project;
  if (project === null) {
    return [];
  }
  const data = (event.data ?? {}) as Record<string, unknown>;
  const kind = event.kind.slice("console:".length);
  const actor = (data.actor ?? null) as Who | null;
  const projectId = project.id;
  if (kind.startsWith("task.")) {
    const number = typeof data.number === "number" ? data.number : null;
    if (number === null) {
      return [];
    }
    const task = await ctx.console.tasks.get(project.key, number);
    if (task === null) {
      return [];
    }
    const ref = taskRef(project.key, task.number, task.title);
    const url = origin === null ? null : `${origin}/projects/${project.key}/tasks/${task.number}`;
    const owner = task.owner.id;
    const workers = task.workers.map((worker) => worker.id);
    const everyone = [...new Set([owner, ...workers])];
    const make = (
      personId: string,
      noticeKind: NoticeKind,
      line: (language: Language) => string,
    ): Notice => ({
      personId,
      kind: noticeKind,
      projectId,
      say: (language) => ({ text: line(language), url }),
    });
    const words = (language: Language) => serverWords(language).notice;
    switch (kind) {
      case "task.created":
        return everyone.map((personId) =>
          make(personId, "assigned", (language) =>
            words(language).assigned(nameOf(actor, language), ref),
          ),
        );
      case "task.updated": {
        const added = Array.isArray(data.workersAdded)
          ? (data.workersAdded as unknown[]).filter((id): id is string => typeof id === "string")
          : [];
        const fields = Array.isArray(data.fields)
          ? (data.fields as unknown[]).filter((field): field is string => typeof field === "string")
          : [];
        const what = fields.filter((field) => CHANGED.includes(field));
        return [
          ...added.map((personId) =>
            make(personId, "assigned", (language) =>
              words(language).assigned(nameOf(actor, language), ref),
            ),
          ),
          ...(what.length === 0
            ? []
            : everyone
                .filter((personId) => !added.includes(personId))
                .map((personId) =>
                  make(personId, "changed", (language) =>
                    words(language).changed(
                      nameOf(actor, language),
                      ref,
                      what.map((field) => words(language).fields[field] ?? field).join(", "),
                    ),
                  ),
                )),
        ];
      }
      case "task.moved": {
        const to = typeof data.to === "string" ? data.to : task.state;
        return [
          make(owner, "moved", (language) =>
            words(language).moved(nameOf(actor, language), ref, words(language).states[to] ?? to),
          ),
        ];
      }
      case "task.commented": {
        const excerpt =
          typeof data.excerpt === "string" ? clean(data.excerpt, EXCERPT_AT_MOST) : "";
        return everyone.map((personId) =>
          make(personId, "commented", (language) =>
            words(language).commented(nameOf(actor, language), ref, excerpt),
          ),
        );
      }
      case "task.archived":
        return everyone.map((personId) =>
          make(personId, "archived", (language) =>
            words(language).archived(nameOf(actor, language), ref),
          ),
        );
      default:
        return [];
    }
  }
  // HR's decisions are asked in their request's thread, with the buttons that answer them.
  if ((kind === "decision.raised" || kind === "decision.addressed") && event.plugin !== HR) {
    const decisionId = typeof data.decisionId === "string" ? data.decisionId : null;
    if (decisionId === null) {
      return [];
    }
    const question = typeof data.question === "string" ? clean(data.question, EXCERPT_AT_MOST) : "";
    let whom: string[];
    if (kind === "decision.addressed") {
      whom = Array.isArray(data.decidersAdded)
        ? (data.decidersAdded as unknown[]).filter((id): id is string => typeof id === "string")
        : [];
    } else {
      const decision = await ctx.console.decisions.get(decisionId);
      whom =
        decision === null
          ? []
          : (decision.deciders ?? [decision.decider]).map((person) => person.id);
    }
    // The decision reaches each of them: its own address is theirs to read.
    const url = origin === null ? null : `${origin}/decisions/${decisionId}`;
    return [...new Set(whom)].map((personId) => ({
      personId,
      kind: "decisions",
      projectId,
      say: (language) => ({
        text: serverWords(language).notice.decision(nameOf(actor, language), question),
        url,
      }),
    }));
  }
  return [];
}

/** The fields of a task whose change is told: its days, its title, its body. */
const CHANGED = ["title", "body", "startsOn", "dueOn"];

/** An agent account's states its manager is told of: stopping, refused, failing, and running again. */
const AGENT_TOLD = new Set(["stopped", "refused", "failed"]);

/** What an agent account standing otherwise comes to: a line to whoever it reports to. */
async function noticesOfAgent(ctx: PluginContext, event: PluginHookEvent): Promise<Notice[]> {
  const data = (event.data ?? {}) as Record<string, unknown>;
  const state = typeof data.state === "string" ? data.state : null;
  const was = typeof data.was === "string" ? data.was : null;
  const login = typeof data.login === "string" ? data.login : null;
  const told =
    (state !== null && AGENT_TOLD.has(state)) ||
    (state === "running" && was !== null && AGENT_TOLD.has(was));
  if (!told || login === null || state === null) {
    return [];
  }
  const account = (await ctx.console.people.list({ q: login })).find(
    (person) => person.login.toLowerCase() === login.toLowerCase(),
  );
  const managerId = account?.managerId ?? null;
  if (account === undefined || managerId === null) {
    return [];
  }
  const handle = typeof data.handle === "string" ? data.handle : null;
  const detail = typeof data.detail === "string" ? clean(data.detail, EXCERPT_AT_MOST) : "";
  return [
    {
      personId: managerId,
      kind: "agents",
      projectId: null,
      say: (language) => ({
        text: serverWords(language).notice.agent(
          clean(handle ?? account.name ?? account.login, 200),
          serverWords(language).notice.agentStates[state] ?? state,
          detail,
        ),
        url: null,
      }),
    },
  ];
}

/** The message of one notice: its line, where it leads, and the buttons that turn its kind off and choose. */
function noticeBlocks(
  language: Language,
  kind: NoticeKind,
  line: { readonly text: string; readonly url: string | null },
  origin: string | null,
): Block[] {
  const words = serverWords(language).notice;
  const blocks: Block[] = [section(safe(line.text))];
  const notes: string[] = [];
  if (line.url !== null) {
    notes.push(link(line.url, words.open));
  }
  if (origin !== null) {
    notes.push(link(`${origin}/plugins/messenger/notifications`, words.choose));
  }
  if (notes.length > 0) {
    blocks.push(context(...notes));
  }
  blocks.push({
    type: "actions",
    block_id: "notice",
    elements: [
      {
        type: "button",
        action_id: NOTICE_OFF,
        text: plain(words.turnOff(words.kinds[kind]), 75),
        value: kind,
      },
    ],
  });
  return blocks;
}

/** A direct message to an account, in its workspace. */
async function directly(
  ctx: PluginContext,
  account: LinkRecord,
  text: string,
  blocks: readonly Block[],
): Promise<void> {
  const teamId = account.data.teamId;
  const opened = await slack(
    ctx,
    "conversations.open",
    { users: account.data.memberId },
    bot(teamId),
  );
  const channel = textOf(opened, "channel.id");
  if (channel === null) {
    throw new SlackError("channel_not_found", "conversations.open");
  }
  await slack(
    ctx,
    "chat.postMessage",
    { channel, text, blocks, unfurl_links: false, unfurl_media: false },
    bot(teamId),
  );
}

/**
 * Tells each notice to its person as they chose: passed over for whoever made the change (unless
 * their own agents count for them and an agent made it), a kind or a project turned off, or no
 * account in a workspace the app is in; at once, or kept for the day's message. Each one told is
 * put in \`told\`, as \`<person>:<kind>\`, and one found there already, by an earlier try of the same
 * delivery, is passed over, so that a retry tells nobody twice.
 */
async function tellAll(
  ctx: PluginContext,
  event: PluginHookEvent,
  found: readonly Notice[],
  connected: readonly ConnectionRecord[],
  origin: string | null,
  fallbackLanguage: Language,
  told: string[],
): Promise<void> {
  const data = (event.data ?? {}) as Record<string, unknown>;
  const actorId =
    typeof (data.actor as Who | null)?.id === "string" ? (data.actor as Who).id : null;
  const byAgent = typeof data.agent === "string" && data.agent.length > 0;
  const seen = new Set<string>(told);
  for (const notice of found) {
    const once = `${notice.personId}:${notice.kind}`;
    if (seen.has(once)) {
      continue;
    }
    seen.add(once);
    const choice = await choiceOf(ctx, notice.personId);
    if (notice.personId === actorId && !(byAgent && choice.ownAgents)) {
      continue;
    }
    if (!(choice.kinds[notice.kind] ?? NOTICE_DEFAULTS[notice.kind])) {
      continue;
    }
    if (notice.projectId !== null && choice.mutedProjects.includes(notice.projectId)) {
      continue;
    }
    const account = whereTold(connected, await accountsOf(ctx, notice.personId), notice.projectId);
    if (account === null) {
      continue;
    }
    const language = await languageOfPerson(ctx, notice.personId, fallbackLanguage);
    const line = notice.say(language);
    if (choice.cadence === "daily") {
      await ctx.records(waiting).create(
        {
          personId: notice.personId,
          kind: notice.kind,
          text: [...line.text].slice(0, 600).join(""),
          url: line.url,
          at: ctx.now().toISOString(),
        },
        { owner: notice.personId },
      );
    } else {
      await directly(
        ctx,
        account,
        fallback(line.text),
        noticeBlocks(language, notice.kind, line, origin),
      );
    }
    told.push(once);
  }
}

/** What a delivery line says of a failure: Slack's refusal, Slack asking to wait, or the console's. */
function describe(error: unknown): string {
  if (error instanceof SlackError) {
    return `slack:${error.code}`;
  }
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "rate_limited") {
    return "rate_limited";
  }
  return typeof code === "string" ? `console:${code.slice(0, 80)}` : "failed";
}

/** Hears one of the console's events and tells whoever it is about, once. */
export async function onOwnWork(ctx: PluginContext, event: PluginHookEvent): Promise<void> {
  const before = await deliveryOf(ctx, event.id);
  if (before !== null && before.data.outcome !== "failed") {
    return;
  }
  // Whom an earlier try told already, kept on its failed line.
  const told: string[] = [...(before?.data.told ?? [])];
  const data = (event.data ?? {}) as Record<string, unknown>;
  const thing =
    typeof data.taskId === "string"
      ? data.taskId.slice(0, 64)
      : typeof data.decisionId === "string"
        ? data.decisionId.slice(0, 64)
        : null;
  const connected = await connectionsOf(ctx);
  if (connected.length === 0) {
    await deliver(ctx, event, "skipped", "not_connected", thing);
    return;
  }
  try {
    const workspace = await ctx.console.workspace();
    const found =
      event.kind === "console:agent.state_changed"
        ? await noticesOfAgent(ctx, event)
        : await noticesOfBoard(ctx, event, workspace.url);
    if (found.length === 0) {
      await deliver(ctx, event, "skipped", "nobody", thing);
      return;
    }
    const fallbackLanguage = workspace.languageSet
      ? languageOf(workspace.language)
      : (((await ctx.records("apps").list({ limit: 1 })).items[0]?.data.language as
          | Language
          | undefined) ?? "en");
    await tellAll(ctx, event, found, connected, workspace.url, fallbackLanguage, told);
    await deliver(
      ctx,
      event,
      told.length === 0 ? "skipped" : "sent",
      told.length === 0 ? "nobody" : `told:${told.length}`,
      thing,
      told,
    );
  } catch (error) {
    await deliver(ctx, event, "failed", describe(error), thing, told);
    throw error;
  }
}

/** The console's events a person may be told of. */
export const OWN_WORK_EVENTS = [
  "task.created",
  "task.updated",
  "task.moved",
  "task.commented",
  "task.archived",
  "decision.raised",
  "decision.addressed",
  "agent.state_changed",
] as const;

export const ownWorkHooks: Readonly<Record<string, HookHandler>> = Object.fromEntries(
  OWN_WORK_EVENTS.map((kind) => [`console:${kind}`, onOwnWork]),
);

/**
 * A message's button pressed: the kind turned off for whoever pressed, answered within the press
 * alone. Answers the words to say to them, or none where nothing changed.
 */
export async function turnOff(
  ctx: PluginContext,
  personId: string,
  kind: string,
  language: Language,
): Promise<string | null> {
  if (!(NOTICE_KINDS as readonly string[]).includes(kind)) {
    return null;
  }
  const noticeKind = kind as NoticeKind;
  const choice = await choiceOf(ctx, personId);
  await saveChoice(ctx, personId, {
    kinds: { ...NOTICE_DEFAULTS, ...choice.kinds, [noticeKind]: false },
  });
  const words = serverWords(language).notice;
  const workspace = await ctx.console.workspace().catch(() => null);
  const page =
    workspace?.url === null || workspace?.url === undefined
      ? words.choose
      : link(`${workspace.url}/plugins/messenger/notifications`, words.choose);
  return words.turnedOff(words.kinds[noticeKind], page);
}

/**
 * The day whose message is due at a moment: today once its time has come in the zone, else
 * yesterday, so that a time later than the job's last run of a day is reached early the next.
 */
export function dueDay(now: Date, timeZone: string, at: string): string {
  const clock = clockIn(now, timeZone);
  return clock.time >= at ? clock.day : clockIn(new Date(now.getTime() - 86_400_000), timeZone).day;
}

/**
 * The day's message of each person who chose one, once their time has come and once for that day,
 * whether or not anything waited then: the lines kept since, thirty at most and the rest as a
 * count, so that a line kept after the day's time waits for the next. The lines of someone who
 * since chose to be told at once are sent at the next run.
 */
async function sendDays(ctx: PluginContext): Promise<void> {
  const connected = await connectionsOf(ctx);
  if (connected.length === 0) {
    return;
  }
  const workspace = await ctx.console.workspace();
  const now = ctx.now();
  // A day passed for whoever chose a day's message and had nothing waiting: the next line waits.
  const daily = await ctx.records(preferences).list({ where: { cadence: "daily" }, limit: 200 });
  const marked = new Set<string>();
  for (const record of daily.items) {
    const due = dueDay(now, workspace.timeZone, record.data.at);
    if ((record.data.sentOn ?? "") < due) {
      marked.add(record.data.personId);
    }
  }
  const lines = new Map<string, PluginRecord<WaitingData>[]>();
  let after: string | undefined;
  for (let page = 0; page < 50; page += 1) {
    const read = await ctx.records(waiting).list({
      order: { field: "at" },
      limit: 200,
      ...(after === undefined ? {} : { after }),
    });
    for (const record of read.items) {
      lines.set(record.data.personId, [...(lines.get(record.data.personId) ?? []), record]);
    }
    after = read.after ?? undefined;
    if (after === undefined) {
      break;
    }
  }
  const fallbackLanguage = workspace.languageSet ? languageOf(workspace.language) : "en";
  for (const record of daily.items) {
    if (marked.has(record.data.personId) && !lines.has(record.data.personId)) {
      await ctx.records(preferences).update(record.id, {
        sentOn: dueDay(now, workspace.timeZone, record.data.at),
      });
    }
  }
  for (const [personId, kept] of lines) {
    const choice = await choiceOf(ctx, personId);
    const due =
      choice.cadence !== "daily" ||
      (choice.sentOn ?? "") < dueDay(now, workspace.timeZone, choice.at);
    if (!due) {
      continue;
    }
    const account = whereTold(connected, await accountsOf(ctx, personId), null);
    if (account !== null) {
      const language = await languageOfPerson(ctx, personId, fallbackLanguage);
      const words = serverWords(language).notice;
      const shown = kept
        .slice(0, DAY_LINES_AT_MOST)
        .map((record) =>
          record.data.url === null
            ? `• ${safe(record.data.text)}`
            : `• ${safe(record.data.text)} (${link(record.data.url, words.open)})`,
        );
      const more = kept.length - shown.length;
      const blocks: Block[] = [
        section(`*${words.dayTitle(String(kept.length))}*\n${shown.join("\n")}`),
        ...(more > 0 ? [context(words.more(String(more)))] : []),
        ...(workspace.url === null
          ? []
          : [context(link(`${workspace.url}/plugins/messenger/notifications`, words.choose))]),
      ];
      try {
        await directly(ctx, account, fallback(words.dayTitle(String(kept.length))), blocks);
      } catch (error) {
        ctx.log.warn("a day's message did not go", {
          code: error instanceof SlackError ? error.code : null,
        });
        continue;
      }
    }
    for (const record of kept) {
      await ctx.records(waiting).archive(record.id);
    }
    if (choice.cadence === "daily") {
      await saveChoice(ctx, personId, { sentOn: dueDay(now, workspace.timeZone, choice.at) });
    }
  }
}

export const day: JobDefinition = {
  about: "Sends each person who chose one their message of the day, at their time.",
  every: "PT1H",
  async run(ctx) {
    await sendDays(ctx);
  },
};
