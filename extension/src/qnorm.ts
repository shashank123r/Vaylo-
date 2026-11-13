// Shared question normalization, used IDENTICALLY by the extension (to look up a
// field's answer) and the server (to key/store it), so phrasing variants collapse
// to one answer-bank entry. Pure, no deps — safe to import from both sides.
export function normalizeQuestion(q: string): string {
  return (q || "")
    .toLowerCase()
    .replace(/\(\s*optional\s*\)/g, " ") // "(optional)"
    .replace(/[*•]/g, " ") // required markers / bullets
    .replace(/^\s*(please|kindly)\s+/i, "") // leading politeness
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[?:.!,;]+$/g, "") // trailing punctuation
    .trim();
}
