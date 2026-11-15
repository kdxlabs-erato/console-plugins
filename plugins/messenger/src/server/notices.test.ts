// What a person is told of their own work (ADR-0015): each of the console's events told to whom it
// is about, never whoever made it, as each chose, in their language and in a workspace they have
// an account in, the project's first; once a day where they chose so; turned off from the message
// itself; and the choice made on the page and through their agent with `notify` and `notices`.
import type { PluginHookEvent } from "@skillcdn/console/plugin";
import { describe, expect, it } from "vitest";
import type { NoticesView, ProjectNoticesView } from "../shared/contracts.js";
import { day, dueDay, notices, notify, onOwnWork, projectNotices, slackEndpoint } from "./index.js";
import {
  CONSOLE,
  connected,
  fakeSlack,
  HANA,
  JIHYE,
  linked,
  MEMBER_JIHYE,
  MEMBER_MINSU,
  MINSU,
  NOW,
  STRANGER,
  setup,
  signedRequest,
  TEAM,
} from "./test-fakes.js";

const OTHER = { id: "T0OTHER01", name: "Other" };
const PROJECT = { id: "0199d000-0000-7000-8000-0000000000p1", key: "WEB" };
const DECISION = "0199b000-0000-7000-8000-00000000d009";
const brief = (person: { id: string; login: string; name: string | null }) => ({
  id: person.id,
  login: person.login,
  name: person.name,
});

/** Task 12 of WEB: Jihye owns it, Minsu works on it. */
function task(overrides: Record<string, unknown> = {}) {
  return {
    id: "0199e000-0000-7000-8000-000000000012",
    number: 12,
    title: "Ship the <!channel> page",
    body: "",
    state: "in_progress",
    owner: brief(JIHYE),
    workers: [brief(MINSU)],
    ...overrides,
  };
}

let sequence = 0;
function event(kind: string, data: Record<string, unknown>, actor = HANA): PluginHookEvent {
  sequence += 1;
  return {
    source: "console",
    id: `console:${1000 + sequence}`,
    attempt: 1,
    kind: `console:${kind}`,
    at: NOW.toISOString(),
    plugin: null,
    project: kind.startsWith("agent.") ? null : PROJECT,
    data: { actor: brief(actor), agent: null, ...data },
  };
}

async function ready(
  options: { readonly task?: Record<string, unknown>; readonly now?: () => Date } = {},
) {
  const slack = fakeSlack();
  const made = setup({
    slack,
    caller: MEMBER_MINSU,
    ...(options.now === undefined ? {} : { now: options.now }),
    people: [
      MINSU,
      JIHYE,
      { ...HANA, managerId: null },
      {
        ...HANA,
        id: "0199a000-0000-7000-8000-0000000000a9",
        login: "bot-runner",
        name: "Runner",
        managerId: MINSU.id,
      },
    ],
    board: {
      tasks: { get: async () => task(options.task) },
      decisions: {
        get: async () => ({
          id: DECISION,
          decider: brief(MINSU),
          deciders: [brief(MINSU), brief(JIHYE)],
        }),
      },
      projects: { list: async () => [{ id: PROJECT.id, key: PROJECT.key, name: "Web" }] },
    },
  });
  await connected(made.ctx);
  await linked(made.ctx, MINSU, "U0MINSU01");
  await linked(made.ctx, JIHYE, "U0JIHYE01");
  return { ...made, hook: made.ctx.as(CONSOLE) };
}

/** Whom the direct messages went to, by the account opened. */
const toWhom = (slack: ReturnType<typeof fakeSlack>) =>
  slack.of("conversations.open").map((call) => call.params.users);
const blocksOf = (call: { params: Readonly<Record<string, string>> } | undefined) =>
  call?.params.blocks ?? "";

