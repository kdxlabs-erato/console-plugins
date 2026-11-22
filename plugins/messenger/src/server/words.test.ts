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
    const args = Array.from({ length: value.length }, () => "일정");
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
    expect(ko.said.routeSaved("r1", "general")).toBe("경로 r1: #general로 보냅니다.");
    expect(ko.said.routeSaved("r1", "dev-team")).toBe("경로 r1: #dev-team으로 보냅니다.");
    expect(ko.said.routeSaved("r1", "휴가")).toBe("경로 r1: #휴가로 보냅니다.");
    expect(ko.said.routeRemoved("r2")).toBe("경로 r2를 지웠습니다.");
    expect(ko.said.accepted("KDX")).toMatch(/^KDX를 수락했습니다\./u);
    expect(ko.said.accepted("Acme Kitchen")).toMatch(/^Acme Kitchen을 수락했습니다\./u);
    expect(ko.refused.unknownChannel("random")).toBe(
      "앱이 볼 수 있는 채널 중에 random이 없습니다.",
    );
    expect(ko.refused.privateNotMember("design")).toMatch(/^#design이 비공개 채널이고/u);
    expect(ko.said.workspaceSaved("Acme", true, "2")).toMatch(/^Acme가 기본 워크스페이스입니다\./u);
  });
});
