// What a person is told of their own work, as they choose (ADR-0015): the console's events of the
// projects the messenger is placed on, a task given to them, one they own moved, one of theirs
// changed, commented or put away, a decision waiting on them, and to a manager their agent
// accounts stopping, long unheard or running again; each told to the person it is about, never whoever made the
// change, in their language. A message says what happened first, in a few words, then the thing,
// its name the link to it on the console, then who did it; a day's message says each thing once,
// with everything that happened to it, what waits on the person first. In a direct message, in the
// workspace the project is told in where they have an account there, else the default, else
// another they have one in (ADR-0014); at once, or in one message a day at a time of the
// workspace's zone. Chosen on a page of the messenger's and through their agent, with the command
// `notify` and the query `notices`; each message at once has a button that turns its kind off.
// Whoever never chose is told of their agent accounts alone (ADR-0017).
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
import {
  type HappenedData,
  type PreferenceData,
  preferences,
  type SilenceData,
  silences,
  type WaitingData,
  waiting,
} from "./collections.js";
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

/** The things of a day's message, at most; the rest said as a count. */
const DAY_THINGS_AT_MOST = 20;
/** What a comment's excerpt or a decision's question is held to. */
const EXCERPT_AT_MOST = 200;
/** A thing's comments quoted in a day's message, the last ones, and what each is held to there. */
const DAY_QUOTES = { count: 2, each: 140 } as const;
/** The states a thing's moves are written out to; a longer way is its first and its last. */
const STATES_AT_MOST = 4;
/** The state a task waits in for a person's look at what was done. */
const IN_REVIEW = "in_review";
/** How an agent account stands whose runner the console does not hear from, and one it does. */
const UNHEARD = "unheard";
const RUNNING = "running";
/**
 * How long an agent account goes unheard before its manager is told, counted from the console
 * saying so, and how long it is heard from again before that is told: a machine that wakes for
 * a few minutes in its sleep, or is off the network as long, tells nobody anything. The words
 * say the first (`agentStates.unheard`).
 */
const UNHEARD_AFTER_MS = 30 * 60_000;
const BACK_AFTER_MS = 10 * 60_000;

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

/** Who did it, by name; none where the console names nobody, as for a run it gave up on itself. */
function nameOf(person: Who | null | undefined): string | null {
  if (person === null || person === undefined) {
    return null;
  }
  const name = person.name?.trim();
  return clean(name !== undefined && name.length > 0 ? name : (person.login ?? person.id), 200);
}

/** What happened to one thing, in parts no language is in, as the collection `waiting` keeps it. */
export type Happened = HappenedData;

/** One thing to tell one person: the kind it is, what happened, and where it leads on the console. */
interface Notice {
  readonly personId: string;
  readonly kind: NoticeKind;
  readonly projectId: string | null;
  readonly url: string | null;
  readonly what: Happened;
}

/** One of the things that happened to a thing: its kind and its parts. */
interface Line {
  readonly kind: NoticeKind;
  readonly what: Happened;
}

/** A thing and what happened to it: one message at once, or one entry of a day's message. */
interface Entry {
  readonly url: string | null;
  readonly lines: readonly Line[];
}

type NoticeWords = ReturnType<typeof serverWords>["notice"];

/** A happening with nothing in it, for each kind to fill what it has. */
const NOTHING: Omit<Happened, "title"> = {
  ref: null,
  actor: null,
  from: null,
  to: null,
  fields: [],
  excerpt: "",
};

/**
 * The states a thing went through, as `Ready → In review`: where it stood before the first move,
 * then each state it came to, one it came to twice running said once; `→ Done` where the console
 * did not say where it stood.
 */
function wayOf(words: NoticeWords, moves: readonly Happened[]): string {
  const name = (state: string) => words.states[state] ?? state;
  const from = moves[0]?.from ?? null;
  const all = [
    ...(from === null ? [] : [from]),
    ...moves.flatMap((move) => (move.to === null ? [] : [move.to])),
  ].filter((state, index, states) => index === 0 || state !== states[index - 1]);
  const first = all[0];
  const last = all.at(-1);
  if (first === undefined || last === undefined) {
    return "→";
  }
  if (all.length === 1) {
    return `→ ${name(first)}`;
  }
  return all.length > STATES_AT_MOST
    ? `${name(first)} → … → ${name(last)}`
    : all.map(name).join(" → ");
}

