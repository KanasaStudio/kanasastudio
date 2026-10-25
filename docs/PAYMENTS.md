# Panduan pembayaran (DP, Bank, E-Wallet, QRIS)

Pembayaran di situs ini bersifat **konfirmasi manual**: klien membayar lewat aplikasi bank/e-wallet/QRIS milikmu, mengunggah bukti, lalu kamu memverifikasi di admin.

## Alur lengkap (dari quotation sampai selesai)
- Di **Orders**, isi **Quoted total** lalu ubah status ke **Quotation Sent**. Klien membuka halaman *Track* dan melihat tagihan **DP** (default 50%, dihitung server dari Quoted total).

- Klien memilih Bank / E-Wallet / QRIS, membayar lewat aplikasinya, lalu mengunggah **bukti bayar**. Status pembayaran menjadi *pending*.

- Kamu cek **mutasi asli** (bukan hanya screenshot), lalu di detail order klik **Confirm**. Status order otomatis pindah ke **In Progress** (bisa diganti sebelum klik).

- Pekerjaan selesai: ubah status ke **Awaiting Payment** untuk menagih **pelunasan** (sisa 50%). Klien membayar dan mengunggah bukti.

- Setelah pelunasan kamu Confirm (default status → **Completed**), kirim file final lewat Discord/WhatsApp/Drive. **Kirim file final hanya setelah pelunasan terkonfirmasi.**

- Kalau bukti salah (nominal beda, bukan bukti asli): klik **Reject** dan tulis alasannya. Klien melihat alasan itu dan bisa mengunggah ulang.

## 1. Bank transfer
- Siapkan rekening (sebaiknya rekening khusus usaha agar mutasi mudah dicek).

- Admin → Payments → **Add method**: Type = **Bank**, Label = nama bank (mis. BCA), **Account name** persis seperti di buku tabungan, **Account number**.

- Di **Instructions** tulis hal penting, mis. "Transfer nominal persis, biaya transfer antar-bank ditanggung pengirim".

- **Cara verifikasi:** buka m-banking/mutasi rekening, cocokkan nominal persis dan waktu transfer dengan bukti klien.

## 2. E-Wallet (DANA, OVO, GoPay, ShopeePay, dll.)
- Pakai akun e-wallet milikmu sendiri. Cek di aplikasinya apakah akun sudah **terverifikasi/premium**: akun biasa umumnya punya batas saldo dan transaksi yang lebih rendah (ketentuan tiap aplikasi bisa berubah, cek langsung di aplikasi).

- Admin → Payments → **Add method**: Type = **E-Wallet**, Label = nama aplikasi (mis. DANA), **Account name** = nama yang tampil di aplikasi, **Account number** = nomor HP yang terdaftar.

- **Cara verifikasi:** buka riwayat transaksi di aplikasi e-wallet, pastikan ada uang masuk dengan nominal persis.

- Jangan pernah memasukkan PIN, OTP, atau password e-wallet ke situs ini atau membagikannya ke siapa pun.

## 3. QRIS
- Kamu butuh **gambar QRIS statis milikmu sendiri**. Biasanya didapat dengan mendaftar sebagai merchant (usaha mikro/perorangan) lewat aplikasi bank atau e-wallet yang kamu pakai, lalu mengunduh/menyimpan gambar QRIS dari aplikasi merchant tersebut. Syarat, proses verifikasi, dan biaya (MDR) berbeda di tiap penyedia, jadi cek ketentuan penyedia yang kamu pilih.

- Admin → Payments → **Add method**: Type = **QRIS**, Label (mis. "QRIS Kanasa Studio"), unggah gambar QRIS di **QRIS image**.

- Pakai QRIS yang sah dan milikmu. Jangan memakai QRIS orang lain atau gambar dari internet.

- QRIS statis **tidak mengisi nominal otomatis**, jadi klien harus mengetik nominal persis seperti yang tertera di tagihan (situs sudah menampilkan pengingat ini).

- **Cara verifikasi:** lihat notifikasi atau riwayat transaksi di aplikasi merchant tempat QRIS-mu terdaftar.

## 4. Mengatur persentase DP dan catatan pembayaran
- Admin → **Site editor** → panel **Payments**: ubah **Deposit percent** (1–100), catatan pembayaran, dan pengingat QRIS.

- Klik **Publish** supaya berlaku. Perubahan hanya memengaruhi tagihan berikutnya.

- Tulis kebijakan DP-mu (apakah DP bisa dikembalikan, kapan batal) di **Commission terms** pada panel **Orders & commission terms** dan di FAQ. Keputusan itu ada di tanganmu.

## 5. Keamanan
- Nomor rekening, e-wallet, dan QRIS **tidak tampil di situs publik**. Hanya klien yang memegang link tracking-nya, dan hanya saat ada tagihan aktif, yang melihatnya.

- Nominal tagihan dihitung di server dari Quoted total. Klien tidak bisa mengubahnya.

- Bukti bayar disimpan di penyimpanan privat dan hanya bisa dibuka admin (link sementara).

- Screenshot bisa dipalsukan. **Selalu cocokkan dengan mutasi/riwayat asli** sebelum Confirm.

- Jangan menyimpan PIN, OTP, password, atau data kartu di admin maupun di kolom Instructions.

## 6. Nanti: pembayaran otomatis (payment gateway)
Fitur ini memakai **konfirmasi manual**. Untuk konfirmasi otomatis (QRIS dinamis per order, virtual account, webhook) kamu butuh akun merchant di penyedia gateway (mis. Midtrans atau Xendit) dengan proses verifikasi usaha, ditambah fungsi server untuk menerima notifikasi pembayaran. Itu bisa ditambahkan nanti tanpa mengubah alur order yang sudah ada.


## Alur kerja & pengiriman (urutan wajib)

1. Klien bayar **DP 50%** → kamu konfirmasi → status *In Progress*.
2. Worker selesai → kirim hasil/preview lewat pesan (Messages) → ubah status ke **Awaiting Client Approval**.
3. Klien klik **Approve the work** di halaman Track (atau minta revisi → status *Revision*). Jika kalian sepakat lewat Discord, kamu bisa langsung set **Awaiting Payment**.
4. Tagihan **pelunasan 50%** terbuka → klien upload bukti → kamu konfirmasi → status **Ready for Delivery**.
5. Di halaman order, panel **Delivery** terbuka hanya setelah lunas penuh: tempel link unduhan (https) → klien melihatnya di halaman Track, status otomatis **Completed**.

Dikunci di server: status *Completed* dan link pengiriman tidak bisa dibuat sebelum pembayaran terkonfirmasi penuh, dan link hanya ditampilkan ke klien setelah lunas.
