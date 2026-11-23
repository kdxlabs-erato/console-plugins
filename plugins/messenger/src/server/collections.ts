// The records of the messenger, kept by the console. One app, made from the plugin's manifest and
// installed in each workspace that takes it (ADR-0014); a connection per workspace it is installed
// in, the default one for every project no other names; the routes the role holders write, each
// to a channel of a workspace; the links of people to their accounts, one per workspace, written
// by the matching; a thread per thing told, what was written about it and where; and the
// deliveries, a line per event heard, forgotten after a month. Every schema bounds what it holds,
// since what Slack and other plugins answer is data from elsewhere.
import { defineCollection, z } from "@skillcdn/console/plugin";
import { CADENCES, LANGUAGES, NOTICE_KINDS, ROUTE_AS, ROUTE_KINDS } from "../shared/contracts.js";
import { MEMBER, ROLE } from "./access.js";

const id = z.string().min(1).max(64);
const instant = z.string().min(1).max(40);
/** A message's timestamp in Slack, which is also its id within its conversation. */
export const slackTs = z.string().regex(/^\d{1,12}\.\d{1,9}$/);
/** A conversation: a public or private channel, a direct or a group message. */
export const channelId = z.string().regex(/^[CDG][A-Z0-9]{2,40}$/);
/** A member of a workspace. */
export const memberId = z.string().regex(/^[UW][A-Z0-9]{2,40}$/);
/** A workspace, an app or a bot user: Slack's ids, letters and digits. */
export const slackId = z.string().regex(/^[A-Z][A-Z0-9]{2,40}$/);

/** The most workspaces one app is installed in: the keys its bot token keeps. */
export const WORKSPACES_AT_MOST = 50;
/** The most installation links good at once. */
export const INSTALLS_AT_MOST = 20;

/** An installation link given out: the state Slack carries back, until when it is good, and who asked. */
const install = z.object({
  state: z.string().regex(/^[0-9a-f]{32}$/),
  until: instant,
  by: id.nullable(),
});

export const apps = defineCollection("apps", {
  schema: z.object({
    provider: z.literal("slack"),
    appId: slackId.nullable(),
    /** The app's client id: no secret, since Slack puts it in addresses, and so a plain field. */
    clientId: z.string().max(80).nullable(),
    /** The language of the names the app shows in Slack, its shortcut's among them. */
    language: z.enum(LANGUAGES),
    /** The names someone chose for the app and its bot in Slack; null where the language's own stand. */
    appName: z.string().max(100).nullable(),
    botName: z.string().max(80).nullable(),
    /** The icon chosen, a public https image, and the one Slack took last. */
    iconUrl: z.string().max(1000).nullable(),
    iconSetUrl: z.string().max(1000).nullable(),
    /** Why the icon chosen is not the app's: `manual` where the token may not set it, else Slack's word. */
    iconProblem: z.string().max(80).nullable(),
    shortcut: z.boolean(),
    manifestDigest: z.string().max(64).nullable(),
    manifestAt: instant.nullable(),
    /** The installation links good now, each once. */
    installs: z.array(install).max(INSTALLS_AT_MOST),
    problem: z.string().max(500).nullable(),
    problemAt: instant.nullable(),
    rotatedAt: instant.nullable(),
  }),
  indexes: ["provider"],
  read: [ROLE],
});

export const connections = defineCollection("connections", {
  schema: z.object({
    provider: z.literal("slack"),
    /** The workspace, the key its bot token is kept under. */
    teamId: slackId,
    teamName: z.string().max(200).nullable(),
    botUserId: slackId.nullable(),
    /** The bot's handle as Slack made it from the bot's name, read once the app is installed. */
    botHandle: z.string().max(80).nullable(),
    /**
     * `pending` once installed through a link, until whoever keeps the messenger accepts it on the
     * console; `connected`; or `removed` once the workspace took the app away or someone
     * disconnected it. Nothing is matched, told or answered in a workspace that is not connected.
     */
    state: z.enum(["pending", "connected", "removed"]),
    /** The workspace every project no other names is told in. */
    default: z.boolean(),
    /** The projects told in this workspace, by the console's ids. */
    projects: z.array(id).max(500),
    connectedAt: instant.nullable(),
    /** Who gave out the link it was installed through, by the console's id, and who installed it in Slack. */
    connectedBy: id.nullable(),
    installedBy: memberId.nullable(),
    problem: z.string().max(500).nullable(),
    problemAt: instant.nullable(),
    matchedAt: instant.nullable(),
    matched: z.number().int().min(0),
    unmatched: z.number().int().min(0),
  }),
  indexes: ["teamId", "state"],
  read: [ROLE],
});

