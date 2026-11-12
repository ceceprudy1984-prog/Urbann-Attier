# Supabase Urbann Attier

Folder ini berisi migrasi Supabase untuk website Urbann Attier. Project yang saat ini dipakai website bernama `urbann attier store`. Jalankan hanya migrasi yang belum diterapkan pada project tersebut; jangan menjalankan migrasi awal berulang kali.

## Membuat database

1. Buka project Supabase `urbann attier store` dan **SQL Editor**.
2. Migrasi `202611040001_urbann_attier_initial_schema.sql` hanya untuk project baru yang belum memiliki tabel Urbann Attier. Jangan jalankan ulang pada database yang sudah berisi tabel atau produk.
3. Untuk project yang sedang dipakai, jalankan migrasi lanjutan yang belum diterapkan secara berurutan: `202611040002_product_image_storage.sql` untuk unggah foto, `202611040003_enable_catalog_realtime.sql` untuk pembaruan katalog langsung, `202611050001_checkout_stock_reservation.sql` untuk validasi stok dan pencatatan pesanan, `202611060001_admin_order_workflow.sql` untuk alur dashboard admin serta pembatalan, `202611110001_store_shipping_quotes.sql` untuk pilihan tarif ongkir, `202611120001_midtrans_snap_payments.sql` untuk reservasi stok dan konfirmasi Midtrans, lalu `202611120002_service_role_payment_reads.sql` untuk akses terbatas fungsi pembayaran.
4. Checkout website saat ini memakai Midtrans Snap. Fungsi `create-midtrans-payment` memeriksa ulang tarif RajaOngkir, harga, dan stok di server sebelum menyiapkan pembayaran. Fungsi `midtrans-notification` memverifikasi tanda tangan notifikasi Midtrans lalu memperbarui status pesanan dan stok. Pesanan diproses setelah notifikasi pembayaran valid; stok yang gagal/kedaluwarsa dilepas kembali.
5. Dashboard admin menyediakan daftar pesanan, perubahan ongkir/resi, dan tahap pemrosesan. Pesanan Midtrans yang sudah dibayar memperbarui status otomatis. Pesanan manual/transfer dari alur lama tetap dapat dikelola dari dashboard; tandai lunas hanya setelah transfer benar-benar diverifikasi.

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

API key RajaOngkir hanya disimpan sebagai secret server. Jangan menyalinnya ke `supabase-config.js`, JavaScript halaman, atau GitHub. API Shipping Cost RajaOngkir menghitung tarif live; respons dan ketersediaan layanan dapat berbeda sesuai rute dan kurir.
