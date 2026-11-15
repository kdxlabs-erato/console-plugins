# ADR-0016: A workspace installed through a link waits until whoever keeps the messenger accepts it

- Status: Accepted
- Date: 2026-11-16
- Adds to [ADR-0014](0014-several-slack-workspaces-are-one-app-installed-in-each-and-a-project-is-told-in-the-workspace-it-is-for.md), whose decision it keeps: the return of an installation is still verified by its state alone.

## Context

ADR-0014 lets whoever may install apps in a workspace install the messenger's app from a link the console gives, with no account on the console, the link good once within a day. A link is text: it is handed on in a chat, pasted into a report, read by an agent. Whoever holds it can install the app in a workspace of their own choosing.

What a workspace says of its members is what the messenger trusts: people are matched to the console's people by the email address the workspace gives each member, a matched account is told of that person's own work (task titles, comments, decisions' questions) and presses buttons that answer decisions as them. A workspace whose administrators set members' addresses, through single sign-on or provisioning, could give its members the addresses of the console's people.

## Decision

1. **An installation in a workspace not connected now waits.** Its connection is `pending`: the bot token is sealed, and nothing else happens there. Nobody is matched, nothing is told, no press is answered, no route names it. Whoever installed it is told, in a line, that it waits.
2. **Whoever keeps the messenger accepts it on the console**, on the Connection page or with `workspace <id> --accept`, once they know the workspace is theirs; or takes the app out of it with `disconnect --workspace <id>`. `status` names the workspaces that wait as the next thing to do. The first workspace accepted is the default.
3. **A workspace connected already, installed again, stays connected.** Its token is renewed and the browser goes on to the app in Slack. A workspace taken away, by `disconnect` or in Slack, waits again when it is installed again.

## Consequences

- The first installation takes one more press, on the console, by whoever made the link: the same person in most organizations, minutes later.
- A link that leaks costs a workspace waiting on the Connection page, which a role holder refuses; it reaches nobody's work.
- An agent may accept a workspace, through the same command a person uses. It should do so only on its person's word, since accepting is what makes a workspace's addresses trusted.
- Rejected: a link bound to a workspace named when it is made, since whoever makes it may not know the workspace's id, and it would still trust that workspace's addresses unseen; matching only addresses of the console's own domains, since an organization's people use addresses of several; an installation that needs a console session, which ADR-0014 rejected so that a workspace's administrator without an account could install the app.
