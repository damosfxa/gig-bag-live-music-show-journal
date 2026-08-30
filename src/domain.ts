// Pure domain logic for Gig Bag. No DOM, no localStorage - inputs are explicit
// (e.g. `now` injected) so the whole module is testable in isolation.

export type Rating = 1 | 2 | 3 | 4 | 5;

export interface Show {
  id: string;
  artist: string;
  venue: string;
  city: string;
  date: string; // YYYY-MM-DD
  setlistHighlights: string;
  memoryNote: string;
  rating: Rating;
}

export interface ShowInput {
  artist: string;
  venue: string;
  city: string;
  date: string;
  setlistHighlights: string;
  memoryNote: string;
  rating: string;
}

export type FieldName =
  | "artist"
  | "venue"
  | "city"
  | "date"
  | "rating"
  | "setlistHighlights"
  | "memoryNote";

export type FieldErrors = Partial<Record<FieldName, string>>;

// Validator returns the cleaned value on success so callers never re-clean.
export type ValidationResult =
  | { ok: true; value: Omit<Show, "id"> }
  | { ok: false; errors: FieldErrors };

const MAX_SHORT = 80;
const MAX_LONG = 500;

/** Collapse whitespace to single spaces and trim (names/venues). */
export function tidy(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Trim, collapse 3+ blank lines to 2, keep paragraph breaks (notes). */
export function tidyNotes(text: string): string {
  return text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").replace(/[ \t]*\n[ \t]*/g, "\n").trim();
}

/** Today as YYYY-MM-DD in LOCAL time (plain toISOString is UTC, off near midnight). */
export function todayISO(now: Date = new Date()): string {
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** Real calendar date only; round-trips through Date to reject e.g. 2024-02-30. */
export function isRealCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function parseRating(raw: string): Rating | null {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? (n as Rating) : null;
}

/** Validate + normalize; all checks run so every bad field reports at once. */
export function validateShow(input: ShowInput, now: Date = new Date()): ValidationResult {
  const errors: FieldErrors = {};

  const artist = tidy(input.artist);
  if (!artist) errors.artist = "Nama artis wajib diisi.";
  else if (artist.length > MAX_SHORT) errors.artist = `Maksimal ${MAX_SHORT} karakter.`;

  const venue = tidy(input.venue);
  if (!venue) errors.venue = "Venue wajib diisi.";
  else if (venue.length > MAX_SHORT) errors.venue = `Maksimal ${MAX_SHORT} karakter.`;

  const city = tidy(input.city);
  if (!city) errors.city = "Kota wajib diisi.";
  else if (city.length > MAX_SHORT) errors.city = `Maksimal ${MAX_SHORT} karakter.`;

  const date = input.date.trim();
  if (!date) errors.date = "Tanggal wajib diisi.";
  else if (!isRealCalendarDate(date)) errors.date = "Tanggal tidak valid.";
  else if (date > todayISO(now)) errors.date = "Show belum terjadi - tanggal tidak boleh di masa depan.";

  const rating = parseRating(input.rating);
  if (rating === null) errors.rating = "Beri rating 1 sampai 5 bintang.";

  const setlistHighlights = tidyNotes(input.setlistHighlights);
  if (setlistHighlights.length > MAX_LONG) errors.setlistHighlights = `Maksimal ${MAX_LONG} karakter.`;

  const memoryNote = tidyNotes(input.memoryNote);
  if (memoryNote.length > MAX_LONG) errors.memoryNote = `Maksimal ${MAX_LONG} karakter.`;

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: { artist, venue, city, date, setlistHighlights, memoryNote, rating: rating as Rating },
  };
}

/** Structural + calendar check to revalidate anything loaded from storage. */
export function isValidShow(value: unknown): value is Show {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  if (typeof s.id !== "string" || s.id === "") return false;
  for (const key of ["artist", "venue", "city"] as const) {
    if (typeof s[key] !== "string" || (s[key] as string).trim() === "") return false;
  }
  if (typeof s.date !== "string" || !isRealCalendarDate(s.date)) return false;
  if (typeof s.setlistHighlights !== "string" || typeof s.memoryNote !== "string") return false;
  return typeof s.rating === "number" && Number.isInteger(s.rating) && s.rating >= 1 && s.rating <= 5;
}

/** Newest show first, by date. Returns a new array; never mutates the input. */
export function sortByDateDesc(shows: readonly Show[]): Show[] {
  return [...shows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** Artist seen most; names normalized (trim+lowercase), ties break alphabetically. */
export function mostSeenArtist(shows: readonly Show[]): string | null {
  if (shows.length === 0) return null;
  const counts = new Map<string, { display: string; count: number }>();
  for (const show of shows) {
    const key = show.artist.trim().toLowerCase();
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else counts.set(key, { display: show.artist, count: 1 });
  }
  let best: { display: string; count: number } | null = null;
  for (const entry of counts.values()) {
    if (
      best === null ||
      entry.count > best.count ||
      (entry.count === best.count && entry.display.localeCompare(best.display) < 0)
    ) {
      best = entry;
    }
  }
  return best ? best.display : null;
}

let idCounter = 0;

/** Unique id (time + counter avoids in-session collisions). */
export function makeId(now: Date = new Date()): string {
  idCounter += 1;
  return `show-${now.getTime().toString(36)}-${idCounter.toString(36)}`;
}

/** Human-readable date like "21 Agu 2026"; falls back to the raw string. */
export function formatDate(iso: string): string {
  if (!isRealCalendarDate(iso)) return iso;
  const d = new Date(iso + "T00:00:00Z");
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}
