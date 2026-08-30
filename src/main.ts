// UI wiring for Gig Bag: DOM only, coordinates state -> save -> render.
import "./style.css";
import {
  formatDate, makeId, mostSeenArtist, sortByDateDesc, validateShow,
  type FieldErrors, type FieldName, type Show, type ShowInput,
} from "./domain";
import { loadShows, saveShows } from "./storage";

// In-memory source of truth. Getters return defensive copies (no mutation by ref).
let shows: Show[] = [];
const setShows = (next: readonly Show[]): void => { shows = next.map((s) => ({ ...s })); };
const getShows = (): Show[] => sortByDateDesc(shows).map((s) => ({ ...s }));
const getRaw = (): Show[] => shows.map((s) => ({ ...s }));
const count = (): number => shows.length;

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// Per field: error-slot id, plus input id where it has one.
const FIELDS: Record<FieldName, { err: string; input?: string }> = {
  artist: { err: "e-artist", input: "f-artist" },
  venue: { err: "e-venue", input: "f-venue" },
  city: { err: "e-city", input: "f-city" },
  date: { err: "e-date", input: "f-date" },
  rating: { err: "e-rating" },
  setlistHighlights: { err: "e-setlist", input: "f-setlist" },
  memoryNote: { err: "e-memory", input: "f-memory" },
};
const FIELD_NAMES = Object.keys(FIELDS) as FieldName[];

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

// Rating radios built here (input then label, 5..1 order, so CSS fills 1..N).
el("rating-input").innerHTML = [5, 4, 3, 2, 1]
  .map((n) => `<input class="star-in" type="radio" id="r${n}" name="rating" value="${n}" /><label class="star" for="r${n}"><span aria-hidden="true">★</span><span class="sr-only">${n} bintang</span></label>`)
  .join("");

const form = el<HTMLFormElement>("show-form");
const editIdInput = el<HTMLInputElement>("edit-id");
const submitBtn = el<HTMLButtonElement>("submit-btn");
const cancelBtn = el<HTMLButtonElement>("cancel-btn");
const formHeading = el<HTMLHeadingElement>("form-heading");
const formError = el<HTMLParagraphElement>("e-form");
const listEl = el<HTMLDivElement>("list");
const summaryEl = el<HTMLElement>("summary");
const systemError = el<HTMLDivElement>("system-error");
const statusLive = el<HTMLParagraphElement>("status-live");

let openId: string | null = null;
let armedDeleteId: string | null = null;
let disarmTimer: number | undefined;
const q = (id: string): string => `.card[data-id="${CSS.escape(id)}"]`;

/** Escape user text before it reaches innerHTML. */
function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const announce = (message: string): void => { statusLive.textContent = message; };
function showSystemError(message: string): void { systemError.textContent = message; systemError.hidden = false; }
function clearSystemError(): void { systemError.textContent = ""; systemError.hidden = true; }

function clearFieldErrors(): void {
  formError.textContent = "";
  for (const name of FIELD_NAMES) {
    el(FIELDS[name].err).textContent = "";
    const input = FIELDS[name].input;
    if (input) el(input).removeAttribute("aria-invalid");
  }
}

function showFieldErrors(errors: FieldErrors): void {
  clearFieldErrors();
  let firstInvalid: HTMLElement | null = null;
  for (const name of Object.keys(errors) as FieldName[]) {
    el(FIELDS[name].err).textContent = errors[name] ?? "";
    const input = FIELDS[name].input;
    if (input) {
      const node = el(input);
      node.setAttribute("aria-invalid", "true");
      firstInvalid ??= node;
    }
  }
  firstInvalid?.focus();
}

function starMarkup(rating: number): string {
  let stars = "";
  for (let i = 1; i <= 5; i++) stars += `<span class="${i <= rating ? "" : "off"}" aria-hidden="true">★</span>`;
  return `<span class="card__stars" role="img" aria-label="${rating} dari 5 bintang">${stars}</span>`;
}

function detailBlock(title: string, body: string, hint: string): string {
  const content = body.trim() === "" ? `<p class="empty">${esc(hint)}</p>` : `<p>${esc(body)}</p>`;
  return `<div class="detail-block"><h4>${esc(title)}</h4>${content}</div>`;
}

