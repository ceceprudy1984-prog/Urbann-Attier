# Supabase Urbann Attier

Folder ini berisi migrasi Supabase untuk website Urbann Attier. Project yang saat ini dipakai website bernama `urbann attier store`. Jalankan hanya migrasi yang belum diterapkan pada project tersebut; jangan menjalankan migrasi awal berulang kali.

## Membuat database

1. Buka project Supabase `urbann attier store` dan **SQL Editor**.
2. Migrasi `202611040001_urbann_attier_initial_schema.sql` hanya untuk project baru yang belum memiliki tabel Urbann Attier. Jangan jalankan ulang pada database yang sudah berisi tabel atau produk.
3. Untuk project yang sedang dipakai, jalankan migrasi lanjutan yang belum diterapkan: `202611040002_product_image_storage.sql` untuk unggah foto, `202611040003_enable_catalog_realtime.sql` untuk pembaruan katalog langsung, `202611050001_checkout_stock_reservation.sql` untuk validasi/pengurangan stok saat checkout WhatsApp, dan `202611060001_admin_order_workflow.sql` untuk pencatatan admin serta pemulihan stok ketika pesanan dibatalkan.
4. Dashboard admin menyediakan daftar pesanan, pemeriksaan transfer, ongkir/resi, dan tahap pemrosesan. Aktivitas diperbarui langsung ketika pesanan berubah. Tandai pembayaran lunas hanya setelah transfer benar-benar diverifikasi. Pembatalan sebelum pengiriman mengembalikan stok otomatis; pesanan yang telah dikirim tidak dapat dibatalkan dari alur ini.

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

Pesanan dan pembayaran hanya bisa dibaca atau diubah admin melalui kebijakan database. Form checkout WhatsApp yang ada belum otomatis menyimpan pesanan ke database. Penghubung checkout yang aman dan dashboard admin menjadi tahap implementasi berikutnya setelah project database dibuat.
