# Start here

The page an agent reads first, before a task. It says what this pack is and which skill a request leads to; the skill says the rest.

This pack holds the reference plugins of the [SkillCDN Console](https://github.com/skillcdn/console), HR and Messenger, with the five skills an agent works them by, and the documents of the repository that keeps them: how a plugin is shaped here, written, looked at on a console of one's own machine and released.

## Which skill

Load the one the request names, and follow it to its end before acting on it. Each works only on a console where its plugin is installed and enabled: `console plugins` says which are, and `console plugin <key>` the roles the person holds in one.

| The person says | Skill | What comes out |
|---|---|---|
| "Can I take Friday off?", "how many days do I have left?", "who is out next week?", "what did HR announce?"; a manager: "approve Minsu's leave" | `plugins/hr/skills/hr` | Leave requested or cancelled for the person, as a decision for whoever approves it; a balance, who is out, the holidays, the announcements; a manager's answer, given with `console answer`. |
| "Set leave up for Korea", "add Jihye, hired in March", "change who approves sick leave", "fix Minsu's balance", "Minsu leaves on the 31st" | `plugins/hr/skills/hr-administration` | HR's rules of leave, the people enrolled, the balances and the ledger, a leaver settled, the year exported. |
| "Post the year-end holidays", "pin it", "take it down" | `plugins/hr/skills/hr-announcements` | An announcement drafted, published, pinned, changed or removed. |
| "Connect our Slack", "send approved leave to #people", "why does Jihye get no messages?" | `plugins/messenger/skills/messenger` | The Slack app made and installed, the routes of each plugin's events, people matched to their accounts, what was sent and why something was not. |
| "Tell me in Slack when a task is given to me", "only once a day", "stop the messages about this project" | `plugins/messenger/skills/my-notifications` | What the person is told in Slack of their own work, at once or once a day, per project. |

A request for an area no plugin here takes over yet, customers or money, has no skill: say so, and that [the roadmap](roadmap.md) names it as planned.

## Two ways to read this pack

- **Through a connection of the host.** The tools the connection names: search for a skill, load it by its path, read a file it links, browse a folder.
- **Through the console the plugin runs on**, with the `console` command: `console plugin <key> skills` prints the skills of the version installed there, which are the ones to follow on that console, since this pack may already be a version ahead of it.

In a checkout, run `console whoami` before the first step. Where it names a project, the work goes through that console's board, under its rules (`console rules`).

## Writing or changing a plugin

No skill of this pack writes one: the console's skill `building-a-plugin` does, in the console's pack and in `@skillcdn/console` (`node_modules/@skillcdn/console/skills/building-a-plugin/SKILL.md`). What this repository asks on top of it is in [the working agreement](../AGENTS.md) and [the guide](guide/README.md): [adding a plugin](guide/adding-a-plugin.md), [the conventions](guide/conventions.md), [a console on this machine](guide/local-console.md) and [releasing](guide/releasing.md).

## What the skills stand on

A skill is a map. Where it and one of these differ, these are right.

| Document | What it settles |
|---|---|
| [HR's README](../plugins/hr/README.md) | What HR does, row by row: its commands, records, decisions, hooks, jobs and pages, what an administrator enables, and its contract with other plugins. |
| [Messenger's README](../plugins/messenger/README.md) | The same for Messenger, and how it reads HR. |
| [The console's specification of plugins](https://github.com/skillcdn/console/blob/main/docs/specs/plugins.md) | The contract every plugin is held to: its manifest, capabilities, records, pages and refusals. |
| [The roadmap](roadmap.md) | What exists, what is being built and what comes next. |
| [The decisions](adr/README.md) | Why the plugins and this repository are as they are. |
