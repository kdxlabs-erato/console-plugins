// An instant on the pages, by the console's one rule: the year only where it is not this one; and
// a page drawn again after a command of its own.
import type { PluginFrame } from "@skillcdn/console/plugin/web";
import { describe, expect, it } from "vitest";
import { DASH, dateTimeIn, runCommand, runInPlace, watch } from "./ui.js";
import { wordsFor } from "./words.js";

// Built from the parts of the clock that runs the test, so that the hour reads the same anywhere.
const now = new Date(2026, 10, 17, 9, 0);
const thisYear = new Date(2026, 10, 16, 14, 4).toISOString();
const nextYear = new Date(2027, 1, 6, 9, 30).toISOString();

describe("an instant as the pages write it", () => {
  it("leaves the year out of an instant of this year", () => {
    expect(dateTimeIn("ko", now)(thisYear)).toBe("11월 16일 오후 2:04");
    expect(dateTimeIn("en", now)(thisYear)).toBe("Nov 16, 2:04 PM");
  });

  it("says the year of an instant of another year", () => {
    expect(dateTimeIn("ko", now)(nextYear)).toBe("2027년 2월 6일 오전 9:30");
    expect(dateTimeIn("en", now)(nextYear)).toBe("Feb 6, 2027, 9:30 AM");
  });

  it("writes a dash for none, and what it was given for what is no instant", () => {
    expect(dateTimeIn("ko", now)(null)).toBe(DASH);
    expect(dateTimeIn("ko", now)("soon")).toBe("soon");
  });

  it("reads a language it does not know as English", () => {
    expect(dateTimeIn("not a tag", now)(thisYear)).toBe("Nov 16, 2:04 PM");
  });
});

describe("a command a page runs", () => {
  // A page outside a project hears no event of a command, so the frame here says none.
  const told: string[] = [];
  let answer: () => Promise<{ readonly text: string }> = async () => ({ text: "done" });
  const frame = {
    command: async (name: string) => {
      told.push(name);
      return answer();
    },
    onEvent: () => () => undefined,
  } as unknown as PluginFrame;
  const trigger = () => ({ disabled: false }) as unknown as HTMLButtonElement;
  const line = () =>
    ({ textContent: "", className: "", dataset: {}, isConnected: true }) as unknown as HTMLElement;
  const words = wordsFor("en");

  it("draws the page again where it went through, and says the answer", async () => {
    let drawn = 0;
    watch(frame, async () => {
      drawn += 1;
    });
    const status = line();
    expect(await runCommand(frame, trigger(), status, words, "notify")).toEqual({ text: "done" });
    expect(drawn).toBe(1);
    expect(status.textContent).toBe("done");
  });

  it("draws nothing again where it was refused, the refusal left to be read", async () => {
    let drawn = 0;
    watch(frame, async () => {
      drawn += 1;
    });
    answer = async () => {
      throw new Error("The time is HH:MM.");
    };
    const status = line();
    expect(await runCommand(frame, trigger(), status, words, "notify")).toBeNull();
    expect(drawn).toBe(0);
    expect(status.textContent).toBe("The time is HH:MM.");
    answer = async () => ({ text: "done" });
  });

  it("leaves the page as it stands where the command changes nothing on it", async () => {
    let drawn = 0;
    watch(frame, async () => {
      drawn += 1;
    });
    const status = line();
    await runInPlace(frame, trigger(), status, words, "test");
    expect(drawn).toBe(0);
    expect(status.textContent).toBe("done");
  });
});
