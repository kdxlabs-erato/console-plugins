# ADR-0018: The messenger has no page on a project, and the workspace each is told in is said on its Connection page

- Status: Accepted
- Date: 2026-11-25
- Amends [ADR-0015](0015-what-a-person-is-told-of-their-own-work-is-theirs-to-choose-on-the-console-and-through-their-agent.md), under which a project page of the messenger's said which workspace the project is told in and gave the messenger its placement on every project.

## Context

The messenger had a tab on every project it is placed on. There a member turned the project off for themselves, and whoever keeps the messenger said which of several Slack workspaces the project is told in ([ADR-0014](0014-several-slack-workspaces-are-one-app-installed-in-each-and-a-project-is-told-in-the-workspace-it-is-for.md)). Turning a project off is the console's since [ADR-0017](0017-the-console-decides-who-is-told-and-the-messenger-sends-on-what-it-told-of-which-each-member-chooses-what-reaches-them.md). What was left for a member was the name of a workspace, and for whoever keeps the messenger a choice there is none of with one workspace, made project by project on as many tabs.

## Decision

1. **The messenger has no page on a project.** Its pages are under Operations: those of the role `messenger`, and My Slack notifications, for every member.
2. **Which workspace each project is told in is said on the Connection page**, beside the workspaces, where there are several: the projects told in another than the default, each with the way back to it, and the way to add one. It is the command `workspace`, as before, and the record stays the messenger's.
3. **The query `project-notices` stays**, for a member's agent that asks where a project is told, and answers that alone.

## Consequences

- A tab leaves every project, and its address answers that nothing is there.
- Whoever keeps the messenger sees every project told elsewhere at once. They see the projects they may see, and how many more there are.
- **The messenger is placed on projects without a page on them**, by what an administrator chose when enabling it; an installation keeps what was chosen. The console hands it the events of those projects by that choice alone. The console's contract names project pages and project records as what puts a plugin on projects, and is proposed to say what the console does.
- Rejected: keeping the tab with the ways to the two pages that choose, which puts a tab on every project for two links; the command alone, which leaves a person no page for it.
