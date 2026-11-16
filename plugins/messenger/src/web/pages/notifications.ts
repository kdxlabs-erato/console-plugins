// A person's own notifications (ADR-0015): what they are told in Slack of their own work, each kind
// a chip, at once or in one message a day at a time of the workspace's zone, whether what their
// own agents did counts, the projects they turned off; where they are told, and what waits for the
// day's message. Saving runs the command `notify`, as their agent would.
import type { PluginFrame } from "@skillcdn/console/plugin/web";
import {
  CADENCES,
  type Cadence,
  NOTICE_KINDS,
  type NoticeKind,
  type NoticesView,
} from "../../shared/contracts.js";
import {
  actions,
  button,
  callout,
  check,
  checks,
  columns,
  errorBlock,
  factsPlain,
  field,
  input,
  muted,
  onSubmit,
  page,
  pageHead,
  panel,
  pills,
  runCommand,
  sequenced,
  settingsForm,
  settingsRow,
  statusLine,
  submitButton,
  toolbar,
  watch,
} from "../ui.js";
import type { Words } from "../words.js";

function build(frame: PluginFrame, words: Words, view: NoticesView): HTMLElement[] {
  const w = words.notifications;
  const main: HTMLElement[] = [];
  const aside: HTMLElement[] = [];
  if (view.accounts.length === 0) {
    main.push(callout(w.noAccount, undefined, "warning"));
  }

  const kinds = checks<NoticeKind>(
    NOTICE_KINDS.map((kind) => ({ value: kind, label: w.kinds[kind] })),
    new Set(NOTICE_KINDS.filter((kind) => view.kinds[kind])),
    w.what,
  );
  const at = input("time", { value: view.at, maxLength: 5 });
  at.classList.add("pl-messenger-field-short");
  const atField = field(w.at, at, w.atHint(view.timeZone));
  atField.hidden = view.cadence !== "daily";
  const cadence = pills<Cadence>(
    CADENCES.map((value) => ({ value, label: w.cadences[value] })),
    view.cadence,
    w.when,
    (chosen) => {
      atField.hidden = chosen !== "daily";
    },
  );
  const ownAgents = check(w.ownAgents, view.ownAgents);
  const said = statusLine();
  const save = submitButton(w.save);
  // Each choice a row of the console's settings form, its name and hint beside its control, so
  // that a short choice stands at a bounded width beside what it is rather than across the pane.
  const node = settingsForm(
    settingsRow(w.what, w.whatHint, kinds.node),
    settingsRow(w.when, undefined, cadence.node, atField),
    settingsRow(w.agents, undefined, ownAgents.node),
    actions(save, said),
  );
  onSubmit(node, async () => {
    const on = kinds.chosen();
    await runCommand(frame, save, said, words, "notify", {
      on,
      off: NOTICE_KINDS.filter((kind) => !on.includes(kind)),
      cadence: cadence.value(),
      ...(cadence.value() === "daily" && at.value.length === 5 ? { at: at.value } : {}),
      "own-agents": ownAgents.checked(),
    });
  });
  main.push(panel(w.choose, node));

  // Where the messages go, and what waits for the day's. With no account the warning above says
  // so already, and the pane keeps only how a place is chosen.
  aside.push(
    panel(
      w.where,
      ...(view.accounts.length === 0
        ? []
        : [
            factsPlain(
              view.accounts.map((account) => [w.workspace, account.teamName ?? account.teamId]),
            ),
          ]),
      muted(w.whereHint),
      ...(view.cadence === "daily" ? [muted(w.waiting(String(view.waiting)))] : []),
    ),
  );
  if (view.mutedProjects.length > 0) {
    const rows = view.mutedProjects.map((project) => {
      const status = statusLine();
      const back = button(
        w.unmute,
        () => {
          void runCommand(frame, back, status, words, "notify", {
            unmute: [project.key ?? project.id],
          });
        },
        "ghost",
        true,
      );
      back.disabled = project.key === null;
      return toolbar(muted(project.name ?? project.key ?? project.id), back, status);
    });
    aside.push(panel(w.muted, ...rows));
  }
  if (view.chosen) {
    const status = statusLine();
    const reset = button(
      w.reset,
      () => {
        void runCommand(frame, reset, status, words, "notify", { reset: true });
      },
      "secondary",
      true,
    );
    aside.push(panel(w.defaults, muted(w.defaultsHint), toolbar(reset), status));
  }
  return [pageHead(w.title, w.lead), columns(main, aside)];
}

export async function renderNotifications(
  root: HTMLElement,
  frame: PluginFrame,
  words: Words,
): Promise<void> {
  const node = page();
  root.replaceChildren(node);
  const draw = sequenced(async (fresh) => {
    let view: NoticesView;
    try {
      view = (await frame.query("notices")) as NoticesView;
    } catch (error) {
      node.replaceChildren(errorBlock(error, words));
      return;
    }
    if (fresh()) {
      node.replaceChildren(...build(frame, words, view));
    }
  });
  await draw();
  watch(frame, draw);
}
