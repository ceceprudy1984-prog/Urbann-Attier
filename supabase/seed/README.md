# Impor katalog lama

Halaman website sekarang membaca katalog dari project Supabase `urbann attier store`. Produk yang sebelumnya ditulis langsung di `main.js` tidak otomatis berpindah ke database, jadi impor satu kali ini menyalin lima produk lama beserta harga, warna, ukuran, dan path foto.

## Cara menjalankan

1. Buka SQL Editor pada project Supabase `urbann attier store`.
2. Buka `initial_catalog_import.sql` di folder ini, salin seluruh isinya ke SQL Editor, lalu klik **Run**.
3. Jalankan `supabase/migrations/202611040003_enable_catalog_realtime.sql` agar halaman website yang sedang terbuka menerima perubahan katalog.
4. Untuk mengunggah foto baru dari komputer lewat dashboard, jalankan juga `supabase/migrations/202611040002_product_image_storage.sql`.
5. Muat ulang halaman website dan dashboard admin.

Jangan jalankan file impor bila tabel `public.products` sudah berisi produk. Script sengaja membatalkan proses jika menemukan data, supaya katalog yang sudah dikelola tidak tertimpa. Foto lama memakai path `assets/...` dan tetap perlu folder aset ikut disertakan saat website diterbitkan.
