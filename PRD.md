# PRD - Gig Bag: Live Music Show Journal

Rookie Brawl (60 menit build window, cap ukuran repo 40 KB, rubric standar 3 kategori: Completeness / Problem Solving & Design / Technical + Craft).

## 1. Problem Statement
Sumber: brief. Penggemar musik yang udah nonton puluhan konser/festival/gig lokal gak punya cara nyatet histori nonton mereka - detailnya "blur together" (nama artis, venue, tanggal, momen spesifik) makin lama makin gampang lupa. Gig Bag jadi single-page personal log biar tiap show yang udah ditonton tercatat lengkap dan gampang ditelusuri balik.

## 2. Goals (diurutkan sesuai prioritas rubric standar - Completeness dulu, gating)
1. [Completeness, P0] Semua field & aksi di brief (add/edit/delete show, expand buat detail, summary banner, sort terbaru-ke-terlama, localStorage persist) beneran ada dan jalan end-to-end, termasuk behavior di luar happy path (validasi, empty state, storage gagal).
2. [Problem Solving & Design, P0] Solusinya kerasa kayak "buku kenangan konser" beneran, bukan form generic - 1 arah visual spesifik (lihat Step 3.3 di bawah) + responsive + expand-to-reveal yang jadi momen utama.
3. [Technical + Craft, P0] TypeScript asli (bukan JSDoc) + Vite + Vitest, arsitektur domain/storage/UI terpisah, error-catching TERANG-TERANGAN exhaustive, semua baseline teknis dari BATTLE_PLAN.md/PLAYBOOK_SKOR80.md tertanam sejak awal.

## 3. Target User
Sumber: brief ("music fans"). Satu peran: pengguna personal (single-user, no login) yang mau nyimpen histori nonton konser sendiri di browser-nya.

## 4. User Stories
- Sebagai penggemar musik, saya ingin mencatat show yang baru saya tonton (artis, venue, kota, tanggal, setlist yang saya inget, rating, catatan momen) supaya gak lupa detailnya.
- Sebagai penggemar musik, saya ingin lihat semua show saya sebagai daftar kartu terurut dari yang paling baru, supaya gampang nostalgia/nelusurin balik.
- Sebagai penggemar musik, saya ingin klik satu kartu buat lihat detail setlist & catatan momennya, tanpa bikin daftar utama jadi berantakan.
- Sebagai penggemar musik, saya ingin edit show yang salah saya catat, dan hapus show yang saya tambahin gak sengaja.
- Sebagai penggemar musik, saya ingin lihat sekilas total show yang udah saya tonton dan artis yang paling sering saya tonton, tanpa harus ngitung manual.

## 5. Functional Requirements

Entity tunggal: `Show` - `id`, `artist`, `venue`, `city`, `date` (ISO, YYYY-MM-DD), `setlistHighlights` (opsional), `rating` (1-5), `memoryNote` (opsional).

Keputusan atas ambiguitas non-blocking di brief (ditandai [C] = usulan Claude, alasan eksplisit, brief cukup jelas di sisanya - gak butuh AskUserQuestion tambahan di luar tier/format/rubric yang udah dikonfirmasi):
- [C] "Venue and city" dipecah jadi 2 field terpisah (`venue`, `city`), bukan 1 field gabungan freetext - lebih bersih buat ditampilin di kartu ("Venue, City") dan gak ada ambiguitas parsing. Brief nyebutnya sebagai satu bullet tapi isinya jelas 2 konsep beda.
- [C] Expand pakai INLINE ACCORDION di dalam kartu (bukan modal) - brief eksplisit ngasih pilihan ("expands (or opens a modal)"). Accordion lebih ringan (gak butuh focus-trap/backdrop/portal terpisah), lebih cepat dibangun rapi dalam window 60 menit, dan reveal-nya justru jadi MOMEN INTI Design (lihat Step 3.3) - klik kartu = "membuka lagi memori show itu".
- [C] Field wajib: artist, venue, city, date, rating (semua tampil at-a-glance di kartu, identitas inti 1 entry). Field opsional: setlistHighlights, memoryNote (brief nulisnya dengan nada personal/longgar - "songs you remember", "one moment, one feeling" - gak semua show punya kenangan setlist/momen spesifik yang keinget).
- [C] Tanggal show WAJIB tidak boleh di masa depan (local-timezone corrected, bukan UTC - lihat lesson Hiking Trail Logbook) - brief eksplisit bilang ini log show yang "udah ditonton" (attended), jadi show yang belum terjadi itu nonsensikal buat dicatat di sini.
- [C] "Most-seen artist" dihitung dari key ternormalisasi (trim + case-insensitive) biar "Radiohead" dan "radiohead " kehitung sebagai artist yang sama; kalau ada 2+ artist tied di jumlah show terbanyak, tampilin yang namanya duluan secara alfabet (deterministik, low-stakes tie-break).
- [C] Edit pakai SATU form Add/Edit yang di-reuse (bukan inline-edit per-field di kartu) - waktu diklik Edit, form itu masuk mode edit (judul berubah jadi "Edit: <artist> @ <venue>", tombol Cancel buat keluar tanpa nyimpen, fokus pindah ke field pertama). Field-nya 6 buah - form terpusat lebih gampang dijaga konsistensinya daripada inline-edit 6 field di tiap kartu.
- Sort daftar TETAP fixed "terbaru ke terlama" berdasar `date` - brief gak minta filter/sort lain, jadi gak ditambahin (out of scope, lihat section 7).

