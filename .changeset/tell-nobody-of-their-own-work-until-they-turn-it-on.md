---
"@skillcdn/console-plugin-messenger": minor
---

Breaking: nobody is told in Slack of their tasks or their decisions until they turn those on. Whoever never chose what they are told is now told of their agent accounts alone (`agents`: one that stopped, was refused or failed, and runs again), and no longer of a task given to them, a task they own moved, a comment on theirs or a decision waiting on them. Until now those were on for everyone from the day the messenger was placed on a project, which sent people, and agent accounts, messages nobody had asked for; an agent account whose runner listens to Slack was woken by each, for what the console wakes it for itself.

Tell your people: each turns on what they want on My notifications, or their agent does with `console plugin messenger notify --on <kind>`. A decision waiting on someone is met on the console until they turn `decisions` on; HR's approvals are asked in Slack as before. Whoever chose before keeps what their record holds, the kinds that were on then among them, and `console plugin messenger notify --reset` puts them on the new defaults. No record changes its shape.
