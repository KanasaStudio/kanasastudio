# KANASA STUDIO — Autonomous AI Company

Aplikasi perusahaan AI milik Kanasa Studio. Isinya kantor virtual 3D untuk HP dengan AI CEO **AURELIA-01** dan 7 karyawan AI di 6 departemen. Tim bekerja **24 jam di server**, jadi tetap jalan walau aplikasi di HP ditutup.

- **Aplikasi (PWA):** https://kanasastudio.github.io/kanasastudio/ai/
- **APK Android (debug):** halaman [Releases → ai-android-latest](https://github.com/KanasaStudio/kanasastudio/releases/tag/ai-android-latest)
- **Login:** pakai akun *owner* website Kanasa Studio (Supabase Auth yang sama).

## Arsitektur

```
HP / browser (React PWA, kantor 3D)  ──HTTPS──▶  Supabase (project KanasaStudio)
                                                 ├─ PostgreSQL: tabel ai_* + RLS khusus Founder
                                                 ├─ Realtime: status karyawan, tugas, notifikasi live
                                                 ├─ Vault: API key Gemini/Claude/OpenAI terenkripsi
                                                 ├─ pg_cron (tiap menit) ──▶ Edge Function kanasa-ai
                                                 └─ Edge Function kanasa-ai
                                                      ├─ AURELIA-01: rencana, delegasi, review, laporan
                                                      ├─ Worker: eksekusi tugas + dependensi + retry
                                                      ├─ Jadwal harian 07:00–18:00 WIB
                                                      ├─ Chat karyawan & rapat grup
                                                      └─ Web Push (VAPID)
```

Kode ini berada di folder `ai-company/` pada repo website Kanasa Studio. Hasil build PWA ada di folder `/ai` dan ikut terbit lewat GitHub Pages website.

| Folder | Isi |
|---|---|
| `app/` | Frontend: React 19, TypeScript, Vite, Tailwind 4, React Three Fiber + Drei, Framer Motion, Zustand, PWA, Capacitor Android |
| `app/src/office/` | Kantor 3D: denah, karakter chibi beranimasi sesuai status, robot AURELIA-01, gelembung bicara, mode 2D ringan |
| `supabase/migrations/` | Skema database, RLS, fungsi RPC, seed departemen/karyawan/jadwal, cron |
| `supabase/functions/kanasa-ai/` | Backend: adapter provider AI, engine orkestrasi, chat, push |

> Directive awal menyebut Node/Express/Prisma. Kebutuhan "online 24 jam tanpa server sendiri" lebih sederhana dan gratis dipenuhi Supabase: PostgreSQL + Edge Functions (TypeScript/Deno) + pg_cron + Realtime (pengganti SSE/WebSocket) + Vault (enkripsi key).

## Cara kerja

1. **Hubungkan API** di menu *API & Integrasi*. Server menguji key dengan mengambil daftar model langsung dari provider, menyimpan key di Vault, lalu memilih model default dari daftar resmi itu (tidak ada model ID yang di-hardcode).
2. Setelah API pertama terhubung, AURELIA-01 langsung memulai **siklus riset pertama**.
3. **pg_cron** mengecek tiap menit. Bila ada pekerjaan, ia memanggil edge function untuk:
   - membersihkan tugas macet (timeout → retry/gagal) dan memblokir tugas yang dependensinya gagal;
   - menjalankan slot jadwal harian yang jatuh tempo (briefing, riset, analisis tren, penugasan, istirahat, keuangan, QA, laporan eksekutif, ringkasan Founder);
   - mengklaim tugas siap (dependensi selesai, karyawan tidak dijeda/istirahat) dan menjalankannya lewat model AI.
4. **Perintah Founder** (bahasa biasa) → AURELIA-01 mengembalikan rencana JSON yang divalidasi server (karyawan valid, dependensi hanya ke tugas sebelumnya sehingga tidak bisa melingkar, aksi sensitif otomatis wajib persetujuan), lalu disimpan dalam satu transaksi.
5. Hasil penting **direview AURELIA-01** dan bisa diminta revisi (maks. sesuai pengaturan).

### Anti-fabrikasi
- Riset memakai pencarian web resmi tiap provider (Gemini Google Search grounding, Claude web search tool, OpenAI web_search). Daftar **sumber diambil dari metadata pencarian**, bukan dari teks model. Temuan yang domainnya tidak muncul di hasil pencarian ditandai *belum terverifikasi* dan keyakinannya diturunkan.
- Error API dicatat apa adanya; tugas gagal tidak pernah ditandai selesai.
- Keuangan: AI tidak membuat transaksi aktual. Biaya API = token × tarif yang Founder isi, dicatat sebagai **estimasi**.
- Persetujuan Founder hanya menandai draf "disetujui". Publikasi, pengiriman, pembelian, dan deploy tetap dilakukan manual karena belum ada tool eksternal yang terhubung.

### Batas keamanan
- RLS: semua tabel `ai_*` hanya bisa dibaca/diubah akun owner (`public.is_owner()`).
- API key: Vault (terenkripsi), tidak pernah dikirim ke browser, ditampilkan tersamar, tidak masuk log.
- Batas token & USD per karyawan per hari, batas global harian, maks. tugas paralel, percobaan, revisi, timeout, tugas per perintah, dan **Emergency Stop**.
- Log aktivitas *immutable* (trigger menolak UPDATE/DELETE).

## Notifikasi push
- **PWA (disarankan):** buka aplikasi di Chrome Android → *Instal aplikasi* → menu *Notifikasi* → *Aktifkan push*. Notifikasi memakai Web Push (VAPID) dan tetap masuk walau aplikasi ditutup.
- Prioritas KRITIS / TINGGI / NORMAL bisa diatur di Pengaturan. Masalah yang sama tidak dikirim berulang: jumlah kejadian dihitung, dan setelah 3× prioritasnya naik.
- **APK Capacitor:** WebView tidak mendukung Web Push. Di APK, notifikasi muncul secara realtime saat aplikasi dibuka. Push native butuh Firebase (lihat bagian berikut).

## Android (APK)
Workflow `.github/workflows/ai-android.yml` membangun APK debug setiap ada perubahan di `ai-company/app/` dan mengunggahnya ke Release `ai-android-latest`. Workflow `.github/workflows/ai-web.yml` membangun ulang PWA ke folder `/ai` lalu memicu deploy GitHub Pages website.

Build manual:
```bash
cd ai-company/app
npm ci
npm run build:android
npx cap sync android
cd android && ./gradlew assembleDebug        # APK: app/build/outputs/apk/debug/app-debug.apk
```
Untuk rilis bertanda tangan (Play Store): buat keystore (`keytool -genkey -v -keystore kanasa.jks -alias kanasa -keyalg RSA -keysize 2048 -validity 10000`), atur `signingConfigs` di `android/app/build.gradle`, lalu `./gradlew bundleRelease`.

Push native (opsional, belum aktif): buat project Firebase → tambahkan app Android `com.kanasastudio.ai` → simpan `google-services.json` di `app/android/app/` → pasang `@capacitor/push-notifications` → kirim token ke tabel baru → tambahkan pengirim FCM v1 di edge function memakai service account.

## Deploy ulang backend
```bash
supabase link --project-ref geroipkbzmbkigzwjdok
supabase db push                                   # migrasi di supabase/migrations
supabase functions deploy kanasa-ai --no-verify-jwt   # fungsi melakukan verifikasi sendiri (JWT Founder / kunci engine)
```
Secret yang dipakai (sudah tersimpan di Vault, bukan di repo): `kanasa_ai_engine_key`, `kanasa_ai_vapid_public`, `kanasa_ai_vapid_private`, `kanasa_ai_key_<provider>`.

## Pengembangan lokal
```bash
cd ai-company/app && npm install && npm run dev
```

## Keterbatasan saat ini (jujur)
- Departemen Software menghasilkan **draf** kode dan rencana. Belum ada sandbox untuk menjalankan kode.
- Pembuatan gambar (Creative) belum dihubungkan; hasilnya berupa konsep & spesifikasi tertulis.
- Memori memakai pencarian teks penuh PostgreSQL, belum embedding/semantic search.
- Edge function punya batas waktu eksekusi; satu tugas dibatasi ~110 detik per panggilan model, lalu dicoba ulang bila timeout.
- Biaya API hanya akurat bila tarif model diisi di *API & Integrasi*.
