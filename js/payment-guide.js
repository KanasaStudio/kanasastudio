// Indonesian setup guide shown in Admin → Payments, and mirrored in docs/PAYMENTS.md.
export const GUIDE = [
["Alur lengkap (dari quotation sampai selesai)", `<ol>
<li>Di <b>Orders</b>, isi <b>Quoted total</b> lalu ubah status ke <b>Quotation Sent</b>. Klien membuka halaman <i>Track</i> dan melihat tagihan <b>DP</b> (default 50%, dihitung server dari Quoted total).</li>
<li>Klien memilih Bank / E-Wallet / QRIS, membayar lewat aplikasinya, lalu mengunggah <b>bukti bayar</b>. Status pembayaran menjadi <i>pending</i>.</li>
<li>Kamu cek <b>mutasi asli</b> (bukan hanya screenshot), lalu di detail order klik <b>Confirm</b>. Status order otomatis pindah ke <b>In Progress</b> (bisa diganti sebelum klik).</li>
<li>Pekerjaan selesai: ubah status ke <b>Awaiting Payment</b> untuk menagih <b>pelunasan</b> (sisa 50%). Klien membayar dan mengunggah bukti.</li>
<li>Setelah pelunasan kamu Confirm (default status → <b>Completed</b>), kirim file final lewat Discord/WhatsApp/Drive. <b>Kirim file final hanya setelah pelunasan terkonfirmasi.</b></li>
<li>Kalau bukti salah (nominal beda, bukan bukti asli): klik <b>Reject</b> dan tulis alasannya. Klien melihat alasan itu dan bisa mengunggah ulang.</li></ol>`],
["1. Bank transfer", `<ol>
<li>Siapkan rekening (sebaiknya rekening khusus usaha agar mutasi mudah dicek).</li>
<li>Admin → Payments → <b>Add method</b>: Type = <b>Bank</b>, Label = nama bank (mis. BCA), <b>Account name</b> persis seperti di buku tabungan, <b>Account number</b>.</li>
<li>Di <b>Instructions</b> tulis hal penting, mis. "Transfer nominal persis, biaya transfer antar-bank ditanggung pengirim".</li>
<li><b>Cara verifikasi:</b> buka m-banking/mutasi rekening, cocokkan nominal persis dan waktu transfer dengan bukti klien.</li></ol>`],
["2. E-Wallet (DANA, OVO, GoPay, ShopeePay, dll.)", `<ol>
<li>Pakai akun e-wallet milikmu sendiri. Cek di aplikasinya apakah akun sudah <b>terverifikasi/premium</b>: akun biasa umumnya punya batas saldo dan transaksi yang lebih rendah (ketentuan tiap aplikasi bisa berubah, cek langsung di aplikasi).</li>
<li>Admin → Payments → <b>Add method</b>: Type = <b>E-Wallet</b>, Label = nama aplikasi (mis. DANA), <b>Account name</b> = nama yang tampil di aplikasi, <b>Account number</b> = nomor HP yang terdaftar.</li>
<li><b>Cara verifikasi:</b> buka riwayat transaksi di aplikasi e-wallet, pastikan ada uang masuk dengan nominal persis.</li>
<li>Jangan pernah memasukkan PIN, OTP, atau password e-wallet ke situs ini atau membagikannya ke siapa pun.</li></ol>`],
["3. QRIS", `<ol>
<li>Kamu butuh <b>gambar QRIS statis milikmu sendiri</b>. Biasanya didapat dengan mendaftar sebagai merchant (usaha mikro/perorangan) lewat aplikasi bank atau e-wallet yang kamu pakai, lalu mengunduh/menyimpan gambar QRIS dari aplikasi merchant tersebut. Syarat, proses verifikasi, dan biaya (MDR) berbeda di tiap penyedia, jadi cek ketentuan penyedia yang kamu pilih.</li>
<li>Admin → Payments → <b>Add method</b>: Type = <b>QRIS</b>, Label (mis. "QRIS Kanasa Studio"), unggah gambar QRIS di <b>QRIS image</b>.</li>
<li>Pakai QRIS yang sah dan milikmu. Jangan memakai QRIS orang lain atau gambar dari internet.</li>
<li>QRIS statis <b>tidak mengisi nominal otomatis</b>, jadi klien harus mengetik nominal persis seperti yang tertera di tagihan (situs sudah menampilkan pengingat ini).</li>
<li><b>Cara verifikasi:</b> lihat notifikasi atau riwayat transaksi di aplikasi merchant tempat QRIS-mu terdaftar.</li></ol>`],
["4. Mengatur persentase DP dan catatan pembayaran", `<ol>
<li>Admin → <b>Site editor</b> → panel <b>Payments</b>: ubah <b>Deposit percent</b> (1–100), catatan pembayaran, dan pengingat QRIS.</li>
<li>Klik <b>Publish</b> supaya berlaku. Perubahan hanya memengaruhi tagihan berikutnya.</li>
<li>Tulis kebijakan DP-mu (apakah DP bisa dikembalikan, kapan batal) di <b>Commission terms</b> pada panel <b>Orders &amp; commission terms</b> dan di FAQ. Keputusan itu ada di tanganmu.</li></ol>`],
["5. Keamanan", `<ul>
<li>Nomor rekening, e-wallet, dan QRIS <b>tidak tampil di situs publik</b>. Hanya klien yang memegang link tracking-nya, dan hanya saat ada tagihan aktif, yang melihatnya.</li>
<li>Nominal tagihan dihitung di server dari Quoted total. Klien tidak bisa mengubahnya.</li>
<li>Bukti bayar disimpan di penyimpanan privat dan hanya bisa dibuka admin (link sementara).</li>
<li>Screenshot bisa dipalsukan. <b>Selalu cocokkan dengan mutasi/riwayat asli</b> sebelum Confirm.</li>
<li>Jangan menyimpan PIN, OTP, password, atau data kartu di admin maupun di kolom Instructions.</li></ul>`],
["6. Nanti: pembayaran otomatis (payment gateway)", `<p>Fitur ini memakai <b>konfirmasi manual</b>. Untuk konfirmasi otomatis (QRIS dinamis per order, virtual account, webhook) kamu butuh akun merchant di penyedia gateway (mis. Midtrans atau Xendit) dengan proses verifikasi usaha, ditambah fungsi server untuk menerima notifikasi pembayaran. Itu bisa ditambahkan nanti tanpa mengubah alur order yang sudah ada.</p>`],
];
