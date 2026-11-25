// The events the plugin emits, in one place: its contract with the plugins that read them
// (ADR-0010), written in README.md, "The contract", and held to it by contract.test.ts. The console
// answers them, ninety days back, to whoever holds any role of the plugin, and `member` is
// everyone's: so an event is the id of one record, which says nothing to whoever may not read that
// record, or nothing at all, and never a person, a name or what HR chose (ADR-0019). Whoever hears
// it asks for the rest through the plugin's api, under its own roles.
import type { PluginContext } from "@skillcdn/console/plugin";

/** Each kind with the fields of its data, in the order README.md lists them. */
export const EVENTS = {
  "leave-requested": ["requestId"],
  "leave-recorded": ["requestId"],
  "leave-advanced": ["requestId"],
  "leave-approved": ["requestId"],
  "leave-rejected": ["requestId"],
  "leave-returned": ["requestId"],
  "leave-cancelling": ["requestId"],
  "leave-cancelled": ["requestId"],
  "leave-kept": ["requestId"],
  "balance-adjusted": ["entryId"],
  "person-changed": [],
  "policy-changed": [],
  "type-changed": [],
  "holidays-changed": ["year"],
  "config-changed": [],
  "announcement-published": ["id"],
  "announcement-changed": ["id"],
} as const;

export type EventKind = keyof typeof EVENTS;

type FieldOf<K extends EventKind> = (typeof EVENTS)[K][number];

/** What a field holds: an id is a text, the year a number. */
type ValueOf<F extends string> = F extends "year" ? number : string;

export type EventData<K extends EventKind> = { readonly [F in FieldOf<K>]: ValueOf<F> };

/** Emits an event of the contract, its data no more and no less than the contract names. */
export async function emit<K extends EventKind>(
  ctx: PluginContext,
  kind: K,
  data: EventData<K>,
): Promise<void> {
  await ctx.events.emit(kind, data);
}
