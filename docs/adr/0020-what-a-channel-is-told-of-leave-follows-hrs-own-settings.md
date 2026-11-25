# ADR-0020: What a channel is told of leave follows HR's own settings

- Status: Accepted
- Date: 2026-11-25
- Adds to [ADR-0009](0009-a-message-about-a-persons-own-action-is-shown-as-theirs-under-the-apps-mark-and-as-the-plugins-where-nobody-matches.md) and [ADR-0019](0019-what-a-plugin-holds-is-read-door-by-door-by-whoever-its-work-needs-it.md).

## Context

HR decides whether colleagues read the kind of a leave on the calendar, and by default they do not. The messenger told the channels its routes name who is out, when and the kind. Whoever keeps the messenger chooses the channels, and need not be of HR: so a kind HR kept from colleagues, sick leave say, was read by everyone in a channel.

## Decision

1. **What colleagues read of a leave is HR's to decide, wherever they read it.** HR's view of a request says whether they may read the kind (`typeShown`), from the setting that says it for the calendar, and the Setup page says where the setting reaches.
2. **The messenger says the kind in a channel only where they may**, and where an older HR does not say, it does not.
3. **The conversation of the person and whoever decides stays as it was**: both know the kind.

## Consequences

- By default a channel reads who is out and when. HR that wants the kind there shows it to colleagues, on the calendar too.
- A post already made stays as it was written. One cancelled after the setting changed is struck through as the setting is then.
- A plugin that tells of another's data asks the producer what may be said, and takes no setting of its own for it.
- What ADR-0019 proposed to the console of the events a plugin emits is not pursued: that something of a kind happened, and when, stays readable to whoever holds a role of the plugin, and what was emitted before stays its ninety days.
- Rejected: a choice on the route, or in the messenger's settings, by which whoever keeps the messenger would decide what HR decided; never saying the kind, which takes it from an organization that shows it to everyone.