describe("a task's events", () => {
  it("tells whom a task was given to, in their language, with its address and a button that turns the kind off", async () => {
    const { hook, slack, ctx } = await ready();
    await onOwnWork(hook, event("task.created", { taskId: task().id, number: 12, title: "x" }));
    // Hana made it: Jihye, who owns it, and Minsu, who works on it, are told; Hana is not.
    expect(toWhom(slack).sort()).toEqual(["U0JIHYE01", "U0MINSU01"]);
    const toMinsu =
      slack.of("chat.postMessage")[
        slack.of("conversations.open").findIndex((call) => call.params.users === "U0MINSU01")
      ];
    const blocks = blocksOf(toMinsu);
    expect(blocks).toContain("Park Hana 님이 WEB-12");
    expect(blocks).toContain("https://console.example.test/projects/WEB/tasks/12");
    expect(blocks).toContain("notice-off");
    // What a person wrote is never Slack's markup.
    expect(blocks).not.toContain("<!channel>");
    expect(blocks).toContain("&lt;!channel&gt;");
    expect(toMinsu?.secrets[0]).toEqual({ name: "slackBotToken", key: TEAM, as: "bearer" });
    expect(ctx.all("deliveries")[0]?.data).toMatchObject({ outcome: "sent", note: "told:2" });
  });

  it("tells each event once, however often it is delivered", async () => {
    const { hook, slack } = await ready();
    const once = event("task.moved", {
      taskId: task().id,
      number: 12,
      from: "ready",
      to: "in_review",
    });
    await onOwnWork(hook, once);
    await onOwnWork(hook, { ...once, attempt: 2 });
    // A move is told to whoever owns the task alone.
    expect(toWhom(slack)).toEqual(["U0JIHYE01"]);
    expect(blocksOf(slack.of("chat.postMessage")[0])).toContain("In review");
  });

  it("tells a change only to whoever turned it on, and whom a change put to work as given the task", async () => {
    const { hook, slack, ctx } = await ready();
    await notify.run(ctx, { on: ["changed"] });
    await onOwnWork(
      hook,
      event("task.updated", {
        taskId: task().id,
        number: 12,
        fields: ["title", "workers"],
        workersAdded: [JIHYE.id],
      }),
    );
    const said = slack.of("chat.postMessage").map((call) => blocksOf(call));
    expect(said.some((blocks) => blocks.includes("제목"))).toBe(true);
    expect(said.some((blocks) => blocks.includes("Park Hana gave you WEB-12"))).toBe(true);
    // Jihye, given it, is not told of the change besides; Minsu, who chose changes, is.
    expect(toWhom(slack).sort()).toEqual(["U0JIHYE01", "U0MINSU01"]);
  });

  it("tells nobody what they did themselves, unless their own agent did it and they count it", async () => {
    const { hook, slack, ctx } = await ready({ task: { owner: brief(MINSU), workers: [] } });
    await onOwnWork(
      hook,
      event("task.commented", { taskId: task().id, number: 12, excerpt: "Done" }, MINSU),
    );
    expect(slack.calls).toHaveLength(0);
    await notify.run(ctx, { "own-agents": true });
    await onOwnWork(
      hook,
      event(
        "task.commented",
        { taskId: task().id, number: 12, excerpt: "Done", agent: "claude" },
        MINSU,
      ),
    );
    expect(toWhom(slack)).toEqual(["U0MINSU01"]);
  });

  it("tells nothing of a kind or a project turned off", async () => {
    const { hook, slack, ctx } = await ready();
    await notify.run(ctx, { off: ["commented"] });
    await notify.run(ctx.as(MEMBER_JIHYE), {
      mute: [{ id: PROJECT.id, key: PROJECT.key, name: "Web" }],
    });
    await onOwnWork(
      hook,
      event("task.commented", { taskId: task().id, number: 12, excerpt: "Hi" }),
    );
    expect(slack.calls).toHaveLength(0);
  });

  it("tells in the workspace the project is told in where the person has an account there", async () => {
    const { hook, slack, ctx } = await ready();
    await connected(ctx, "ko", OTHER);
    await linked(ctx, MINSU, "U0MINSU02", null, OTHER.id);
    const record = ctx.all("connections").find((found) => found.data.teamId === OTHER.id);
    await ctx.records("connections").update(record?.id ?? "", { projects: [PROJECT.id] });
    await onOwnWork(hook, event("task.created", { taskId: task().id, number: 12 }));
    const opened = slack
      .of("conversations.open")
      .map((call) => [call.params.users, call.secrets[0]?.key]);
    // Minsu in the project's workspace; Jihye, who has no account there, in the default.
    expect(opened.sort()).toEqual(
      [
        ["U0JIHYE01", TEAM],
        ["U0MINSU02", OTHER.id],
      ].sort(),
    );
  });

  it("tells nobody where Slack is not connected, nor someone with no account", async () => {
    const quiet = setup({ caller: MEMBER_MINSU, board: { tasks: { get: async () => task() } } });
    await onOwnWork(
      quiet.ctx.as(CONSOLE),
      event("task.created", { taskId: task().id, number: 12 }),
    );
    expect(quiet.ctx.all("deliveries")[0]?.data).toMatchObject({
      outcome: "skipped",
      note: "not_connected",
    });
    const { hook, slack, ctx } = await ready({ task: { owner: brief(HANA), workers: [] } });
    // A comment, which Hana is told of unless she says otherwise; she has no account in Slack.
    await onOwnWork(
      hook,
      event("task.commented", { taskId: task().id, number: 12, excerpt: "Hi" }, JIHYE),
    );
    expect(slack.calls).toHaveLength(0);
    expect(ctx.all("deliveries")[0]?.data).toMatchObject({ outcome: "skipped", note: "nobody" });
  });
});

