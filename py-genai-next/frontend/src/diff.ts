// Word-level diff via longest-common-subsequence. Returns runs tagged
// "same" | "add" | "del" for rendering a two-response comparison.
export type DiffPart = { type: "same" | "add" | "del"; text: string };

function tokenize(s: string): string[] {
  // Keep whitespace as its own tokens so re-joining preserves spacing.
  return s.match(/\s+|[^\s]+/g) || [];
}

export function wordDiff(a: string, b: string): DiffPart[] {
  const A = tokenize(a);
  const B = tokenize(b);
  const n = A.length, m = B.length;

  // LCS length table (rolling would save memory; these strings are small).
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const parts: DiffPart[] = [];
  const push = (type: DiffPart["type"], text: string) => {
    const last = parts[parts.length - 1];
    if (last && last.type === type) last.text += text;
    else parts.push({ type, text });
  };

  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { push("same", A[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { push("del", A[i]); i++; }
    else { push("add", B[j]); j++; }
  }
  while (i < n) push("del", A[i++]);
  while (j < m) push("add", B[j++]);
  return parts;
}

// Two-sided view (py-genai style): the left keeps a's words with deletions
// highlighted; the right keeps b's words with additions highlighted.
export function diffSides(a: string, b: string): { left: DiffPart[]; right: DiffPart[] } {
  const parts = wordDiff(a, b);
  return {
    left: parts.filter((p) => p.type !== "add"),
    right: parts.filter((p) => p.type !== "del"),
  };
}
