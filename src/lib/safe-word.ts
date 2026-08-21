export type SafeWordSensitivity = "low" | "normal" | "high";
export type SafeWordSetting = {
  enabled: boolean;
  phrase?: string;
  romanized?: string;
  sensitivity: SafeWordSensitivity;
};

// Higher sensitivity accepts a looser transcription. bn-BD recognition drops or swaps vowel
// signs constantly, so an exact-match-only rule misses far more real emergencies than a fuzzy
// one raises false alarms — and the arming countdown catches the false alarms anyway.
export const SENSITIVITY_THRESHOLD: Record<SafeWordSensitivity, number> = {
  high: 0.72,
  normal: 0.82,
  low: 0.92,
};

/**
 * Strips the differences that Bangla speech recognition introduces run to run: composition
 * form, zero-width joiners (Unicode format characters), punctuation including the danda, and
 * whitespace. Two transcripts of the same phrase should normalize to the same string.
 */
export function normalizeBangla(value: string) {
  return value
    .normalize("NFC")
    .replace(/\p{Cf}/gu, "")
    .replace(/[।,.!?'"()[\]{}\-–—_/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function levenshtein(left: string, right: string) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function similarity(left: string, right: string) {
  const longest = Math.max(left.length, right.length);
  return longest === 0 ? 1 : 1 - levenshtein(left, right) / longest;
}

/**
 * Scores a live transcript against the safe-word. Returns 0 when below threshold, otherwise the
 * match confidence. The transcript is a running stream ("...আমি বললাম নীল আকাশ দেখো"), so the
 * phrase is matched against every window of the same token length rather than the whole string.
 */
export function matchSafeWord(
  heard: string,
  phrase: string,
  sensitivity: SafeWordSensitivity = "normal",
  romanized?: string,
): number {
  const threshold = SENSITIVITY_THRESHOLD[sensitivity];
  const transcript = normalizeBangla(heard);
  if (!transcript) return 0;
  const candidates = [phrase, romanized]
    .filter((value): value is string => Boolean(value && value.trim()))
    .map(normalizeBangla)
    .filter(Boolean);
  let best = 0;
  for (const candidate of candidates) {
    if (transcript.includes(candidate)) return 1;
    const tokens = transcript.split(" ");
    const width = candidate.split(" ").length;
    // Also try one token wider: recognizers often split a compound word into two.
    for (const size of new Set([width, width + 1])) {
      for (let index = 0; index + size <= tokens.length; index += 1) {
        best = Math.max(best, similarity(tokens.slice(index, index + size).join(" "), candidate));
      }
    }
    if (tokens.length < width) best = Math.max(best, similarity(transcript, candidate));
  }
  return best >= threshold ? best : 0;
}