export const routes = defineCollection("routes", {
  schema: z.object({
    kind: z.enum(ROUTE_KINDS),
    /** The workspace the channel is in. */
    teamId: slackId,
    channelId,
    channelName: z.string().min(1).max(200),
    language: z.enum(LANGUAGES),
    as: z.enum(ROUTE_AS),
  }),
  indexes: ["kind", "channelId", "teamId"],
  read: [ROLE],
});

export const links = defineCollection("links", {
  schema: z.object({
    personId: id,
    memberId,
    /** The workspace the account is in: a person has one link in each workspace they are in. */
    teamId: slackId,
    /** The name the account goes by in Slack, which a message in the person's name carries. */
    name: z.string().min(1).max(200),
    /** The account's picture, an https address of Slack's, which a message in their name shows. */
    image: z.string().max(1000).nullable(),
    matchedAt: instant,
  }),
  indexes: ["personId", "memberId", "teamId"],
  owner: "personId",
  read: [ROLE],
  history: false,
});

const step = z.object({
  decisionId: id,
  kind: z.enum(["approval", "cancellation"]),
  /** The message in the thread that asks, with its buttons. */
  ts: slackTs.nullable(),
  /** Whom the decision is addressed to, by the console's ids. */
  asked: z.array(id).max(50),
  /** The direct messages that asked those the conversation does not hold, each in its workspace. */
  dms: z.array(z.object({ teamId: slackId, channelId, ts: slackTs })).max(10),
  closed: z.boolean(),
});

const post = z.object({
  routeId: id,
  teamId: slackId,
  channelId,
  ts: slackTs,
  as: z.enum(ROUTE_AS),
  language: z.enum(LANGUAGES),
});

export const threads = defineCollection("threads", {
  schema: z.object({
    /** The producer, by key, and the thing it told of: a request of leave for `hr`. */
    plugin: z.string().min(1).max(32),
    thing: id,
    personId: id,
    /** The workspace of the conversation; null where nobody is in Slack. */
    teamId: slackId.nullable(),
    /** The conversation of the person and whoever decides; null where nobody is in Slack. */
    channelId: channelId.nullable(),
    members: z.array(memberId).max(8),
    rootTs: slackTs.nullable(),
    rootAs: z.enum(ROUTE_AS),
    /** The language the thread speaks to the person in. */
    language: z.enum(LANGUAGES),
    steps: z.array(step).max(30),
    /** What the routes posted in channels, to strike through when the thing is cancelled. */
    posts: z.array(post).max(20),
    state: z.enum(["open", "approved", "rejected", "returned", "cancelled"]),
  }),
  indexes: ["thing", "state", "teamId"],
  read: [ROLE],
  history: false,
  retention: { days: 400, by: "updatedAt" },
});

export const deliveries = defineCollection("deliveries", {
  schema: z.object({
    eventId: z.string().min(1).max(80),
    kind: z.string().min(1).max(80),
    thing: id.nullable(),
    outcome: z.enum(["sent", "skipped", "failed"]),
    note: z.string().max(300),
    /** Whom an event was told to already, as `<person>:<kind>`, so that a retry tells nobody twice. */
    told: z.array(z.string().max(100)).max(100).optional(),
    attempt: z.number().int().min(1).max(100),
    at: instant,
  }),
  indexes: ["eventId", "at", "outcome"],
  read: [ROLE],
  history: false,
  retention: { days: 30 },
});

/**
 * What a person chose to be told of their own work (ADR-0015), one record each, theirs: the kinds,
 * the projects told nothing of, at once or once a day and when, and whether their own agents count.
 */
