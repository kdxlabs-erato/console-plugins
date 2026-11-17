// A day and an instant on the pages, by the console's one rule: the month in short and the day,
// the hour and the minute after an instant's, and the year only where it is not this one.
import { describe, expect, it } from "vitest";
import { formattersFor, spanText } from "./ui.js";
import { wordsFor } from "./words.js";

// Built from the parts of the clock that runs the test, so that the hour reads the same anywhere.
const now = new Date(2026, 10, 17, 9, 0);
const korean = formattersFor("ko", wordsFor("ko"), now);
const english = formattersFor("en", wordsFor("en"), now);

describe("a day as the pages write it", () => {
  it("leaves the year out of a day of this year", () => {
    expect(korean.day("2026-11-16")).toBe("11월 16일");
    expect(english.day("2026-11-16")).toBe("Nov 16");
  });

  it("says the year of a day of another year", () => {
    expect(korean.day("2027-02-06")).toBe("2027년 2월 6일");
    expect(english.day("2027-02-06")).toBe("Feb 6, 2027");
    expect(korean.day("2025-12-31")).toBe("2025년 12월 31일");
  });

  it("never says the year of a day under a heading that says it", () => {
    expect(korean.monthDay("2027-02-06")).toBe("2월 6일");
  });

  it("writes what is no day as it was given", () => {
    expect(korean.day("2026-02-30")).toBe("2026-02-30");
    expect(korean.day("soon")).toBe("soon");
  });
});

describe("an instant as the pages write it", () => {
  it("leaves the year out of an instant of this year", () => {
    const at = new Date(2026, 10, 16, 14, 4).toISOString();
    expect(korean.dateTime(at)).toBe("11월 16일 오후 2:04");
    expect(english.dateTime(at)).toBe("Nov 16, 2:04 PM");
  });

  it("says the year of an instant of another year", () => {
    const at = new Date(2027, 1, 6, 9, 30).toISOString();
    expect(korean.dateTime(at)).toBe("2027년 2월 6일 오전 9:30");
  });
});

describe("a span of leave as the pages write it", () => {
  const words = wordsFor("ko");

  it("keeps the year of a day only where it is not this year", () => {
    expect(spanText("2026-11-26", "2026-11-27", "none", korean, words)).toBe(
      "11월 26일 ~ 11월 27일",
    );
    expect(spanText("2026-12-30", "2027-01-04", "none", korean, words)).toBe(
      "12월 30일 ~ 2027년 1월 4일",
    );
  });

  it("names the part of one day after it", () => {
    expect(spanText("2026-12-04", "2026-12-04", "am", korean, words)).toBe(
      `12월 4일 (${words.partOption.am})`,
    );
  });
});
