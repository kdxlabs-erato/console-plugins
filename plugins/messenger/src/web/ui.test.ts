// An instant on the pages, by the console's one rule: the year only where it is not this one.
import { describe, expect, it } from "vitest";
import { DASH, dateTimeIn } from "./ui.js";

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
