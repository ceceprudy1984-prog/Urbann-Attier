# Supabase Urbann Attier

Folder ini berisi migrasi Supabase untuk website Urbann Attier. Project yang saat ini dipakai website bernama `urbann attier store`. Jalankan hanya migrasi yang belum diterapkan pada project tersebut; jangan menjalankan migrasi awal berulang kali.

## Membuat database

1. Buka project Supabase `urbann attier store` dan **SQL Editor**.
2. Migrasi `202611040001_urbann_attier_initial_schema.sql` hanya untuk project baru yang belum memiliki tabel Urbann Attier. Jangan jalankan ulang pada database yang sudah berisi tabel atau produk.
3. Untuk project yang sedang dipakai, jalankan migrasi lanjutan yang belum diterapkan secara berurutan: `202611040002_product_image_storage.sql` untuk unggah foto, `202611040003_enable_catalog_realtime.sql` untuk pembaruan katalog langsung, `202611050001_checkout_stock_reservation.sql` untuk validasi stok dan pencatatan pesanan, `202611060001_admin_order_workflow.sql` untuk alur dashboard admin serta pembatalan, `202611110001_store_shipping_quotes.sql` untuk pilihan tarif ongkir, `202611120001_midtrans_snap_payments.sql` untuk reservasi stok dan konfirmasi Midtrans, lalu `202611120002_service_role_payment_reads.sql` untuk akses terbatas fungsi pembayaran.
4. Checkout website saat ini memakai Midtrans Snap. Fungsi `create-midtrans-payment` memeriksa ulang tarif RajaOngkir, harga, dan stok di server sebelum menyiapkan pembayaran. Fungsi `midtrans-notification` memverifikasi tanda tangan notifikasi Midtrans lalu memperbarui status pesanan dan stok. Pesanan diproses setelah notifikasi pembayaran valid; stok yang gagal/kedaluwarsa dilepas kembali.
5. Dashboard admin menyediakan daftar pesanan, perubahan ongkir/resi, dan tahap pemrosesan. Pesanan Midtrans yang sudah dibayar memperbarui status otomatis. Pesanan manual/transfer dari alur lama tetap dapat dikelola dari dashboard; tandai lunas hanya setelah transfer benar-benar diverifikasi.
6. Untuk akun pelanggan dan diskon, jalankan `202611140001_customer_accounts.sql` lalu `202611140002_member_discount.sql` setelah migrasi checkout dan pembayaran di atas. Diskon 5% berlaku pada bagian harga ecer untuk maksimal lima pesanan yang berhasil dibayar. Pesanan menunggu pembayaran memegang kuota sementara; pembatalan, penolakan, atau refund melepaskannya. Nilai potongan dihitung ulang di server dan disimpan bersama sisa kuota pada data pesanan agar dapat dicetak di invoice.
8. Jalankan `202611140003_admin_order_realtime.sql` agar perubahan status pesanan masuk ke dashboard admin secara langsung. Dashboard menampilkan pemberitahuan untuk pesanan baru dan perubahan status pembayaran/tahap pesanan selama admin sedang membuka dashboard.
9. Jalankan `202611150001_admin_member_directory.sql` untuk mengaktifkan halaman **Data member** pada dashboard. Fungsi database membatasi daftar ini hanya untuk admin aktif dan mengambil email akun tanpa membuka tabel `auth.users` ke frontend publik.
10. Jalankan `202611150002_storefront_bestsellers.sql` untuk bagian **Terlaris** di halaman utama. Fungsi publik hanya mengembalikan ID produk aktif yang peringkatnya dihitung dari jumlah barang pada pesanan dengan pembayaran lunas; data pelanggan dan rincian pesanan tidak dibuka.
11. Jalankan `202611150003_homepage_spotlight_content.sql` untuk mengaktifkan pengaturan teaser **Coming Soon** dan kampanye promo di dashboard admin. Admin dapat mengatur teks, gambar, tautan, serta jadwal tampil/sembunyi. Konten promo hanya materi informasi dan tidak mengubah perhitungan diskon transaksi.
12. Jalankan `202611150004_promo_email_campaigns.sql` untuk membuat catatan kampanye email, token berhenti berlangganan, dan daftar penerima yang hanya dapat dibaca Edge Function. Pelanggan yang belum menyetujui, belum memverifikasi email, atau sudah berhenti berlangganan tidak akan dimasukkan.
13. Jalankan `202611160001_customer_account_dashboard.sql` setelah migrasi-migrasi di atas untuk menampilkan status/verifikasi member, email, profil, alamat utama, serta token diskon pada halaman akun. Migrasi ini mengisi alamat dari pesanan terbaru yang tertaut ke akun jika tersedia. Fungsi database hanya mengembalikan ringkasan milik akun yang sedang masuk dan hanya mengizinkan pemiliknya memperbarui profil.
14. Jika penyimpanan konten **Sorotan & promo** menampilkan `permission denied for table store_public_settings`, jalankan `202611160002_store_public_settings_admin_write.sql`. Migrasi ini memulihkan izin baca publik dan izin update untuk pengguna terautentikasi; kebijakan RLS tetap membatasi update hanya untuk admin aktif.
15. Jalankan `202611250001_product_categories.sql` untuk menyiapkan kategori bertingkat **Gamis → Gamis Anak/Gamis Dewasa** dan **One Set → One Set Anak**. Migrasi ini menautkan produk lama berlabel `Gamis` ke kategori induk Gamis, mempertahankan label lama, menyiapkan hak baca publik dan pengelolaan khusus admin, serta menambahkan tabel kategori ke Realtime jika publication tersedia. Setelah migrasi sukses, deploy file website terbaru agar filter kategori storefront dan pengelola kategori dashboard aktif. Produk baru wajib diberi kategori dari dashboard.
16. Untuk program affiliate, jalankan `202611250002_affiliate_program.sql` setelah migrasi kategori dan akun pelanggan. Migrasi ini menambah aplikasi affiliate, atribusi referral 30 hari, komisi 8% (dapat diubah admin), masa tunggu 3 hari setelah pesanan diterima, bonus 500 pcs per bulan, saldo minimum Rp100.000, dan antrean pencairan BCA. Setelah itu deploy file website terbaru (`affiliate.html`, `affiliate.css`, `affiliate.js`, `supabase-config.js`, `main.js`, `checkout.js`, `admin.html`, `admin.css`, `admin.js`, `index.html`, `checkout.html`, `kebijakan-privasi.html`, `kebijakan-retur.html`, dan `sitemap.xml`) serta perbarui Edge Function `create-midtrans-payment` dari source yang sama. Pencairan tetap dilakukan manual oleh admin setiap Jumat setelah pukul 15.00 WIB. Pelanggan mengajukan retur dan mengirim video unboxing melalui WhatsApp; admin meninjau buktinya lalu mencatat retur dari dashboard.