describe("decisions and agent accounts", () => {
  it("tells each decider of a decision raised, with its own address", async () => {
    const { hook, slack } = await ready();
    await onOwnWork(hook, event("decision.raised", { decisionId: DECISION, question: "Ship it?" }));
    expect(toWhom(slack).sort()).toEqual(["U0JIHYE01", "U0MINSU01"]);
    expect(blocksOf(slack.of("chat.postMessage")[0])).toContain(`/decisions/${DECISION}`);
    await onOwnWork(
      hook,
      event("decision.addressed", {
        decisionId: DECISION,
        question: "Ship it?",
        decidersAdded: [JIHYE.id],
      }),
    );
    expect(toWhom(slack).at(-1)).toBe("U0JIHYE01");
    // HR's own decisions are asked in the request's thread, never told here besides.
    const before = toWhom(slack).length;
    await onOwnWork(hook, {
      ...event("decision.raised", { decisionId: DECISION, question: "Leave?" }),
      plugin: "hr",
    });
    expect(toWhom(slack)).toHaveLength(before);
  });

  it("tells a manager their agent account stopped, and ran again, and nothing of a run that goes on", async () => {
    const { hook, slack } = await ready();
    await onOwnWork(
      hook,
      event("agent.state_changed", {
        login: "bot-runner",
        handle: "runner",
        state: "failed",
        was: "running",
        detail: "out of credit",
      }),
    );
    expect(toWhom(slack)).toEqual(["U0MINSU01"]);
    expect(blocksOf(slack.of("chat.postMessage")[0])).toContain("runner");
    expect(blocksOf(slack.of("chat.postMessage")[0])).toContain("out of credit");
    await onOwnWork(
      hook,
      event("agent.state_changed", { login: "bot-runner", state: "running", was: "failed" }),
    );
    await onOwnWork(
      hook,
      event("agent.state_changed", { login: "bot-runner", state: "running", was: "unheard" }),
    );
    expect(toWhom(slack)).toHaveLength(2);
  });
});

