// Display helpers for the signal light (红绿灯) three-counter model.
// The pi hook reports the full cwd as the session id; these helpers turn it
// into a friendly display name. No terminal binding — the three-counter
// design is deliberately session-list based, not terminal-based.

/** Last path segment of a POSIX/Windows path ("C:/a/b" → "b"). */
function pathBasename(p: string): string {
  const normalized = p.replace(/\\/g, "/").replace(/\/+$/, "");
  const idx = normalized.lastIndexOf("/");
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

/**
 * Friendly display name for a signal session id (a full cwd path). Falls back
 * to the last path segment when the session looks like a path; passes through
 * plain names untouched.
 */
export function displaySessionName(session: string): string {
  const cleaned = session.trim();
  if (!cleaned) return "未知会话";
  if (cleaned.includes("/") || cleaned.includes("\\")) {
    return pathBasename(cleaned);
  }
  return cleaned;
}
