# Status Publikasi Urbann Attier

## Sudah berfungsi di lingkungan uji

- Checkout memakai Midtrans Snap Sandbox dan menghitung ulang produk, stok, ongkir, serta diskon di server.
- Notifikasi Midtrans sudah berhasil diproses (`HTTP 200`); status pembayaran masuk ke dashboard admin secara otomatis.
- RajaOngkir menyediakan pencarian wilayah dan perhitungan tarif pengiriman.
- Halaman akun/member, kuota diskon, invoice, daftar pesanan admin, katalog/stok, dan sorotan halaman utama tersedia.

## Yang harus selesai sebelum menerima pesanan publik

1. **Domain dan hosting:** beli nama domain, pasang website pada hosting, lalu hubungkan DNS dan HTTPS.
2. **Supabase Auth:** ubah Site URL dan daftar Redirect URL ke alamat publik setelah domain aktif. Uji daftar, login, dan pemulihan kata sandi pada domain tersebut.
3. **Midtrans produksi:** selesaikan proses merchant Live, pasang kredensial Live di Supabase Secrets, gunakan endpoint Snap Live, dan atur Payment Notification URL Live. Jangan memakai Server Key Sandbox di produksi.
4. **Keamanan pembayaran:** tambahkan pembatasan penyalahgunaan pada endpoint pembuatan pembayaran sebelum pembayaran sungguhan dibuka untuk umum.
5. **Pengiriman:** pastikan berat/tagihan ongkir sesuai dengan kebijakan ekspedisi, termasuk kemungkinan berat volume. Sistem saat ini menghitung 500 gram per potong.
6. **Rilis kode:** tinjau perubahan lokal dan migrasi, commit/push ke GitHub, lalu deploy perubahan website dan Edge Function ke project yang benar.

## Email promo member — menunggu domain

- Gmail khusus brand dapat dipakai sebagai inbox admin atau alamat balasan, tetapi belum cukup untuk mengautentikasi alamat pengirim Resend.
- Setelah domain brand dibeli, verifikasi DNS domain di Resend, simpan `RESEND_API_KEY` dan `PROMO_FROM_EMAIL` di Supabase Edge Function Secrets, pastikan migrasi `202611170001_promo_email_media.sql` sudah diterapkan, lalu deploy fungsi `promo-email`.
- Uji kirim ke alamat milik sendiri terlebih dahulu. Jangan kirim kampanye massal sebelum hasil dan tautan berhenti berlangganan terverifikasi.

## Pengembangan lanjutan, bukan syarat rilis awal

- Pelacakan resi otomatis memerlukan dukungan API tracking dari ekspedisi.
- WhatsApp otomatis memerlukan WhatsApp Business Platform/API; tautan `wa.me` yang ada menyiapkan pesan untuk dikirim admin secara manual.

## Catatan keamanan

- Server Key Midtrans, Service Role Key Supabase, API key RajaOngkir, dan API key Resend hanya disimpan di Supabase Edge Function Secrets; jangan masukkan ke kode browser, GitHub, atau chat.
- Pembayaran hanya dianggap lunas setelah status resmi diverifikasi server. Callback sukses di browser bukan bukti pembayaran.
- Jangan mengubah atau menjeda project Supabase lama yang digunakan website lain.