describe("the message of the day", () => {
  it("keeps the lines of whoever chose a day's message, and sends them once at their time", async () => {
    const { hook, slack, ctx } = await ready();
    // 01:00 UTC is 10:00 in Seoul.
    await notify.run(ctx, { cadence: "daily", at: "11:30" });
    await onOwnWork(hook, event("task.created", { taskId: task().id, number: 12 }));
    await onOwnWork(hook, event("task.moved", { taskId: task().id, number: 12, to: "done" }));
    expect(toWhom(slack)).toEqual(["U0JIHYE01", "U0JIHYE01"]);
    expect(ctx.all("waiting").map((record) => record.data.personId)).toEqual([MINSU.id]);
    expect(((await notices.run(ctx, {})) as NoticesView).waiting).toBe(1);
    await day.run(hook);
    expect(toWhom(slack)).toHaveLength(2);
    await notify.run(ctx, { at: "09:00" });
    await day.run(hook);
    expect(toWhom(slack)).toHaveLength(3);
    expect(blocksOf(slack.of("chat.postMessage").at(-1))).toContain("오늘의 알림 1건");
    expect(ctx.all("waiting").every((record) => record.archivedAt !== null)).toBe(true);
    await onOwnWork(hook, event("task.created", { taskId: task().id, number: 12 }));
    await day.run(hook);
    // Once a day: the next line waits for tomorrow.
    expect(toWhom(slack).filter((who) => who === "U0MINSU01")).toHaveLength(1);
  });
});

describe("the day due", () => {
  it("is today once its time has come in the zone, else yesterday", () => {
    // 01:00 UTC is 10:00 in Seoul.
    expect(dueDay(NOW, "Asia/Seoul", "09:00")).toBe("2026-11-09");
    expect(dueDay(NOW, "Asia/Seoul", "23:45")).toBe("2026-11-08");
    expect(dueDay(NOW, "UTC", "00:30")).toBe("2026-11-09");
    // A zone the runtime does not know is read as UTC.
    expect(dueDay(NOW, "Nowhere/Else", "02:00")).toBe("2026-11-08");
  });

  it("sends a time later than the job's last run of the day early the next, and counts a day with nothing waiting", async () => {
    let at = NOW;
    const hours = (count: number) => new Date(NOW.getTime() + count * 3_600_000);
    const { hook, slack, ctx } = await ready({ now: () => at });
    const toMinsu = () => toWhom(slack).filter((who) => who === "U0MINSU01").length;
    // Chosen at 10:00 in Seoul for 23:45: today's time has not come, and no run of the job is at it.
    await notify.run(ctx, { cadence: "daily", at: "23:45" });
    await onOwnWork(hook, event("task.created", { taskId: task().id, number: 12 }));
    at = hours(13.5); // 23:30
    await day.run(hook);
    expect(toMinsu()).toBe(0);
    at = hours(14.25); // 00:15 the next day: yesterday's 23:45 has come
    await day.run(hook);
    expect(toMinsu()).toBe(1);
    // That evening nothing waits, and the day counts as sent all the same.
    at = hours(38.25); // 00:15 the day after
    await day.run(hook);
    expect(ctx.all("preferences")[0]?.data.sentOn).toBe("2026-11-10");
    // So a line kept the next afternoon waits for that night's time.
    at = hours(44); // 15:00
    await onOwnWork(hook, event("task.created", { taskId: task().id, number: 12 }));
    await day.run(hook);
    expect(toMinsu()).toBe(1);
    at = hours(62.25); // 00:15 the day after
    await day.run(hook);
    expect(toMinsu()).toBe(2);
  });
});

describe("a delivery tried again", () => {
  it("tells nobody twice where telling someone failed after another was told", async () => {
    let fail = true;
    const slack = fakeSlack({
      "conversations.open": (params) =>
        params.users === "U0MINSU01" && fail
          ? { ok: false, error: "fatal_error" }
          : { ok: true, channel: { id: `D0${params.users}` } },
    });
    const made = setup({
      slack,
      caller: MEMBER_MINSU,
      board: { tasks: { get: async () => task() } },
    });
    await connected(made.ctx);
    await linked(made.ctx, MINSU, "U0MINSU01");
    await linked(made.ctx, JIHYE, "U0JIHYE01");
    const hook = made.ctx.as(CONSOLE);
    const once = event("task.created", { taskId: task().id, number: 12 });
    await expect(onOwnWork(hook, once)).rejects.toBeDefined();
    const failed = made.ctx.all("deliveries")[0]?.data as { outcome: string; told: string[] };
    expect(failed.outcome).toBe("failed");
    expect(failed.told).toEqual([`${JIHYE.id}:assigned`]);
    fail = false;
    await onOwnWork(hook, { ...once, attempt: 2 });
    // Jihye was told on the first try alone; Minsu on the second.
    expect(slack.of("chat.postMessage").map((call) => call.params.channel)).toEqual([
      "D0U0JIHYE01",
      "D0U0MINSU01",
    ]);
    expect(made.ctx.all("deliveries")[0]?.data).toMatchObject({ outcome: "sent", note: "told:2" });
  });
});

