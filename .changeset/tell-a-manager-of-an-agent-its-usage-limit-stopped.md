---
"@skillcdn/console-plugin-messenger": minor
---

A manager is told when an agent account of theirs is stopped by its product's usage limit: once, in Slack, as it happens, with when the limit resets, written to each reader in their own time zone, and that the account comes back by itself; and once more when the account has run again for ten minutes. A limit met several times running, the account back for a few minutes each time, or said again by a machine that wakes from its sleep, tells nobody a second time, unless it resets half an hour or more later than the manager was told.

The console says such an account failed, with `usage_limit` for why and the moment the limit resets, and the messenger told that as any failure, the console's word quoted and no moment, each time the account said it. It goes to whom the console told, under their agent accounts (`agent`), at once or in the day's message, and the return is told by the job `unheard`. A new collection, `limits`, keeps what was said of each limit, forgotten 30 days after its last change.
