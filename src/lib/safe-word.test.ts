import { describe, expect, it } from "vitest";
import { levenshtein, matchSafeWord, normalizeBangla } from "./safe-word";

const PHRASE = "নীল আকাশ";

describe("normalizeBangla", () => {
  it("strips zero-width joiners, punctuation and extra whitespace", () => {
    expect(normalizeBangla("নীল‌আকাশ।")).toBe("নীলআকাশ");
    expect(normalizeBangla("  নীল   আকাশ  ")).toBe("নীল আকাশ");
  });

  it("normalizes composition so identical text compares equal", () => {
    expect(normalizeBangla("নীল আকাশ".normalize("NFD"))).toBe(normalizeBangla("নীল আকাশ"));
  });
});

describe("levenshtein", () => {
  it("measures edit distance", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("same", "same")).toBe(0);
    expect(levenshtein("", "abc")).toBe(3);
  });
});

describe("matchSafeWord", () => {
  it("matches the phrase inside a longer running transcript", () => {
    expect(matchSafeWord("আমি বললাম নীল আকাশ দেখো", PHRASE)).toBe(1);
  });

  it("ignores ordinary speech that does not contain the phrase", () => {
    expect(matchSafeWord("আজকে আবহাওয়া খুব সুন্দর", PHRASE)).toBe(0);
    expect(matchSafeWord("আমি বাসায় ফিরছি", PHRASE)).toBe(0);
  });

  it("tolerates a near-miss transcription at normal sensitivity", () => {
    // A dropped vowel sign is the single most common bn-BD recognition slip.
    expect(matchSafeWord("নিল আকাশ", PHRASE, "normal")).toBeGreaterThan(0);
  });

  it("rejects at low sensitivity what it accepts at high", () => {
    const heard = "নিল আকশ";
    expect(matchSafeWord(heard, PHRASE, "high")).toBeGreaterThan(0);
    expect(matchSafeWord(heard, PHRASE, "low")).toBe(0);
  });

  it("matches a romanized transcript when an alias is configured", () => {
    expect(matchSafeWord("i said nil akash now", PHRASE, "normal", "nil akash")).toBe(1);
    expect(matchSafeWord("i said nil akash now", PHRASE, "normal")).toBe(0);
  });

  it("returns 0 for an empty transcript", () => {
    expect(matchSafeWord("", PHRASE)).toBe(0);
    expect(matchSafeWord("   ", PHRASE)).toBe(0);
  });
});