## Menyiapkan login pelanggan

1. Pastikan **Authentication → Providers → Email** aktif. Untuk penggunaan nyata, aktifkan verifikasi email dan siapkan layanan email SMTP Supabase agar email verifikasi dan pemulihan dapat terkirim dengan baik.
2. Buka **Authentication → URL Configuration**. Site URL lokal boleh berupa `http://127.0.0.1:5502`, tetapi tambahkan URL callback akun ke daftar **Redirect URLs**, termasuk `http://127.0.0.1:5502/akun.html?mode=new-password` dan `http://127.0.0.1:5502/affiliate.html`. Setelah situs dipublikasikan, tambahkan juga URL akun dan affiliate produksi. Template **Reset Password** harus menggunakan tautan `{{ .ConfirmationURL }}` agar `redirectTo` dari halaman akun dipakai.
3. Buka `akun.html` melalui Live Server untuk membuat akun, masuk, mengirim tautan lupa kata sandi, atau mengubah persetujuan email promosi. Biarkan Live Server berjalan saat tautan pemulihan dibuka. Jika Supabase mengarahkan token pemulihan ke halaman utama, `main.js` meneruskannya ke formulir kata sandi baru di `akun.html`. Akun pelanggan tidak mendapat akses admin; jangan menambahkan pelanggan ke tabel `admin_users`.
4. Tanpa persetujuan email promosi, pelanggan tetap dapat mendaftar dan masuk, tetapi tidak dimasukkan ke daftar penerima pengumuman promosi. Persetujuan dapat diubah dari halaman akun.

## Menyiapkan admin pertama

1. Di project Supabase yang sama, buka **Authentication → Users** dan buat pengguna admin dengan email yang akan dipakai untuk login dashboard.
2. Salin `User UID` pengguna tersebut.
3. Di **SQL Editor**, jalankan perintah berikut setelah mengganti UUID contoh dengan `User UID` milik admin:

```sql
insert into public.admin_users (user_id)
values ('GANTI-DENGAN-USER-UID');
```

Jangan menambahkan akun pengunjung ke tabel `admin_users`. Project URL dan anon/publishable key boleh digunakan oleh frontend setelah dashboard disiapkan; `service_role` key dan password database harus tetap rahasia.

## Isi database saat ini

Migrasi ini menyiapkan skema dan satu baris pengaturan toko. Data katalog dan stok belum dimasukkan, karena harga, ukuran, foto, dan stok final perlu mengikuti data produk yang sudah Anda siapkan. Nilai stok `NULL` berarti jumlah stok belum ditentukan.

