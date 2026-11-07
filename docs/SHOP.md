# Akun, Keranjang, KanasaToken & Pesanan

Rute publik: `#/akun` · `#/keranjang` · `#/dompet` · `#/pesanan`. Admin: **Shop orders** (`/admin/#/shop`).

## Alur
- **Akun**: daftar/masuk/reset kata sandi lewat Supabase Auth (email + kata sandi). Pembeli = user biasa tanpa hak admin. Profil (nama, WhatsApp) di tabel `profiles`.
- **Keranjang**: tamu → disimpan di perangkat; setelah masuk digabung ke akun (`cart_items`).
- **KanasaToken (KT)**: 1 KT = Rp (kurs di Admin → Shop orders → Paket & kurs). Top up = pilih paket / jumlah bebas → bayar transfer/QRIS → unggah bukti → admin konfirmasi → saldo masuk. Saldo hanya bisa diubah lewat fungsi server (ledger append-only).
- **Status pesanan**: Menunggu Pembayaran → Menunggu Dikirim → Sudah Terkirim → Selesai (+ Dibatalkan).
  - Bayar KT: langsung ke *Menunggu Dikirim*. Transfer: admin konfirmasi bukti → *Menunggu Dikirim*.
  - Admin **Send product** (link otomatis dari produk bila 1 item) → *Sudah Terkirim*; pembeli unduh & tekan "Pesanan sudah diterima" → *Selesai* (otomatis selesai 3 hari setelah dikirim).
  - Top up: setelah konfirmasi admin langsung selesai dan KT masuk.
  - Belum dibayar > 24 jam dibatalkan otomatis (pg_cron `shop-autoclose`). Batal oleh admin untuk pesanan bayar-KT mengembalikan KT.
- Admin harus menambahkan **metode pembayaran** (Payments) agar transfer/top up bisa dibayar.

## Keamanan
Semua perubahan uang lewat RPC SECURITY DEFINER; tabel RLS (pembeli hanya melihat miliknya; `delivery_url`/`proof_path` tidak bisa dibaca langsung). Bukti bayar diunggah ke `order-attachments/incoming/shop/<uid>/…` dan dilihat admin lewat signed URL. Tidak ada payment gateway / kunci rahasia di frontend.

## Efek suara baru (Admin → Site editor → Sound effects)
`login`, `coin`, `paid`, `status`, `deliver` — ada bawaan sintetis; unggah file ElevenLabs untuk menggantinya.

## Login Google (opsional — sedang dinonaktifkan; set `GOOGLE_LOGIN = true` di js/shop.js setelah setup)
Tombol "Lanjutkan dengan Google" memakai Supabase Auth (alur PKCE). Agar aktif, lakukan sekali:
1. Google Cloud Console → APIs & Services → Credentials → **Create OAuth client ID** (Web application). Authorized redirect URI: `https://geroipkbzmbkigzwjdok.supabase.co/auth/v1/callback`.
2. Supabase Dashboard → Authentication → Providers → **Google** → Enable, isi Client ID & Client Secret (rahasia ini hanya di Supabase, bukan di kode).
3. Authentication → URL Configuration: **Site URL** `https://kanasastudio.github.io/kanasastudio/` dan tambahkan URL yang sama (plus domain kustom jika ada) ke **Redirect URLs**.
Sebelum diaktifkan, tombol menampilkan pesan "Login Google belum diaktifkan" dan pembeli tetap bisa pakai email.

## Header
Ikon saja: suara, mata uang (Rp/$), keranjang, akun (klik → menu: saldo KT, pesanan, keranjang, profil, keluar). Menu teks otomatis jadi hamburger di bawah 1180px.