/**
 * What happened to a thing, each in a few words and each said once, however often it happened:
 * a decision waiting; how an agent account stands now; given to the person, the way its moves
 * went, what changed of it, how many comments, put away.
 */
function factsOf(words: NoticeWords, lines: readonly Line[]): string[] {
  const of = (kind: NoticeKind) =>
    lines.filter((line) => line.kind === kind).map((line) => line.what);
  const facts: string[] = [];
  if (of("decisions").length > 0) {
    facts.push(words.facts.decision);
  }
  const stands = of("agents").at(-1)?.to ?? null;
  if (stands !== null) {
    facts.push(words.facts.agent(words.agentStates[stands] ?? stands));
  }
  if (of("assigned").length > 0) {
    facts.push(words.facts.assigned);
  }
  const moves = of("moved");
  if (moves.length > 0) {
    facts.push(wayOf(words, moves));
  }
  const fields = [...new Set(of("changed").flatMap((what) => what.fields))];
  if (fields.length > 0) {
    facts.push(words.facts.changed(fields.map((field) => words.fields[field] ?? field).join(", ")));
  }
  const comments = of("commented").length;
  if (comments > 0) {
    facts.push(comments === 1 ? words.facts.commented : words.facts.comments(String(comments)));
  }
  if (of("archived").length > 0) {
    facts.push(words.facts.archived);
  }
  return facts;
}

/** What to look at where an agent account stands as it does now, or nothing. */
function hintOf(words: NoticeWords, lines: readonly Line[]): string | null {
  const stands = lines.findLast((line) => line.kind === "agents")?.what.to ?? null;
  return stands === null ? null : (words.agentHints[stands] ?? null);
}

/** Who did what happened to a thing: one or two by name, more as the first and a count. */
function whoOf(words: NoticeWords, lines: readonly Line[]): string {
  const names = [
    ...new Set(lines.flatMap((line) => (line.what.actor === null ? [] : [line.what.actor]))),
  ];
  const [first] = names;
  if (first === undefined) {
    return "";
  }
  return names.length <= 2 ? names.join(", ") : words.others(first, String(names.length - 1));
}

/** A thing's name: a task's key and number before its title. */
function labelOf(what: Happened): string {
  return what.ref === null ? what.title : `${what.ref} ${what.title}`;
}

/**
 * A thing as Slack's markup, to be read at a glance: what happened in bold, and who did it; under
 * it the thing, its name the link to it on the console, and what to look at where an agent
 * account stands so; under that what was said, a comment's words or an agent account's own,
 * quoted, the last few of them.
 */
function entryMarkup(
  language: Language,
  entry: Entry,
  quotes: { readonly count: number; readonly each: number },
): string {
  const words = serverWords(language).notice;
  const who = whoOf(words, entry.lines);
  const facts = safe(factsOf(words, entry.lines).join(" · "));
  const last = entry.lines.at(-1)?.what;
  const label = last === undefined ? "" : labelOf(last);
  const hint = hintOf(words, entry.lines);
  const said = entry.lines
    .map((line) => line.what.excerpt)
    .filter((excerpt) => excerpt.length > 0)
    .slice(-quotes.count)
    .map((excerpt) => `> ${safe(clean(excerpt, quotes.each))}`);
  return [
    who.length === 0 ? `*${facts}*` : `*${facts}* · ${safe(who)}`,
    entry.url === null ? safe(label) : link(entry.url, label),
    ...(hint === null ? [] : [safe(hint)]),
    ...said,
  ].join("\n");
}

