---
name: my-notifications
description: "Chooses what a person is told in Slack of their own work through the console's messenger: tasks given to them, their tasks moved, changed, commented or put away, decisions waiting on them, their agent accounts; at once or in one message a day; per project. Use when a person asks to get or stop Slack messages about their tasks, to get them once a day, or why a message about their work did not reach them."
license: MIT
metadata:
  author: skillcdn
skillcdn:
  translations:
    ko:
      title: "내 알림"
      description: "콘솔의 메신저로 내 일 가운데 무엇을 Slack으로 받을지 정합니다. 맡겨진 작업, 내 작업의 상태 이동·변경·댓글·보관, 나를 기다리는 결정, 내 에이전트 계정을 그때그때 또는 하루 한 번, 프로젝트마다 고릅니다. Slack으로 내 작업 소식을 받거나 끄고 싶을 때, 하루 한 번 모아 받고 싶을 때, 내 일의 메시지가 왜 안 왔는지 물을 때 쓰세요."
---
# Choosing what you are told of your own work

The messenger tells each person, in a direct message in Slack, of what happens to their own work on the console, as they choose. A person chooses on the messenger's page My notifications, or their agent chooses for them with the same command; both are the person's own choice and nobody else's. Whoever made a change is never told of it.

## Commands

| Do | Command |
|---|---|
| See what you are told, when, of which projects nothing, and where | `console plugin messenger notices` |
| Turn kinds on or off | `console plugin messenger notify [--on <kind>]... [--off <kind>]...` |
| Be told nothing of a project, or again | `console plugin messenger notify [--mute <project>]... [--unmute <project>]...` |
| Be told at once, or in one message a day at a time | `console plugin messenger notify --cadence now` · `console plugin messenger notify --cadence daily --at 09:00` |
| Count what your own agents did for you, or stop | `console plugin messenger notify --own-agents` · `console plugin messenger notify --own-agents=false` |
| Go back to the defaults | `console plugin messenger notify --reset` |
| See which workspace a project is told in | `console plugin messenger project-notices <project>` |

The kinds: `assigned` (a task given to you), `moved` (a task you own moved), `changed` (a task of yours changed: its title, body or days), `commented` (a comment on a task of yours), `archived` (a task of yours put away), `decisions` (a decision waiting on you), `agents` (your agent accounts stopping, refused, failing, and running again). Unless chosen: `assigned`, `moved`, `commented`, `decisions` and `agents` on, the rest off, at once, your own agents not counted.

## What to know

- The time of the day's message is `HH:MM` in the workspace's time zone, which `notices` says; the message goes within five minutes after (six on a console before 0.5.3).
- A message goes in the Slack workspace the project is told in where the person has an account there, else the default one, else another they have one in. `notices` lists the workspaces they have an account in; none means nothing reaches them, and the usual reason is that their address in Slack is not the one the console knows for them.
- A project is told only where the messenger is placed on it; `project-notices` says which workspace it is told in.
- A message says what happened first, then who did it, and under it the task or the decision by its name, which is the link to it on the console. The day's message says each task, decision or agent account once, with everything that happened to it since the last, what waits on the person first.
- A message sent at once has a button that turns its kind off; the page and `notify` turn it on again.

## Rules

- Choose only what the person asked for: their messages are theirs to choose.
- Nothing here sends a message: what is told follows from what happened on the console.
