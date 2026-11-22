// A Korean sentence that carries a name writes the particle in the one form the name takes, as the
// console's own Korean does (the console's ADR-0137), and never both forms.
import { describe, expect, it } from "vitest";
import { wordsFor } from "../web/words.js";
import { serverWords } from "./words.js";

const BOTH_FORMS = /\((을|를|이|가|은|는|으)\)/u;

/** Every text a pack of words can say, its functions called with a name in every place. */
function textsOf(value: unknown, depth = 0): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (typeof value === "function") {
    const args = Array.from({ length: value.length }, () => "연차");
    try {
      return textsOf(value(...args), depth + 1);
    } catch {
      // A function that takes something other than a word is read by the cases below.
      return [];
    }
  }
  if (value !== null && typeof value === "object" && depth < 4) {
    return Object.values(value).flatMap((entry) => textsOf(entry, depth + 1));
  }
  return [];
}

describe("the particle after a name in Korean", () => {
  const ko = serverWords("ko");

  it("is never written in both forms", () => {
    const server = textsOf(ko);
    const pages = textsOf(wordsFor("ko"));
    expect(server.length).toBeGreaterThan(100);
    expect(pages.length).toBeGreaterThan(100);
    expect(server.filter((text) => BOTH_FORMS.test(text))).toEqual([]);
    expect(pages.filter((text) => BOTH_FORMS.test(text))).toEqual([]);
  });

  it("takes the form of how the name ends", () => {
    expect(ko.typeSaved("sick")).toBe("휴가 종류 sick을 저장했습니다.");
    expect(ko.policySaved("kr-fiscal-year")).toBe("규정 kr-fiscal-year를 저장했습니다.");
    expect(ko.holidaySaved("2026-12-25")).toBe("공휴일 2026-12-25를 저장했습니다.");
    expect(ko.refused.unknownType("family")).toBe("휴가 종류 family가 없습니다.");
    expect(ko.refused.unknownPolicy("kr-hire-date")).toBe("규정 kr-hire-date가 없습니다.");
    expect(ko.offboarded("김민수", "2026-12-31")).toBe(
      "김민수가 2026-12-31에 퇴직합니다. 그 뒤로는 발생하지 않습니다.",
    );
    expect(ko.announcementPublished("연말 일정", "a1")).toBe(
      '"연말 일정"을 게시했습니다. 공지 a1.',
    );
    expect(ko.announcementRemoved("겨울 휴무 안내")).toBe('"겨울 휴무 안내"를 삭제했습니다.');
    expect(ko.refused.partNotTaken("연차")).toBe("연차를 그 단위로 쓸 수 없습니다.");
    expect(ko.refused.reasonRequired("병가")).toBe("병가에는 사유를 적어야 합니다.");
    expect(ko.refused.tiersShape("1:15x")).toContain('"1:15x"가 맞지 않습니다.');
    expect(wordsFor("ko").requestedVia("메신저")).toBe("메신저를 통해 신청");
  });

  it("reads a login as Korean reads a loan word", () => {
    expect(ko.readback.monthlyFrom("kr-hire-date", "minsu")).toContain(
      "recount minsu로 이미 쓴 줄을 되돌리세요.",
    );
    expect(ko.readback.monthlyFrom("kr-hire-date", "kim")).toContain(
      "recount kim으로 이미 쓴 줄을 되돌리세요.",
    );
  });
});
