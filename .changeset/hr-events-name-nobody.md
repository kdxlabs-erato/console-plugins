---
"@skillcdn/console-plugin-hr": minor
---

Breaking: HR's events name nobody. The console answers the events a plugin emits to whoever holds any role of it, and everyone holds HR's `member`: so a member could read from them that a colleague's leave was asked for, rejected or cancelled and that HR changed their balance, whatever HR's settings say of who sees what. An event carries the id of one record now, or nothing.

- **The events:** `personId` and `by` are gone from every one; `policy-changed`, `type-changed`, `config-changed` and `person-changed` carry nothing. A plugin that hears them reads the rest through HR's calls, under its own roles. The messenger has always read `requestId` alone.
- **A draft of an announcement is told of to nobody:** no event says one is written, changed or thrown away.
- **What a person writes stays out of the board project's feed.** A command leaves an event with its arguments, which whoever sees the board project reads: the reason of a request and of a cancellation, HR's notes on a person and on an adjustment, and an announcement's title and text are `[hidden]` in it now.
- **The calendar** no longer answers `requestId` with an entry, and the records of `types` are read by HR alone (`console plugin hr records types`); everyone reads the kinds offered with `console plugin hr types`.
- **The People page says who reads a note:** HR alone for the note of a person's record, and the person and whoever may see their balance for an adjustment's.

Events written before this version stay as they were: those a plugin emitted for ninety days, those in the board project's feed for good. The README's "Who reads what" says who reads each part of what HR keeps.
