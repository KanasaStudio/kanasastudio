# Kanasa News — cara kerja & operasi

**Apa ini:** agregator berita di `#/news`. Judul + kutipan feed + nama penerbit + waktu + tautan asli. Isi artikel TIDAK disalin; gambar dimuat langsung dari server penerbit (hotlink, tidak disimpan).

## Arsitektur
- Tabel: `news_categories`, `news_sources`, `news_articles`, `news_runs`, `news_config` (migrasi `20261030000012_news.sql`).
- **Edge Function `news-ingest`** (`supabase/functions/news-ingest/index.ts`): baca RSS/Atom, normalisasi, dedup (URL kanonik + judul ternormalisasi), upsert idempoten, catat hasil di `news_runs`. Backoff otomatis bila sumber gagal (30 → 60 → … maks 6 jam).
- **Penjadwal:** `pg_cron` job `news-ingest` tiap 10 menit → `news_cron_tick()` → memanggil function lewat `pg_net` dengan header `x-ingest-key` (kunci acak di tabel `news_config`, tidak bisa dibaca klien). Tiap sumber punya interval sendiri (default 30 menit).
- Admin (JWT admin) bisa memanggil function yang sama: sinkron manual, tes feed.
- Pembacaan publik lewat RLS: hanya artikel `published`; sumber/konfigurasi/riwayat hanya admin.
- Pencarian: kolom `search_tsv` (GIN) + `websearch_to_tsquery`; "Juga diberitakan": kemiripan judul `pg_trgm` (±3 hari, sumber berbeda).

## Admin → News
Overview (statistik, auto on/off, retensi, Sync all, riwayat run) · Sources (tambah/ubah, tes feed, sync per sumber, nonaktifkan) · Articles (cari, unggulkan, sembunyikan, sunting ringkasan/kategori, catatan koreksi) · Categories.

## Aturan editorial yang dipakai
- Berita utama: yang diberi bintang admin, kalau tidak ada → artikel terbaru berfoto (<36 jam).
- Kategori = kategori bawaan sumber (bukan penilaian otomatis).
- Tidak ada angka pembaca/trending palsu.

## Menambah sumber
Admin → News → Sources → "Add a source" → isi URL RSS (https) → **Test feed** → Add. Periksa syarat penggunaan feed penerbit; matikan "thumbnail" bila tidak boleh.

## Batasan yang jujur
- Ringkasan = kutipan feed penerbit. Ringkasan AI belum diaktifkan (kolom `summary_kind='ai'` sudah disiapkan; perlu kunci API penyedia AI sebagai secret Edge Function).
- Tidak ada terjemahan; bahasa asli ditampilkan.
- Pengelompokan "peristiwa" hanya kemiripan judul, bukan klasterisasi penuh.
- Halaman publik adalah SPA; Google mengindeks lewat halaman share (300 berita terbaru + kategori) yang dibuat GitHub Actions tiap push dan tiap hari.
- Hasil tes ingest nyata: sumber seperti Tempo Dunia bisa menolak bot (HTTP 403); lihat status di admin.
