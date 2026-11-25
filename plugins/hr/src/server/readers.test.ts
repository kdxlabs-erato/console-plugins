// Who reads what of the plugin beside its own queries (docs/adr/0019), held to the code: README.md,
// "Who reads what", says of every collection whom the console's own record routes answer it to, and
// of every command that takes words a person writes which of them the event it leaves hides. A door
// that opens wider, or words nobody decided about, fail here until the table says for whom and why.
import { readFileSync } from "node:fs";
import type { ArgDescription } from "@skillcdn/console/plugin";
import { describe, expect, it } from "vitest";
import plugin from "./index.js";

const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
/** A text of this many characters or more holds what a person writes, and no key or name. */
const WORDS = 200;

/** The rows of the table, each as what its door is named, and to whom it opens. */
function rows(): Map<string, string> {
  const start = readme.indexOf("\n### Who reads what\n");
  expect(start, "README.md has the section Who reads what").toBeGreaterThan(0);
  const rest = readme.slice(start + 1);
  const end = rest.slice(1).search(/\n#{2,3} /);
  const section = end < 0 ? rest : rest.slice(0, end + 1);
  return new Map(
    section
      .split("\n")
      .filter((line) => line.startsWith("| ") && !line.startsWith("| Door "))
      .map((line) => line.split("|").map((cell) => cell.trim()))
      .map((cells) => [cells[1] ?? "", cells[2] ?? ""]),
  );
}

/** The words in backticks of the part of a cell that begins with a label, in order. */
function named(cell: string, label: string | null): string[] {
  return cell
    .split(";")
    .map((part) => part.trim())
    .filter((part) => (label === null ? !part.includes(":") : part.startsWith(`${label}:`)))
    .flatMap((part) => [...part.matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? ""))
    .sort();
}

const isWords = (arg: ArgDescription): boolean =>
  arg.type === "list"
    ? arg.of !== undefined && isWords(arg.of)
    : arg.type === "markdown" || (arg.type === "text" && (arg.max ?? 2000) >= WORDS);

describe("who reads what", () => {
  const table = rows();

  it.each(plugin.collections.map((collection) => [collection.name, collection] as const))(
    "says whom the records of %s are read by",
    (name, collection) => {
      const cell = table.get(`Records of \`${name}\``);
      expect(cell, `README.md names the records of ${name}`).toBeDefined();
      expect(named(cell ?? "", null)).toEqual([...collection.read].sort());
      expect(named(cell ?? "", "one's own")).toEqual([...collection.readOwn].sort());
    },
  );

  it("says of every command's words which the event it leaves hides", () => {
    const found: Record<string, { hidden: string[]; kept: string[] }> = {};
    for (const [name, command] of Object.entries(plugin.commands)) {
      const args = Object.entries(command.args);
      const hidden = args.filter(([, arg]) => arg.secret === true).map(([arg]) => arg);
      const kept = args
        .filter(([, arg]) => arg.secret !== true && isWords(arg))
        .map(([arg]) => arg);
      if (hidden.length + kept.length > 0) {
        found[name] = { hidden: hidden.sort(), kept: kept.sort() };
      }
    }
    const said: typeof found = {};
    for (const [door, cell] of table) {
      const command = /^Words given to `([^`]+)`$/.exec(door)?.[1];
      if (command !== undefined) {
        said[command] = { hidden: named(cell, "hidden"), kept: named(cell, "kept") };
      }
    }
    expect(said).toEqual(found);
  });

  it("names no door the plugin does not have", () => {
    const collections = new Set(plugin.collections.map((collection) => collection.name));
    const gone = [...table.keys()]
      .map((door) => /^Records of `([^`]+)`$/.exec(door)?.[1])
      .filter((name) => name !== undefined && !collections.has(name));
    expect(gone).toEqual([]);
  });
});
