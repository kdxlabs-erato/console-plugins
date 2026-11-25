# ADR-0019: What a plugin holds is read door by door, by whoever its work needs it

- Status: Accepted; what it proposes to the console is not pursued ([ADR-0020](0020-what-a-channel-is-told-of-leave-follows-hrs-own-settings.md))
- Date: 2026-11-25
- Adds to [ADR-0010](0010-a-plugins-events-and-api-are-its-contract-with-other-plugins-and-a-plugin-calling-for-a-person-is-that-person.md), whose thin event, "the ids and the kind and nothing a holder of its roles may not read", it makes exact.

## Context

A plugin's queries were written to answer what the caller may see, and were tested for it. The console opens other doors to the same data, and those were left as the design found them:

- **The records**, read through the console's own routes by whoever holds a collection's `read` role, whole, and by no project unless the record is linked to one. The messenger's role read there whom a message reached and which task it was of, those of private projects among them, and who asked for leave and how it ended, which HR answers to them and to HR alone.
- **The events a plugin emits**, answered for ninety days to whoever holds any role of it. HR's carried a person's id, and everyone holds HR's `member`: anyone could read that a colleague's leave was asked for, rejected or cancelled and that their balance was changed, whatever HR's settings say.
- **The event every command leaves**, with its arguments, in the board project's feed, for whoever sees the project. The reason of a request, HR's note on a person and an announcement's draft were in it.

None of them showed on a page, and each test of the queries passed.

## Decision

1. **A door is opened to the role whose work needs what is behind it, and to nobody else.** The doors are the records, the queries, the commands' answers, the events emitted, the arguments a command's event keeps, the board (decisions, tasks, documents), the files, the `api`, the log, and what leaves the console; [the conventions](../guide/conventions.md#who-reads-what) say of each who reads it.
2. **A collection names no `read` unless someone reads it there.** Keeping a service is no reason to read what it carries. Where a query answers less than the record, for anyone who holds the role, the record is closed to the role.
3. **An event carries the id of one record, or nothing**: never a person, a name, a key someone chose or a word someone wrote. The id says nothing to whoever may not read the record, and no query answers it to them.
4. **Words a person writes are hidden in the event their command leaves** (`secret`), where the record and the decision have them for those they are for. What is kept there is a choice said in the README.
5. **What is not kept is read by nobody.** A log keeps when, what kind, how it went and why; whom it reached only while a retry needs them, and which thing it was of only where whoever may open that thing looks into a failure.
6. **A plugin's README has "Who reads what"**, a row for each door, and `src/server/readers.test.ts` holds its rows on the records and the words to the definitions, as the contract's test holds the events. A door opened wider, or words nobody decided about, fail until the table says for whom and why.
7. **A door is tried as someone who may not**, in a test and on the preview before a release: a member with no other role, a holder of the role outside a private project, an HR member beside another's draft.

## Consequences

- HR's events, its draft announcements, its hidden arguments and the messenger's records and log change as this says, each a breaking change of the version that is not published yet.
- **What was written before stays**: an event a plugin emitted for ninety days, an argument in a project's feed for good. A plugin can take neither back.
- An event that names nobody still says that something happened, and when. The console is proposed to answer a plugin's events to its frames by their kind alone, or to the roles a plugin names, which closes that too, for what was written before as well.
- An administrator reads every record, and owns every project: this decides nothing about them.
- A role holder who looks into a failure reads how it went, and asks an administrator which thing it was of.
- Rejected: narrowing the messenger's log to the projects its keeper sees, which hides a failure elsewhere from the only one who would look, and needs the project kept; leaving it to review, which read the queries and passed.
