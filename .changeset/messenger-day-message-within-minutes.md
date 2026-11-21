---
"@skillcdn/console-plugin-messenger": patch
---

The page My notifications says the day's message goes within a few minutes after its time, where it said within five, which a console before 0.5.3 did not keep: it counted a job's next run from the end of its last, so that the job that sends the message ran six minutes apart. Nothing else changes.