/** The same in one sentence, for where blocks are not read: a notification, and a line kept. */
function sentenceOf(language: Language, line: Line): string {
  const words = serverWords(language).notice;
  const who = whoOf(words, [line]);
  const facts = factsOf(words, [line]).join(" · ");
  const hint = hintOf(words, [line]);
  const said = line.what.excerpt.length === 0 ? "" : ` — ${line.what.excerpt}`;
  return `${facts}${who.length === 0 ? "" : ` · ${who}`}: ${labelOf(line.what)}${
    hint === null ? "" : ` — ${hint}`
  }${said}`;
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
    const url = origin === null ? null : `${origin}/projects/${project.key}/tasks/${task.number}`;
    const owner = task.owner.id;
    const workers = task.workers.map((worker) => worker.id);
    const everyone = [...new Set([owner, ...workers])];
    const about: Happened = {
      ...NOTHING,
      ref: clean(`${project.key}-${task.number}`, 80),
      title: clean(task.title, 200),
      actor: nameOf(actor),
    };
    const make = (
      personId: string,
      noticeKind: NoticeKind,
      more: Partial<Happened> = {},
    ): Notice => ({
      personId,
      kind: noticeKind,
      projectId,
      url,
      what: { ...about, ...more },
    });
    const state = (value: unknown) => (typeof value === "string" ? clean(value, 40) : null);
    switch (kind) {
      case "task.created":
        return everyone.map((personId) => make(personId, "assigned"));
      case "task.updated": {
        const added = Array.isArray(data.workersAdded)
          ? (data.workersAdded as unknown[]).filter((id): id is string => typeof id === "string")
          : [];
        const fields = Array.isArray(data.fields)
          ? (data.fields as unknown[]).filter((field): field is string => typeof field === "string")
          : [];
        const what = fields.filter((field) => CHANGED.includes(field));
        return [
          ...added.map((personId) => make(personId, "assigned")),
          ...(what.length === 0
            ? []
            : everyone
                .filter((personId) => !added.includes(personId))
                .map((personId) => make(personId, "changed", { fields: what }))),
        ];
      }
      case "task.moved":
        return [
          make(owner, "moved", {
            from: state(data.from),
            to: state(data.to) ?? clean(task.state, 40),
          }),
        ];
      case "task.commented": {
        const excerpt =
          typeof data.excerpt === "string" ? clean(data.excerpt, EXCERPT_AT_MOST) : "";
        return everyone.map((personId) => make(personId, "commented", { excerpt }));
      }
      case "task.archived":
        return everyone.map((personId) => make(personId, "archived"));
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
      url,
      what: { ...NOTHING, title: question, actor: nameOf(actor) },
    }));
  }
  return [];
}

/** The fields of a task whose change is told: its days, its title, its body. */
const CHANGED = ["title", "body", "startsOn", "dueOn"];

/**
 * An agent account's states its manager is told of as they come: stopping, refused, failing, and
 * running again. One unheard is told by the job `unheard`, once it lasted.
 */
const AGENT_TOLD = new Set(["stopped", "refused", "failed"]);

/** The agent account an event names by its login, or nobody. */
async function agentOf(ctx: PluginContext, login: string) {
  return (await ctx.console.people.list({ q: login })).find(
    (person) => person.login.toLowerCase() === login.toLowerCase(),
  );
}

async function silenceOf(
  ctx: PluginContext,
  personId: string,
): Promise<PluginRecord<SilenceData> | null> {
  const page = await ctx.records(silences).list({ where: { personId }, limit: 1 });
  return page.items[0] ?? null;
}

/**
 * Follows an agent account into its silence and out of it, whether or not Slack is connected: one
 * unheard is kept from when the console said so; one running again is put away where nobody was
 * told, and kept as back where its manager was, until it stayed so; one unheard again before
 * that is silent as it was; and one that stopped, was refused or failed is put away, its manager
 * being told of that as it comes. Each step reads the record first, so that a delivery repeated
 * changes nothing.
 */
async function followSilence(ctx: PluginContext, event: PluginHookEvent): Promise<void> {
  const data = (event.data ?? {}) as Record<string, unknown>;
  const state = typeof data.state === "string" ? data.state : null;
  const login = typeof data.login === "string" ? data.login : null;
  if (state === null || login === null) {
    return;
  }
  const account = await agentOf(ctx, login);
  if (account === undefined) {
    return;
  }
  const found = await silenceOf(ctx, account.id);
  const at = (Number.isNaN(Date.parse(event.at)) ? ctx.now() : new Date(event.at)).toISOString();
  if (state === UNHEARD) {
    if (found === null) {
      await ctx.records(silences).create({
        personId: account.id,
        since: at,
        toldAt: null,
        backAt: null,
      });
    } else if (found.data.backAt !== null) {
      await ctx.records(silences).update(found.id, { backAt: null });
    }
    return;
  }
  if (found === null) {
    return;
  }
  if (state === RUNNING && found.data.toldAt !== null) {
    if (found.data.backAt === null) {
      await ctx.records(silences).update(found.id, { backAt: at });
    }
    return;
  }
  await ctx.records(silences).archive(found.id);
}