function cardMarkup(show: Show): string {
  const open = show.id === openId;
  const armed = show.id === armedDeleteId;
  const delLabel = armed ? "Klik lagi untuk konfirmasi hapus" : "Hapus show ini";
  return `<article class="card${open ? " is-open" : ""}" data-id="${esc(show.id)}">
<button type="button" class="card__head" aria-expanded="${open}" data-action="toggle">
<h3 class="card__artist">${esc(show.artist)}</h3>
<p class="card__where">${esc(show.venue)}, ${esc(show.city)}</p>
<span class="card__meta"><span class="card__date">${esc(formatDate(show.date))}</span>${starMarkup(show.rating)}</span>
<span class="card__chevron">${open ? "Tutup ▲" : "Detail ▼"}</span>
</button>
<div class="card__detail">
${detailBlock("Setlist yang keinget", show.setlistHighlights, "Belum ada catatan setlist.")}
${detailBlock("Catatan momen", show.memoryNote, "Belum ada catatan momen.")}
<div class="card__actions">
<button type="button" class="mini" data-action="edit">Edit</button>
<button type="button" class="mini mini--danger${armed ? " is-armed" : ""}" data-action="delete" aria-label="${delLabel}">${armed ? "Yakin hapus?" : "Hapus"}</button>
</div>
</div>
</article>`;
}

function emptyStateMarkup(): string {
  return `<div class="empty">
<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
<rect x="4" y="14" width="40" height="24" rx="4" fill="none" stroke="currentColor" stroke-width="2.5"/>
<path d="M18 14v24" stroke="currentColor" stroke-width="2.5" stroke-dasharray="3 3"/>
<circle cx="30" cy="27" r="3" fill="currentColor"/><path d="M33 27v-6l4-1v6" fill="none" stroke="currentColor" stroke-width="2"/>
</svg>
<h3>Gig bag masih kosong</h3>
<p>Belum ada show yang tercatat. Mulai dari konser terakhir yang paling berkesan.</p>
<button type="button" class="btn btn--primary" id="empty-cta">Catat show pertamamu</button>
</div>`;
}

function renderSummary(): void {
  const top = mostSeenArtist(getRaw());
  summaryEl.innerHTML = `<div class="stat"><p class="stat__label">Total show</p><p class="stat__value">${count()}</p></div>
<div class="stat"><p class="stat__label">Paling sering ditonton</p><p class="stat__value stat__value--artist">${top ? esc(top) : "Belum ada show tercatat"}</p></div>`;
}

function renderList(): void {
  const shows = getShows();
  if (shows.length === 0) {
    listEl.innerHTML = emptyStateMarkup();
    document.getElementById("empty-cta")?.addEventListener("click", () => el("f-artist").focus());
    return;
  }
  listEl.innerHTML = shows.map(cardMarkup).join("");
}

function render(): void {
  renderSummary();
  renderList();
}

// Mutations follow a save-first pattern: never touch state until the save succeeds.
function readForm(): ShowInput {
  const data = new FormData(form);
  const g = (k: string): string => String(data.get(k) ?? "");
  return {
    artist: g("artist"), venue: g("venue"), city: g("city"), date: g("date"),
    setlistHighlights: g("setlistHighlights"), memoryNote: g("memoryNote"), rating: g("rating"),
  };
}

/** Save first; only touch state and clear errors if the write succeeds. */
function persist(next: Show[]): boolean {
  const result = saveShows(next);
  if (result.ok) {
    setShows(next);
    clearSystemError();
    return true;
  }
  showSystemError(
    result.reason === "quota"
      ? "Penyimpanan penuh - hapus beberapa show lama, lalu coba lagi."
      : "Browser memblokir penyimpanan (mis. mode privat). Data mungkin tidak bertahan setelah refresh."
  );
  return false;
}

function resetFormMode(): void {
  form.reset();
  editIdInput.value = "";
  submitBtn.textContent = "Simpan show";
  formHeading.textContent = "Catat show";
  cancelBtn.hidden = true;
  clearFieldErrors();
}

function onSubmit(event: SubmitEvent): void {
  event.preventDefault();
  const result = validateShow(readForm());
  if (!result.ok) return showFieldErrors(result.errors);
  clearFieldErrors();

  const editingId = editIdInput.value;
  const next = editingId
    ? getRaw().map((s) => (s.id === editingId ? { ...result.value, id: editingId } : s))
    : [...getRaw(), { ...result.value, id: makeId() }];

  if (!persist(next)) {
    formError.textContent = "Gagal menyimpan. Lihat pesan di atas halaman.";
    return;
  }
  const verb = editingId ? "diperbarui" : "ditambahkan";
  resetFormMode();
  render();
  announce(`Show ${result.value.artist} ${verb}.`);
}

