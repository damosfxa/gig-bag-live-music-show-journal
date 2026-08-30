import { describe, it, expect } from "vitest";
import {
  formatDate, isRealCalendarDate, isValidShow, mostSeenArtist, sortByDateDesc,
  tidy, tidyNotes, todayISO, validateShow, type Show, type ShowInput,
} from "../src/domain";
import { loadShows, saveShows, type StorageLike } from "../src/storage";

const NOW = new Date("2026-08-30T12:00:00");
const input = (o: Partial<ShowInput> = {}): ShowInput => ({
  artist: "Radiohead", venue: "MSG", city: "New York", date: "2024-06-01",
  setlistHighlights: "Idioteque", memoryNote: "Cried.", rating: "5", ...o,
});
const show = (o: Partial<Show> = {}): Show => ({
  id: "s1", artist: "Radiohead", venue: "MSG", city: "New York", date: "2024-06-01",
  setlistHighlights: "", memoryNote: "", rating: 5, ...o,
});

class Mem implements StorageLike {
  map = new Map<string, string>();
  constructor(public mode: "ok" | "read" | "write" = "ok") {}
  getItem(k: string): string | null {
    if (this.mode === "read") throw new Error("blocked");
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    if (this.mode === "write") throw new DOMException("full", "QuotaExceededError");
    this.map.set(k, v);
  }
}

describe("domain", () => {
  it("cleans text and validates real calendar dates", () => {
    expect(tidy("  The   National  ")).toBe("The National");
    expect(tidyNotes("a\n\n\n\nb   c")).toBe("a\n\nb c");
    expect(isRealCalendarDate("2024-02-29")).toBe(true);
    expect(isRealCalendarDate("2024-02-30")).toBe(false);
    expect(todayISO(NOW)).toBe("2026-08-30");
    expect(formatDate("2026-08-30")).toMatch(/2026/);
    expect(formatDate("nope")).toBe("nope");
  });

  it("validateShow normalizes valid input and reports every field error", () => {
    const ok = validateShow(input({ artist: "  Radiohead  " }), NOW);
    expect(ok.ok && ok.value.artist).toBe("Radiohead");
    const bad = validateShow(input({ artist: " ", venue: "", city: "", date: "", rating: "0" }), NOW);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(["artist", "city", "date", "rating", "venue"]);
    expect(validateShow(input({ date: "2026-08-31" }), NOW).ok).toBe(false); // future rejected
    expect(validateShow(input({ date: "2026-08-30" }), NOW).ok).toBe(true); // today allowed
  });

  it("revalidates stored shows, sorts newest-first, and counts artists", () => {
    expect(isValidShow(show())).toBe(true);
    expect(isValidShow(show({ rating: 9 as unknown as Show["rating"] }))).toBe(false);
    expect(isValidShow(show({ date: "2024-02-30" }))).toBe(false);
    const list = [show({ id: "a", date: "2023-01-01" }), show({ id: "b", date: "2025-05-05" })];
    expect(sortByDateDesc(list).map((s) => s.id)).toEqual(["b", "a"]);
    expect(list[0].id).toBe("a"); // input not mutated
    expect(mostSeenArtist([])).toBeNull();
    expect(mostSeenArtist([show({ id: "1", artist: "The Strokes" }), show({ id: "2", artist: "the strokes " }), show({ id: "3", artist: "Muse" })])).toBe("The Strokes");
  });
});

describe("storage", () => {
  it("round-trips, drops invalid entries, and reports each failure cause", () => {
    const store = new Mem();
    expect(loadShows(store)).toEqual({ status: "ok", shows: [], skipped: 0 });
    saveShows([show({ id: "1" }), show({ id: "2", date: "2025-01-01" })], store);
    const ok = loadShows(store);
    if (ok.status !== "ok") throw new Error("expected ok");
    expect(ok.shows).toHaveLength(2);

    store.map.set("gig-bag:shows", JSON.stringify([show({ id: "3" }), { junk: true }, { id: "" }]));
    const dropped = loadShows(store);
    expect(dropped.status === "ok" && dropped.skipped).toBe(2);

    const corrupt = new Mem();
    corrupt.map.set("gig-bag:shows", "{not json");
    expect(loadShows(corrupt).status).toBe("corrupt");
    expect(loadShows(new Mem("read")).status).toBe("unavailable");
    expect(saveShows([show()], new Mem("write"))).toEqual({ ok: false, reason: "quota" });
  });
});