export const preferences = defineCollection("preferences", {
  schema: z.object({
    personId: id,
    kinds: z.object(
      Object.fromEntries(NOTICE_KINDS.map((kind) => [kind, z.boolean()])) as {
        [K in (typeof NOTICE_KINDS)[number]]: z.ZodBoolean;
      },
    ),
    mutedProjects: z.array(id).max(200),
    cadence: z.enum(CADENCES),
    /** The time of the day's message, in the workspace's zone. */
    at: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/),
    ownAgents: z.boolean(),
    /** The day the last day's message went, in the workspace's zone. */
    sentOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
  }),
  indexes: ["personId", "cadence"],
  owner: "personId",
  // A person's own, as what waits for their day's message: nobody else reads it through the console.
  readOwn: [MEMBER],
  history: false,
});

/**
 * What happened to one thing, in parts no language is in: the words are put to it when it is told,
 * and a day's message puts everything that happened to one thing together by it.
 */
const happened = z.object({
  /** The thing where it is a task, as `KEY-12`; none for a decision or an agent account. */
  ref: z.string().max(80).nullable(),
  /** The task's title, the decision's question, the agent account's name. */
  title: z.string().max(200),
  /** Who did it, by name; none where the console names nobody. */
  actor: z.string().max(200).nullable(),
  /** The states of a move, or how an agent account stood and stands. */
  from: z.string().max(40).nullable(),
  to: z.string().max(40).nullable(),
  /** What a change changed of the task. */
  fields: z.array(z.string().max(40)).max(8),
  /** A comment's words, or what an agent account's state says of itself. */
  excerpt: z.string().max(200),
});

/** A line of a person's message of the day, kept until it is sent; forgotten after a few days. */
export const waiting = defineCollection("waiting", {
  schema: z.object({
    personId: id,
    kind: z.enum(NOTICE_KINDS),
    /** The line in one sentence, in the person's language, and where it leads on the console. */
    text: z.string().min(1).max(600),
    url: z.string().max(1000).nullable(),
    at: instant,
    /**
     * The same in parts. A line kept by 0.4 has none and is sent as its sentence: the field is
     * optional so that the lines waiting when a deployment moves are read as they are, and they
     * are gone within the three days a line is kept, so no upgrade writes it.
     */
    what: happened.optional(),
  }),
  indexes: ["personId", "at"],
  owner: "personId",
  readOwn: [MEMBER],
  history: false,
  retention: { days: 3 },
});

/**
 * An agent account the console does not hear from, kept from the event that says so: the console
 * tells a state as it changes and answers no plugin how an account stands, so that how long one
 * has gone unheard is counted from here. Its manager is told once it lasted, and once more when
 * the account is heard from again and stays so; one that came back before anyone was told is
 * put away unsaid.
 */
export const silences = defineCollection("silences", {
  schema: z.object({
    /** The agent account. */
    personId: id,
    since: instant,
    /** When its manager was told of it; none while it is too short to tell. */
    toldAt: instant.nullable(),
    /** When the account was heard from again after its manager was told; none while it is silent. */
    backAt: instant.nullable(),
  }),
  indexes: ["personId"],
  read: [ROLE],
  history: false,
});

export const collections = [
  apps,
  connections,
  routes,
  links,
  threads,
  deliveries,
  preferences,
  waiting,
  silences,
];

export type AppData = z.infer<typeof apps.schema>;
export type ConnectionData = z.infer<typeof connections.schema>;
export type RouteData = z.infer<typeof routes.schema>;
export type LinkData = z.infer<typeof links.schema>;
export type ThreadData = z.infer<typeof threads.schema>;
export type StepData = z.infer<typeof step>;
export type PostData = z.infer<typeof post>;
export type DeliveryData = z.infer<typeof deliveries.schema>;
export type InstallData = z.infer<typeof install>;
export type PreferenceData = z.infer<typeof preferences.schema>;
export type WaitingData = z.infer<typeof waiting.schema>;
export type SilenceData = z.infer<typeof silences.schema>;
export type HappenedData = z.infer<typeof happened>;
