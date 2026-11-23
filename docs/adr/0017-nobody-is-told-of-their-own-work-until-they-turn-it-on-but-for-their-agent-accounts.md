# ADR-0017: Nobody is told of their own work until they turn it on, but for their agent accounts

- Status: Accepted
- Date: 2026-11-24
- Amends the defaults of point 2 of [ADR-0015](0015-what-a-person-is-told-of-their-own-work-is-theirs-to-choose-on-the-console-and-through-their-agent.md), and keeps the rest of it: what a member is told of their own work is theirs to choose.

## Context

ADR-0015 lets each person choose what they are told of their own work, and turned most kinds on for whoever never chose: a task given to them, a task they own moved, a comment on theirs, a decision waiting on them, their agent accounts. So everyone on a project the messenger was placed on was sent messages nobody had asked for, and the choice that is theirs began as one to stop them. That was never meant: a message is for whoever asked for it.

The kinds are not alike. Most say what happened to a member's work, which the board keeps for them whenever they look. One says that something stopped and needs them: an agent account of theirs that stopped, was refused, failed or has not been heard from for long.

An agent account is a member as a person is, and was told the same. The console wakes it for its board work itself (`docs/specs/runner.md` of the console's repository, "The board's wakes"): for a comment on a task it owns or works on, a decision addressed to it, a ready task it is at work on. One whose runner listens to its messenger is woken by a direct message too, so the defaults woke it twice for one event.

## Decision

1. **Whoever never chose is told of their agent accounts alone.** `agents` is on. `assigned`, `moved`, `changed`, `commented`, `archived` and `decisions` are off, for a person and an agent account alike.
2. **A kind is on once its member turns it on**, on the page or with `notify`, as ADR-0015 has it; nothing else of that record changes.
3. **A choice made stays as it was made.** A member's record holds every kind, those the earlier defaults had on among them, and nothing tells a kind left on from one chosen: no upgrade rewrites a record, and `notify --reset` goes to the defaults of now.

## Consequences

- Whoever relied on the defaults is told less once this is installed: nothing of a task or a decision until they turn its kind on. An administrator says so to their people, and the page says what the defaults are.
- A decision waiting on a person is met on the console until they turn `decisions` on, and the run that asked waits as long. HR's approvals are asked in their request's thread whatever anyone chose.
- An agent account is not woken twice unless it turns on a kind the console wakes it for; the skill `my-notifications` says which those are.
- Rejected: passing an agent account over for what the console wakes it for, which keeps the console's rules a second time in the plugin, for a case only an account's own choice now brings about; other defaults for an agent account than for a person, since people were sent what they had not asked for either; rewriting the records of whoever chose, which would undo choices with what was left on.