function startEdit(id: string): void {
  const show = getRaw().find((s) => s.id === id);
  if (!show) return;
  editIdInput.value = show.id;
  (el("f-artist") as HTMLInputElement).value = show.artist;
  (el("f-venue") as HTMLInputElement).value = show.venue;
  (el("f-city") as HTMLInputElement).value = show.city;
  (el("f-date") as HTMLInputElement).value = show.date;
  (el("f-setlist") as HTMLTextAreaElement).value = show.setlistHighlights;
  (el("f-memory") as HTMLTextAreaElement).value = show.memoryNote;
  const radio = form.querySelector<HTMLInputElement>(`input[name="rating"][value="${show.rating}"]`);
  if (radio) radio.checked = true;
  submitBtn.textContent = "Simpan perubahan";
  formHeading.textContent = `Edit: ${show.artist} @ ${show.venue}`;
  cancelBtn.hidden = false;
  clearFieldErrors();
  el("f-artist").focus();
  el("f-artist").scrollIntoView({ behavior: reducedMotion.matches ? "auto" : "smooth", block: "center" });
}

function disarmDelete(): void {
  if (disarmTimer) window.clearTimeout(disarmTimer);
  disarmTimer = undefined;
  const prev = armedDeleteId;
  armedDeleteId = null;
  if (prev) refreshCard(prev);
}

function armDelete(id: string): void {
  if (armedDeleteId && armedDeleteId !== id) disarmDelete();
  armedDeleteId = id;
  refreshCard(id);
  if (disarmTimer) window.clearTimeout(disarmTimer);
  disarmTimer = window.setTimeout(disarmDelete, 4000);
}

function confirmDelete(id: string): void {
  const next = getRaw().filter((s) => s.id !== id);
  // On failure persist() has already surfaced the cause in the global banner.
  if (!persist(next)) return;
  if (openId === id) openId = null;
  armedDeleteId = null;
  if (disarmTimer) window.clearTimeout(disarmTimer);
  render();
  announce("Show dihapus.");
}

/** Re-render one card in place (armed/open visual state). */
function refreshCard(id: string): void {
  const card = listEl.querySelector<HTMLElement>(q(id));
  const show = getShows().find((s) => s.id === id);
  if (card && show) card.outerHTML = cardMarkup(show);
}

function toggleOpen(id: string): void {
  openId = openId === id ? null : id;
  render();
}

function onListClick(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  const card = target.closest<HTMLElement>(".card");
  const id = card?.getAttribute("data-id");
  if (!id) return;
  const action = target.closest<HTMLElement>("[data-action]")?.getAttribute("data-action");
  if (action === "toggle") {
    if (armedDeleteId) disarmDelete();
    toggleOpen(id);
  } else if (action === "edit") {
    startEdit(id);
  } else if (action === "delete") {
    if (armedDeleteId === id) confirmDelete(id);
    else armDelete(id);
  }
}

function onDocumentClick(event: MouseEvent): void {
  if (!armedDeleteId) return;
  const target = event.target as HTMLElement;
  // The arming click re-rendered its own card, detaching the target; ignore it
  // so arming does not immediately disarm itself.
  if (!target.isConnected) return;
  const armedCard = listEl.querySelector<HTMLElement>(q(armedDeleteId));
  if (armedCard && !armedCard.contains(target)) disarmDelete();
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  if (armedDeleteId) disarmDelete();
  else if (editIdInput.value) resetFormMode();
}

async function boot(): Promise<void> {
  listEl.setAttribute("aria-busy", "true");
  listEl.innerHTML = `<p class="loading">Memuat jurnal...</p>`;
  // Real async boundary so the loading state is observable; skipped for reduced motion.
  await new Promise((resolve) => window.setTimeout(resolve, reducedMotion.matches ? 0 : 400));

  const result = loadShows();
  if (result.status === "unavailable") {
    setShows([]);
    showSystemError("Penyimpanan browser tidak bisa diakses. Show yang kamu catat mungkin tidak tersimpan.");
  } else if (result.status === "corrupt") {
    setShows([]);
    showSystemError("Data tersimpan rusak dan tidak bisa dibaca, jadi jurnal dimulai dari kosong.");
  } else {
    setShows(result.shows);
    if (result.skipped > 0) showSystemError(`${result.skipped} entri tersimpan dilewati karena datanya tidak valid.`);
  }

  listEl.removeAttribute("aria-busy");
  render();
}

form.addEventListener("submit", onSubmit);
cancelBtn.addEventListener("click", resetFormMode);
listEl.addEventListener("click", onListClick);
document.addEventListener("click", onDocumentClick);
document.addEventListener("keydown", onKeydown);

boot().catch((err) => {
  console.error(err);
  listEl.removeAttribute("aria-busy");
  showSystemError("Terjadi kesalahan saat memuat jurnal. Coba muat ulang halaman.");
});
