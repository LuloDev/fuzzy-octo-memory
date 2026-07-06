// Server-side truncation of potentially large JSON payloads so the dashboard
// poll at 30s doesn't blow past the wire size budget (US4 acceptance #2).

const DEFAULT_MAX_BYTES = 8_192;

export type Truncated<T> = T | { _truncated: true; bytes: number; preview: T };

// Pure. Serializes the value and, if larger than maxBytes, returns a wrapper
// carrying the byte count and a 2 KB preview (the first slice of the parsed
// tree, re-stringified). The caller MUST treat the result with the
// discriminated union `Truncated<T>`.
export function truncateIfLarge<T>(value: T, maxBytes = DEFAULT_MAX_BYTES): Truncated<T> {
  if (value === null || value === undefined) return value;
  let str: string;
  try {
    str = JSON.stringify(value);
  } catch {
    return value;
  }
  if (str.length <= maxBytes) return value;

  // Build a preview: take the first ~2 KB of the serialized form and parse it
  // back so the wrapper's `preview` is still structured JSON, not a raw slice.
  const previewStr = str.slice(0, 2_048);
  let preview: unknown;
  try {
    preview = JSON.parse(previewStr);
  } catch {
    // Mid-string slice often cuts through a string literal; fall back to the
    // raw slice so the operator at least sees *something*.
    preview = previewStr;
  }
  return { _truncated: true, bytes: str.length, preview: preview as T };
}