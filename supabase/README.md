# Supabase Urbann Attier

Folder ini berisi migrasi Supabase untuk website Urbann Attier. Project yang saat ini dipakai website bernama `urbann attier store`. Jalankan hanya migrasi yang belum diterapkan pada project tersebut; jangan menjalankan migrasi awal berulang kali.

## Membuat database

1. Buka project Supabase `urbann attier store` dan **SQL Editor**.
2. Migrasi `202611040001_urbann_attier_initial_schema.sql` hanya untuk project baru yang belum memiliki tabel Urbann Attier. Jangan jalankan ulang pada database yang sudah berisi tabel atau produk.
3. Untuk project yang sedang dipakai, jalankan migrasi lanjutan yang belum diterapkan: `202611040002_product_image_storage.sql` untuk unggah foto, `202611040003_enable_catalog_realtime.sql` untuk pembaruan katalog langsung, `202611050001_checkout_stock_reservation.sql` untuk validasi/pengurangan stok saat checkout WhatsApp, `202611060001_admin_order_workflow.sql` untuk pencatatan admin serta pemulihan stok ketika pesanan dibatalkan, dan `202611110001_store_shipping_quotes.sql` untuk menyimpan pilihan tarif ongkir.
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

Pesanan dan pembayaran hanya bisa dibaca atau diubah admin melalui kebijakan database. Checkout WhatsApp mencatat pesanan dan mengurangi stok setelah pelanggan mengirim checkout. Pembatalan pesanan sebelum dikirim mengembalikan stok.

## Cek ongkir RajaOngkir

1. Di Supabase project yang dipakai website, buka **Edge Functions → Secrets** dan simpan API key dengan nama `RAJAONGKIR_API_KEY`. Jangan menaruh key di file website atau mengirimkannya lewat chat.
2. Deploy fungsi `shipping-rates` dari folder `supabase/functions/shipping-rates`. Fungsi membaca rahasia tersebut di server Supabase dan menangani pencarian wilayah serta tarif. Bisa memakai Supabase CLI (`supabase functions deploy shipping-rates`) dari root proyek yang sudah dihubungkan ke project Supabase, atau editor Edge Functions di Dashboard.
3. Halaman checkout meminta ongkir saat pelanggan mencari wilayah dan menekan **Cek ongkir**. Berat hitungan awal adalah 500 gram per potong. Tarif yang dipilih disimpan sebagai perkiraan; admin mengonfirmasi ongkir dan total akhir melalui WhatsApp.

API key RajaOngkir hanya disimpan sebagai secret server. Jangan menyalinnya ke `supabase-config.js`, JavaScript halaman, atau GitHub. API Shipping Cost RajaOngkir menghitung tarif live; respons dan ketersediaan layanan dapat berbeda sesuai rute dan kurir.
