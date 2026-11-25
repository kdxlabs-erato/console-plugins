// A project's own page of the messenger (ADR-0014): the Slack workspace the project is told in,
// which whoever keeps the messenger may change with the command `workspace`. What a member is told
// of the project is the console's to say, and which of it reaches Slack their own page's.
import type { PluginFrame } from "@skillcdn/console/plugin/web";
import type { ProjectNoticesView } from "../../shared/contracts.js";
import {
  badge,
  button,
  callout,
  errorBlock,
  factsPlain,
  field,
  muted,
  page,
  pageHead,
  panel,
  runCommand,
  select,
  sequenced,
  statusLine,
  toolbar,
  watch,
} from "../ui.js";
import type { Words } from "../words.js";

/** The value of the choice that sends a project back to the default workspace. */
const DEFAULT = "";

function build(frame: PluginFrame, words: Words, view: ProjectNoticesView): HTMLElement[] {
  const w = words.project;
  const key = view.project?.key ?? frame.context.project?.key ?? "";
  const parts: HTMLElement[] = [pageHead(w.title, w.lead)];
  if (view.workspace === null) {
    parts.push(callout(w.notConnected.title, w.notConnected.body, "warning"));
    return parts;
  }
  const where = view.workspace.teamName ?? view.workspace.teamId;
  const whereNode = document.createElement("span");
  whereNode.append(where, " ");
  if (view.workspace.default) {
    whereNode.append(badge(w.byDefault, "neutral"));
  }
  parts.push(panel(w.here, factsPlain([[w.workspace, whereNode]]), muted(w.hint)));
  // Whoever keeps the messenger says which workspace the project is told in, where there are several.
  if (view.keeper && view.workspaces.length > 1) {
    const chosen = select(
      [
        { value: DEFAULT, label: w.theDefault },
        ...view.workspaces.map((found) => ({
          value: found.teamId,
          label: found.teamName ?? found.teamId,
        })),
      ],
      view.workspace.default ? DEFAULT : view.workspace.teamId,
    );
    const status = statusLine();
    const save = button(w.save, () => {
      const team = chosen.value === DEFAULT ? view.workspace?.teamId : chosen.value;
      if (team === undefined) {
        return;
      }
      void runCommand(
        frame,
        save,
        status,
        words,
        "workspace",
        chosen.value === DEFAULT ? { team, remove: [key] } : { team, add: [key] },
      );
    });
    parts.push(panel(w.choose, field(w.workspace, chosen, w.chooseHint), toolbar(save), status));
  }
  return parts;
}

export async function renderProject(
  root: HTMLElement,
  frame: PluginFrame,
  words: Words,
): Promise<void> {
  const node = page();
  root.replaceChildren(node);
  const project = frame.context.project?.key;
  const draw = sequenced(async (fresh) => {
    let view: ProjectNoticesView;
    try {
      view = (await frame.query("project-notices", { key: project })) as ProjectNoticesView;
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
