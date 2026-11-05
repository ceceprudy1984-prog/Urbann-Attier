# Supabase Urbann Attier

Folder ini berisi migrasi database awal untuk website Urbann Attier. Terapkan hanya pada project Supabase baru yang khusus untuk website ini. Jangan jalankan pada project yang dipakai website lain.

## Membuat database

1. Di Supabase, buat project baru bernama `Urbann Attier` pada akun Anda. Pilih lokasi server yang dekat dengan pelanggan. Buat dan simpan password database di password manager; jangan kirim password atau service-role key ke chat atau masukkan ke file website.
2. Setelah project siap, buka **SQL Editor** pada project baru tersebut.
3. Buka `migrations/202611040001_urbann_attier_initial_schema.sql`, salin seluruh isinya ke SQL Editor, lalu jalankan sekali.
4. Periksa bagian **Table Editor**. Migrasi membuat tabel produk, varian warna/foto, ukuran, stok, pesanan, item pesanan, pembayaran, dan pengaturan toko. Biaya pengemasan awal diatur Rp5.000 dan bisa diubah dari dashboard admin nanti.

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