describe("notify and notices", () => {
  it("answers the defaults to whoever never chose, and what they chose since", async () => {
    const { ctx } = await ready();
    const before = (await notices.run(ctx, {})) as NoticesView;
    expect(before).toMatchObject({
      chosen: false,
      cadence: "now",
      at: "09:00",
      ownAgents: false,
      timeZone: "Asia/Seoul",
      accounts: [{ teamId: TEAM, teamName: "Acme" }],
    });
    expect(before.kinds).toEqual({
      assigned: true,
      moved: true,
      changed: false,
      commented: true,
      archived: false,
      decisions: true,
      agents: true,
    });
    const said = await notify.run(ctx, {
      off: ["moved"],
      on: ["archived"],
      mute: [{ id: PROJECT.id, key: PROJECT.key, name: "Web" }],
    });
    expect(said.text).toContain("나에게 맡겨진 태스크");
    const after = (await notices.run(ctx, {})) as NoticesView;
    expect(after.kinds.moved).toBe(false);
    expect(after.kinds.archived).toBe(true);
    expect(after.mutedProjects).toEqual([{ id: PROJECT.id, key: "WEB", name: "Web" }]);
    expect(ctx.all("preferences")[0]?.data.personId).toBe(MINSU.id);
    await notify.run(ctx, { reset: true });
    expect(((await notices.run(ctx, {})) as NoticesView).kinds.moved).toBe(true);
  });

  it("refuses a time that is none, a kind both on and off, the console itself, and whoever holds no role", async () => {
    const { ctx } = await ready();
    for (const at of ["9:00", "24:00", "09:60", "nine"]) {
      await expect(notify.run(ctx, { at })).rejects.toMatchObject({ code: "at" });
    }
    await expect(notify.run(ctx, { on: ["moved"], off: ["moved"] })).rejects.toMatchObject({
      code: "both",
    });
    await expect(notify.run(ctx.as(CONSOLE), {})).rejects.toMatchObject({ code: "no_person" });
    await expect(notices.run(ctx.as(STRANGER), {})).rejects.toMatchObject({ code: "forbidden" });
  });

  it("says which workspace a project is told in, and whether the reader is told of it", async () => {
    const { ctx } = await ready();
    const project = { id: PROJECT.id, key: PROJECT.key, name: "Web" };
    const view = (await projectNotices.run(ctx, { key: project })) as ProjectNoticesView;
    expect(view).toMatchObject({
      workspace: { teamId: TEAM, teamName: "Acme", default: true },
      muted: false,
      keeper: false,
    });
  });
});

describe("the button of a message", () => {
  it("turns the kind off for whoever pressed, and says so to them alone", async () => {
    const { ctx, slack } = await ready();
    const press = {
      type: "block_actions",
      user: { id: "U0MINSU01", team_id: TEAM },
      team: { id: TEAM },
      response_url: "https://hooks.slack.com/actions/T0TEST01/1/abc",
      actions: [{ action_id: "notice-off", value: "commented" }],
    };
    await slackEndpoint.run(ctx, signedRequest(press));
    expect(((await notices.run(ctx, {})) as NoticesView).kinds.commented).toBe(false);
    const told = slack.of("response_url")[0]?.json as { text: string; response_type: string };
    expect(told.response_type).toBe("ephemeral");
    expect(told.text).toContain("내 태스크의 댓글");
    // A value that is no kind changes nothing and says nothing.
    await slackEndpoint.run(
      ctx,
      signedRequest({ ...press, actions: [{ action_id: "notice-off", value: "everything" }] }),
    );
    expect(slack.of("response_url")).toHaveLength(1);
  });
});