Pesanan dan pembayaran hanya bisa dibaca atau diubah admin melalui kebijakan database. Checkout Midtrans mencadangkan stok saat pesanan disiapkan. Stok fisik baru dikurangi setelah notifikasi pembayaran sukses yang valid diterima. Jika transaksi gagal, dibatalkan, atau kedaluwarsa, reservasi dilepas. Jangan menjalankan ulang migrasi awal pada database yang sudah berisi katalog atau pesanan.

## Cek ongkir RajaOngkir

1. Di Supabase project yang dipakai website, buka **Edge Functions → Secrets** dan simpan API key dengan nama `RAJAONGKIR_API_KEY`. Jangan menaruh key di file website atau mengirimkannya lewat chat.
2. Deploy fungsi `shipping-rates`, `create-midtrans-payment`, dan `midtrans-notification` dari folder `supabase/functions` dengan Supabase CLI atau editor Edge Functions. Masukkan URL fungsi `midtrans-notification` ke **Payment Notification URL** di dashboard Midtrans.
3. Tambahkan secrets server `MIDTRANS_SERVER_KEY` dan `MIDTRANS_CLIENT_KEY` untuk Sandbox, selain `RAJAONGKIR_API_KEY`. Fungsi pembayaran juga memerlukan `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` yang disediakan di lingkungan Edge Functions Supabase. Jangan memasukkan service role key atau server key ke kode frontend atau GitHub.
4. Checkout mencari wilayah, menghitung ongkir, lalu meminta sesi pembayaran Midtrans. Berat sekarang dihitung 500 gram per potong. Sebelum produksi, ganti kredensial, endpoint Snap Sandbox, dan pengaturan notifikasi ke konfigurasi Live setelah akun merchant Midtrans disetujui.
5. Setelah menjalankan migrasi akun dan diskon, perbarui/deploy kode Edge Function yang sudah ada bernama `create-midtrans-payment` dari `supabase/functions/create-midtrans-payment/index.ts`. Jangan membuat fungsi baru dengan nama berbeda; checkout memanggil slug tersebut. Deploy perubahan file website (`checkout.js`, `checkout.html`, `akun.js`, `admin.js`, `index.html`, dan `style.css`) bersamaan agar login checkout, nominal Midtrans, dan invoice menampilkan aturan yang sama.

API key RajaOngkir hanya disimpan sebagai secret server. Jangan menyalinnya ke `supabase-config.js`, JavaScript halaman, atau GitHub. API Shipping Cost RajaOngkir menghitung tarif live; respons dan ketersediaan layanan dapat berbeda sesuai rute dan kurir.

## Kampanye email promo

1. Buat akun Resend, verifikasi domain pengirim, lalu siapkan API key untuk pengiriman. Pengiriman produksi memerlukan alamat `from` dari domain yang sudah diverifikasi.
2. Di **Supabase → Edge Functions → Secrets**, simpan `RESEND_API_KEY` dan `PROMO_FROM_EMAIL` (contoh format nilai: `Urbann Attier <promo@domain-anda>`). Jangan simpan API key di kode atau GitHub.
3. Terapkan migrasi `202611170001_promo_email_media.sql` untuk menyimpan gambar dan tautan tombol pada riwayat kampanye.
4. Deploy Edge Function dengan nama persis `promo-email` dari folder `supabase/functions/promo-email`. Pastikan **Verify JWT** dimatikan untuk fungsi ini; kode fungsi tetap memeriksa sesi dan hak admin sendiri, sementara pemeriksaan gateway perlu dilewati agar permintaan preflight `OPTIONS` dari browser diterima. Konfigurasi ini juga tercatat di `supabase/config.toml` (`verify_jwt = false`). Fungsi mengirim per penerima melalui batch berukuran maksimal 100 email per permintaan provider, mencatat ringkasan hasil, dan menyediakan tautan serta header one-click berhenti berlangganan.
5. Pada dashboard, buka **Email promo**, periksa jumlah penerima, isi subjek/pesan, dan bila perlu masukkan URL gambar publik serta teks dan alamat tombol. Tautan web yang ditulis di isi pesan otomatis dapat diklik. Daftar penerima dihitung ulang di server saat pengiriman; setiap email dikirim hanya kepada alamat yang terverifikasi dan masih menyetujui promosi.
6. Email kampanye memakai kuota pengiriman transactional API Resend. Uji pertama kali dengan jumlah kecil dan alamat milik sendiri sebelum mengirim kampanye lebih luas.

Bagian sorotan halaman utama menampilkan tiga produk terbaru berdasarkan waktu produk ditambahkan dan tiga produk terlaris berdasarkan jumlah item dari pesanan lunas. Setelah migrasi `202611150003_homepage_spotlight_content.sql` dijalankan, admin dapat mengatur teaser Coming Soon dan kampanye promo beserta jadwalnya dari tab **Sorotan & promo**. Jika tidak ada promo yang aktif, halaman menampilkan ajakan untuk bergabung sebagai member. Teks promo tidak mengubah harga atau diskon checkout.