FR detail (P0 kecuali ditandai lain):
1. Form Add/Edit (shared, lihat keputusan di atas) - submit nambah show baru atau update show yang lagi diedit.
2. Validasi per-field, error inline SCOPED KE FORM (bukan toast global) - render dekat field yang gagal, `aria-invalid`+`aria-describedby` di-wire dinamis: artist/venue/city gak boleh kosong (setelah trim) + maxLength wajar (~80 char), date wajib format kalender ASLI valid (`new Date(...)` roundtrip check, bukan cuma regex - lesson sunburn-summits) dan tidak boleh masa depan, rating harus integer 1-5, setlistHighlights/memoryNote optional tapi maxLength wajar (~500 char) kalau diisi.
3. Daftar kartu, sort terbaru ke terlama by `date`. Tiap kartu (collapsed): artist, "venue, city", tanggal human-readable (`Intl.DateTimeFormat`), rating sebagai bintang visual (bukan cuma angka).
4. Klik kartu = expand/collapse inline accordion, reveal setlistHighlights (atau placeholder "Belum ada catatan setlist" kalau kosong) + memoryNote (atau placeholder serupa) - transisi height + treatment visual paling berani (lihat Step 3.3) cuma muncul di momen reveal ini.
5. Tombol Edit per kartu -> buka form Add/Edit dalam mode edit, terisi data kartu itu.
6. Tombol Delete per kartu -> two-step confirm (klik pertama arm state "Yakin hapus?", klik kedua eksekusi), auto-disarm timer ~4 detik, dual exit (Escape key + klik di luar kartu itu) buat cancel pending-delete. Confirm state trap-focus ke tombol confirm.
7. Empty state (belum ada show sama sekali) - elemen dedicated + hint + CTA "Catat show pertamamu" yang fokus ke form Add. Cuma 1 konteks kosong di brief ini (gak ada filter), jadi cuma 1 varian empty state.
8. Summary banner di atas: total show tercatat + nama artist paling sering ditonton (pakai normalisasi+tie-break di atas) - kalau 0 show, banner nunjukin state netral ("Belum ada show tercatat"), bukan artist kosong/error.
9. Persistence localStorage: `loadShows()`/`saveShows()` terpisah, discriminated union hasil (`ok` / `corrupt` / `unavailable`) dengan pesan cause-specific; data yang diload divalidasi ulang lewat validator yang sama kayak input baru, entry yang gak valid di-drop dengan count "N dilewati" disurface ke user (bukan didiemin).
10. NEVER-TOUCH-STATE-UNTIL-SAVE-CONFIRMED: tiap mutasi (add/edit/delete) hitung data baru dulu, panggil `saveShows()` DULU, baru assign ke in-memory state + render kalau sukses. Kalau gagal, state lama gak disentuh, tampilin error.
11. Error storage-write per-instance: kalau save gagal dipicu aksi di 1 kartu spesifik (edit/delete kartu itu), kartu ITU dapet elemen error sendiri (`role="alert"`, hidden default) - bukan cuma banner global jauh dari kartu.
12. Error storage-write yang dipicu form Add/Edit (submit gagal karena localStorage) dapet inline feedback DEKAT tombol submit form, plus banner global persisten (`role="alert"`) buat kegagalan storage app-wide (mis. read-failure awal boot).
13. Honest loading skeleton: `boot()` pakai `async function` + `await new Promise(r => setTimeout(r, 400))` (async/await asli, bukan nested callback) sebelum render data asli, tampilin skeleton card markup (bukan cuma `aria-busy` polos) selama itu.
14. [P1] Live-region status (global, "berhasil ditambah/diedit/dihapus") dipisah dari live-region error per-field/per-instance.