/** What an agent account standing otherwise comes to: a line to whoever it reports to. */
async function noticesOfAgent(ctx: PluginContext, event: PluginHookEvent): Promise<Notice[]> {
  const data = (event.data ?? {}) as Record<string, unknown>;
  const state = typeof data.state === "string" ? data.state : null;
  const was = typeof data.was === "string" ? data.was : null;
  const login = typeof data.login === "string" ? data.login : null;
  const told =
    (state !== null && AGENT_TOLD.has(state)) ||
    (state === RUNNING && was !== null && AGENT_TOLD.has(was));
  if (!told || login === null || state === null) {
    return [];
  }
  const account = await agentOf(ctx, login);
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
      url: null,
      what: {
        ...NOTHING,
        title: clean(handle ?? account.name ?? account.login, 200),
        from: was === null ? null : clean(was, 40),
        to: clean(state, 40),
        excerpt: detail,
      },
    },
  ];
}

/** The message of one notice: what happened to the thing, the page that chooses, and the button that turns its kind off. */
function noticeBlocks(language: Language, notice: Notice, origin: string | null): Block[] {
  const words = serverWords(language).notice;
  const kind = notice.kind;
  const blocks: Block[] = [
    section(
      entryMarkup(
        language,
        { url: notice.url, lines: [notice] },
        { count: 1, each: EXCERPT_AT_MOST },
      ),
    ),
  ];
  if (origin !== null) {
    blocks.push(context(link(`${origin}/plugins/messenger/notifications`, words.choose)));
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
 * Tells a notice to its person as they chose: at once, or kept for the day's message. Answers
 * whether it was, which it is not for a kind or a project turned off, or no account in a workspace
 * the app is in.
 */
async function tellChosen(
  ctx: PluginContext,
  notice: Notice,
  choice: PreferenceData,
  connected: readonly ConnectionRecord[],
  origin: string | null,
  fallbackLanguage: Language,
): Promise<boolean> {
  if (!(choice.kinds[notice.kind] ?? NOTICE_DEFAULTS[notice.kind])) {
    return false;
  }
  if (notice.projectId !== null && choice.mutedProjects.includes(notice.projectId)) {
    return false;
  }
  const account = whereTold(connected, await accountsOf(ctx, notice.personId), notice.projectId);
  if (account === null) {
    return false;
  }
  const language = await languageOfPerson(ctx, notice.personId, fallbackLanguage);
  const sentence = sentenceOf(language, notice);
  if (choice.cadence === "daily") {
    await ctx.records(waiting).create(
      {
        personId: notice.personId,
        kind: notice.kind,
        text: [...sentence].slice(0, 600).join(""),
        url: notice.url,
        at: ctx.now().toISOString(),
        what: notice.what,
      },
      { owner: notice.personId },
    );
  } else {
    await directly(ctx, account, fallback(sentence), noticeBlocks(language, notice, origin));
  }
  return true;
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
    if (await tellChosen(ctx, notice, choice, connected, origin, fallbackLanguage)) {
      told.push(once);
    }
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
  if (event.kind === "console:agent.state_changed") {
    await followSilence(ctx, event);
  }
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

/** Every record a query finds, a page at a time. */
async function everyOne<T>(
  list: (after: string | undefined) => Promise<{
    readonly items: readonly PluginRecord<T>[];
    readonly after?: string | null;
  }>,
): Promise<PluginRecord<T>[]> {
  const all: PluginRecord<T>[] = [];
  let after: string | undefined;
  for (let page = 0; page < 50; page += 1) {
    const read = await list(after);
    all.push(...read.items);
    after = read.after ?? undefined;
    if (after === undefined || read.items.length === 0) {
      break;
    }
  }
  return all;
}

/**
 * What stands first in a day's message: a decision waiting, an agent account that stands
 * otherwise, a task given to the person or put up for their look, then everything else.
 */
function rankOf(entry: Entry): number {
  const kinds = new Set(entry.lines.map((line) => line.kind));
  if (kinds.has("decisions")) {
    return 0;
  }
  if (kinds.has("agents")) {
    return 1;
  }
  const stands = entry.lines.findLast((line) => line.kind === "moved")?.what.to ?? null;
  return kinds.has("assigned") || stands === IN_REVIEW ? 2 : 3;
}

/**
 * A day's lines as the things they are about, each thing once with everything that happened to
 * it: a task by its key and number, a decision by its address, an agent account by its name. What
 * waits on the person stands first, and within that what happened last. A line kept by 0.4, which
 * has its sentence alone, is a thing of its own, said as it was.
 */
export function dayBlocks(
  language: Language,
  kept: readonly PluginRecord<WaitingData>[],
  origin: string | null,
): { readonly blocks: Block[]; readonly title: string } {
  const words = serverWords(language).notice;
  const things = new Map<
    string,
    { url: string | null; lines: Line[]; at: string; said: string | null }
  >();
  for (const record of kept) {
    const { kind, what, url, at, text } = record.data;
    const key =
      what === undefined
        ? `line:${record.id}`
        : what.ref !== null
          ? `task:${what.ref}`
          : `${kind}:${kind === "decisions" ? (url ?? what.title) : what.title}`;
    const thing = things.get(key) ?? { url, lines: [], at, said: null };
    if (what === undefined) {
      thing.said = text;
    } else {
      thing.lines.push({ kind, what });
    }
    thing.url = url ?? thing.url;
    // The lines come in the order they were kept: the one read last is the thing's latest.
    thing.at = at;
    things.set(key, thing);
  }
  const ordered = [...things.values()].sort(
    (a, b) =>
      (a.said === null ? rankOf(a) : 3) - (b.said === null ? rankOf(b) : 3) ||
      (a.at < b.at ? 1 : a.at > b.at ? -1 : 0),
  );
  const shown = ordered.slice(0, DAY_THINGS_AT_MOST);
  const more = ordered.length - shown.length;
  const title = words.dayTitle(String(ordered.length));
  return {
    title,
    blocks: [
      section(`*${safe(title)}*`),
      ...shown.map((thing) =>
        section(
          thing.said === null
            ? entryMarkup(language, thing, DAY_QUOTES)
            : thing.url === null
              ? safe(thing.said)
              : `${safe(thing.said)} (${link(thing.url, words.open)})`,
        ),
      ),
      ...(more > 0 ? [context(words.more(String(more)))] : []),
      ...(origin === null
        ? []
        : [context(link(`${origin}/plugins/messenger/notifications`, words.choose))]),
    ],
  };
}

/**
 * The day's message of each person who chose one, once their time has come and once for that day,
 * whether or not anything waited then: what was kept since, a thing at a time, twenty at most and
 * the rest as a count, so that a line kept after the day's time waits for the next. The lines of
 * someone who since chose to be told at once are sent at the next run. The job runs every five
 * minutes, and most runs end having read who chose a day's message and what waits, and written
 * nothing: nobody's time has come, and nothing waits for someone told at once.
 */
async function sendDays(ctx: PluginContext): Promise<void> {
  const connected = await connectionsOf(ctx);
  if (connected.length === 0) {
    return;
  }
  const workspace = await ctx.console.workspace();
  const now = ctx.now();
  const dueOf = (at: string) => dueDay(now, workspace.timeZone, at);
  const daily = new Map(
    (
      await everyOne<PreferenceData>((after) =>
        ctx.records(preferences).list({
          where: { cadence: "daily" },
          limit: 200,
          ...(after === undefined ? {} : { after }),
        }),
      )
    ).map((record) => [record.data.personId, record]),
  );
  /** Whether a person's message is due: their day's time has come unsent, or they are told at once. */
  const due = (personId: string) => {
    const choice = daily.get(personId)?.data;
    return choice === undefined || (choice.sentOn ?? "") < dueOf(choice.at);
  };
  const lines = new Map<string, PluginRecord<WaitingData>[]>();
  for (const record of await everyOne<WaitingData>((after) =>
    ctx.records(waiting).list({
      order: { field: "at" },
      limit: 200,
      ...(after === undefined ? {} : { after }),
    }),
  )) {
    lines.set(record.data.personId, [...(lines.get(record.data.personId) ?? []), record]);
  }
  // A day passed for whoever chose a day's message and had nothing waiting: the next line waits.
  for (const [personId, record] of daily) {
    if (due(personId) && !lines.has(personId)) {
      await ctx.records(preferences).update(record.id, { sentOn: dueOf(record.data.at) });
    }
  }
  const fallbackLanguage = workspace.languageSet ? languageOf(workspace.language) : "en";
  for (const [personId, kept] of lines) {
    if (!due(personId)) {
      continue;
    }
    const account = whereTold(connected, await accountsOf(ctx, personId), null);
    if (account !== null) {
      const language = await languageOfPerson(ctx, personId, fallbackLanguage);
      const message = dayBlocks(language, kept, workspace.url);
      try {
        await directly(ctx, account, fallback(message.title), message.blocks);
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
    const choice = daily.get(personId);
    if (choice !== undefined) {
      await ctx.records(preferences).update(choice.id, { sentOn: dueOf(choice.data.at) });
    }
  }
}

export const day: JobDefinition = {
  about:
    "Sends each person who chose one their message of the day, within five minutes of their time.",
  // The least a job may run at. A person's time is to the minute, and a job with no `at` is not
  // held to the clock: its runs fall wherever the first one did, so that an hourly one sent a
  // message chosen for 09:00 at 09:47. From console 0.5.3 the next run is a period after the
  // time the last was due; a console before counted it from the end of the last run and looked
  // once a minute, so that its runs fell six minutes apart, not five.
  every: "PT5M",
  async run(ctx) {
    await sendDays(ctx);
  },
};

/**
 * Tells a manager of an agent account that has gone unheard for half an hour, once, with what to
 * look at, and of one heard from again for ten minutes after that, once; as they chose, in the
 * kind of their agent accounts, at once or in the day's message. An account that left, or reports
 * to nobody, is put away. A message Slack did not take is tried at the next run. Most runs read
 * what is kept, find nothing due and write nothing.
 */
async function tellSilences(ctx: PluginContext): Promise<void> {
  const now = ctx.now();
  const lasted = (since: string) => now.getTime() - Date.parse(since);
  const due = (
    await everyOne<SilenceData>((after) =>
      ctx.records(silences).list({ limit: 200, ...(after === undefined ? {} : { after }) }),
    )
  ).filter(({ data }) =>
    data.backAt !== null
      ? lasted(data.backAt) >= BACK_AFTER_MS
      : data.toldAt === null && lasted(data.since) >= UNHEARD_AFTER_MS,
  );
  if (due.length === 0) {
    return;
  }
  const connected = await connectionsOf(ctx);
  if (connected.length === 0) {
    return;
  }
  const workspace = await ctx.console.workspace();
  const fallbackLanguage = workspace.languageSet ? languageOf(workspace.language) : "en";
  for (const record of due) {
    const back = record.data.backAt !== null;
    const account = await ctx.console.people.get(record.data.personId);
    const managerId = account?.managerId ?? null;
    if (account === null || account.status !== "active" || managerId === null) {
      await ctx.records(silences).archive(record.id);
      continue;
    }
    try {
      await tellChosen(
        ctx,
        {
          personId: managerId,
          kind: "agents",
          projectId: null,
          url: null,
          what: {
            ...NOTHING,
            title: clean(account.handle ?? account.name ?? account.login, 200),
            from: back ? UNHEARD : null,
            to: back ? RUNNING : UNHEARD,
          },
        },
        await choiceOf(ctx, managerId),
        connected,
        workspace.url,
        fallbackLanguage,
      );
    } catch (error) {
      ctx.log.warn("an agent account's silence was not told", {
        code: error instanceof SlackError ? error.code : null,
      });
      continue;
    }
    // Marked whether or not the manager chose to be told: a silence is told once, or never.
    if (back) {
      await ctx.records(silences).archive(record.id);
    } else {
      await ctx.records(silences).update(record.id, { toldAt: now.toISOString() });
    }
  }
}

export const unheard: JobDefinition = {
  about:
    "Tells a manager of an agent account unheard for half an hour, and of one heard from again after.",
  every: "PT5M",
  async run(ctx) {
    await tellSilences(ctx);
  },
};
