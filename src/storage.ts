// localStorage boundary. Load and save are independent so a read failure and a
// write failure surface as distinct causes.
import type { Show } from "./domain";
import { isValidShow } from "./domain";

const KEY = "gig-bag:shows";

// Minimal storage surface so tests can inject an in-memory stub.
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type LoadResult =
  | { status: "ok"; shows: Show[]; skipped: number }
  | { status: "corrupt" }
  | { status: "unavailable" };

export type SaveResult = { ok: true } | { ok: false; reason: "quota" | "unavailable" };

/** Corrupt JSON -> "corrupt"; storage throwing -> "unavailable"; invalid entries dropped, counted in `skipped`. */
export function loadShows(storage: StorageLike = localStorage): LoadResult {
  let raw: string | null;
  try {
    raw = storage.getItem(KEY);
  } catch {
    return { status: "unavailable" };
  }
  if (raw === null) return { status: "ok", shows: [], skipped: 0 };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "corrupt" };
  }
  if (!Array.isArray(parsed)) return { status: "corrupt" };

  const shows: Show[] = [];
  let skipped = 0;
  for (const item of parsed) {
    if (isValidShow(item)) shows.push(item);
    else skipped += 1;
  }
  return { status: "ok", shows, skipped };
}

/** Persist shows, distinguishing a full quota from blocked storage (e.g. private mode). */
export function saveShows(shows: readonly Show[], storage: StorageLike = localStorage): SaveResult {
  try {
    storage.setItem(KEY, JSON.stringify(shows));
    return { ok: true };
  } catch (err) {
    // One catch handles ALL write failures; the branch only picks the message.
    const quota =
      err instanceof DOMException &&
      (err.name === "QuotaExceededError" || err.code === 22 || err.name === "NS_ERROR_DOM_QUOTA_REACHED");
    return { ok: false, reason: quota ? "quota" : "unavailable" };
  }
}