## 6. Non-Functional Requirements
- Client-side only, TypeScript asli (`.ts`, `interface`/`type`) + Vite + Vitest - JSDoc DIELIMINASI (lesson permanen BATTLE_PLAN.md rule #3).
- ES Modules murni (`export`/`import`), nol `window.X` global.
- `prefers-reduced-motion` dihormati di CSS (transition/animation) DAN JS (skip delay expand/skeleton kalau diminta).
- `:focus-visible` dengan fallback `outline` + token warna beda light/dark (bukan 1 warna fixed).
- CSS custom properties untuk semua token (warna, radius, shadow) di `:root`, dark mode via `prefers-color-scheme`.
- Responsive: breakpoint tengah (~620-899px) selain breakpoint sempit/lebar, touch target >=44px.
- Store getter (`getShows()`) return defensive copy, bukan referensi state internal langsung.
- Byte cap Rookie Brawl 40 KB (raw source, exclude markdown non-root/lock/node_modules) - target lean dari draft pertama, cek incremental, jangan minify HTML/CSS.

## 7. Scope
- Add/edit/delete show dengan 6 field di atas -> IN.
- Expand inline per kartu buat reveal setlist+memory -> IN.
- Sort terbaru-ke-terlama (fixed) -> IN.
- Summary banner (total + most-seen artist) -> IN.
- localStorage persist, no backend, no login -> IN (eksplisit brief).
- Filter/search/sort tambahan (by artist/rating/venue) -> OUT (gak diminta brief, hindarin scope creep di window 60 menit).
- Upload foto/gambar tiket -> OUT (gak diminta brief, juga nambah kompleksitas storage besar untuk localStorage).
- Multi-user/cloud sync/share -> OUT (eksplisit dilarang brief - "No login, no backend").
- Export data (PDF/CSV) -> OUT (gak diminta brief).

## Step 3.3 - Arah Visual
Ditolak eksplisit: bukan dashboard SaaS card-grid icon-title-text generic, bukan buku catatan ruled-paper (udah dipakai Podcast Queue, butuh metafora baru), bukan glassmorphism gradient generic.

Arah dipilih: "Gig poster / ticket stub" - kartu show dibentuk kayak SOBEKAN TIKET KONSER (edge berlubang/perforasi via pseudo-element dashed), warna dasar GELAP ("malam konser") sebagai tema utama dengan override light via `prefers-color-scheme`, accent warna amber/spotlight (`#f2a93b`) yang muncul terkonsentrasi di momen EXPAND kartu (efek "lampu panggung menyala" saat detail show dibuka) - sisanya restrained/quiet.

Font 3-tier (Design A Toolkit): display poster-style bold (heading judul app + nama artist di kartu) + font monospace/stamp-style buat metadata "tercap" (tanggal, venue, badge rating) + body sans netral buat teks panjang (setlist, memory note). Texture: perforasi dashed di tepi kartu (`::before`/`::after` + `repeating-linear-gradient`, ~5-10 baris CSS, murah byte).

Kontras diverifikasi numerik: teks off-white `#f5efe0` di atas background gelap `#171220` ~16:1 (jauh di atas 4.5:1). Accent amber `#f2a93b` di atas background sama ~9.2:1 (di atas 3:1 UI besar, bahkan di atas 4.5:1 teks normal) - aman dipakai buat heading/badge/border, teks panjang tetap pakai off-white.

## Traceability
Semua FR di atas ditandai sumbernya di teks masing-masing: brief langsung (field, sort, expand, edit/delete, summary, localStorage/no-backend), atau [C] usulan Claude dengan alasan eksplisit (split venue/city, accordion vs modal, required/optional field, validasi tanggal, tie-break most-seen, shared Add/Edit form). Baseline teknis (TypeScript asli, Vitest, never-touch-state, per-instance error, honest skeleton, Design A Toolkit) dari `BATTLE_PLAN.md`/`PLAYBOOK_SKOR80.md`.

ENHANCEMENTS.md di-skip - window build cuma 60 menit (Rookie), scope wajib brief + baseline teknis udah proporsional buat waktu segitu, gak ada ruang buat fitur di luar itu.
