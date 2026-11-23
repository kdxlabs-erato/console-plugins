---
"@skillcdn/console-plugin-messenger": minor
---

A manager is told when an agent account of theirs has not been heard from for half an hour: once, in Slack, with what to look at (its machine on and awake, its account logged in there), and once more when the account has run again for ten minutes. Until now only an account that stopped, was refused or failed was told, so that a machine that slept over a weekend said nothing. An account that drops out for a few minutes and comes back, as a sleeping machine does when it wakes by itself, tells nobody anything.

It comes under the kind a manager already chooses, their agent accounts (`agents`), at once or in the day's message, and whoever turned that kind off is told nothing. The silence is counted from the console's own word that an account is unheard, which it says five minutes after the runner's last sign, by a new job, `unheard`, every five minutes, so the message comes 35 to 40 minutes after the last sign. A new collection, `silences`, keeps the accounts that are unheard; the records that exist are untouched and the data version stays 3. An account already unheard when this version is installed is told from its next silence on.
