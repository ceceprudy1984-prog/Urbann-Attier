# Rencana Supabase dan Payment Gateway — Urbann Attier

**Status:** Dashboard dan katalog publik sudah dihubungkan ke Supabase; impor katalog lama serta pengaktifan Realtime/Storage masih perlu dijalankan.

Permintaan pengguna pada 2026-11-04 membuka kembali rencana ini. Akun Supabase sudah dimiliki; project yang dipakai website lain harus tetap tidak tersentuh. Buat project terpisah khusus Urbann Attier.

## Rencana kerja

1. Project `urbann attier store` sudah dibuat dan berstatus Healthy di organisasi Urbann Attier. Region aktual yang ditampilkan adalah Tokyo (`ap-northeast-1`), meski pilihan awal pada formulir adalah Asia-Pacific.
2. Migrasi awal tabel produk, foto varian, ukuran, stok, pesanan, item pesanan, pembayaran manual, dan pengaturan toko sudah berhasil dijalankan pada project baru.
3. Akun admin pertama sudah terhubung ke `admin_users` dan ditandai aktif. Kebijakan Row Level Security tersedia dari migrasi.
4. Dashboard login/ringkasan dan modul produk/stok dibuat. Modul mendukung harga, varian, ukuran, update stok terpisah, edit, aktif/draft, hapus produk, serta pemilihan foto lokal. Katalog publik kini membaca produk aktif dari Supabase dan bisa menerima pembaruan realtime setelah migrasi publication dijalankan. Jalankan impor katalog satu kali di `supabase/seed/initial_catalog_import.sql`, lalu `202611040003_enable_catalog_realtime.sql`; jalankan `202611040002_product_image_storage.sql` sebelum upload foto baru. Lanjutkan pengelolaan pesanan dan pengaturan toko.
5. Setelah fitur manual siap, pilih gateway dan ekspedisi bila klien menyetujuinya; siapkan Edge Functions untuk validasi order, transaksi, webhook, dan perubahan stok.
6. Sebelum produksi, pilih paket layanan yang sesuai dan aktifkan akun/payment gateway produksi.

## Prinsip implementasi

- Pembayaran awal dilakukan manual melalui WhatsApp sesuai ruang lingkup yang dipilih untuk presentasi.
- Jika gateway diaktifkan nanti, mulai dengan mode sandbox; jangan memakai uang sungguhan saat pengujian.
- Simpan kunci rahasia gateway hanya di Supabase Edge Function Secrets, jangan di HTML atau JavaScript browser.
- Harga dan stok selalu divalidasi di server.
- Stok hanya berkurang setelah webhook pembayaran yang sah diterima.
- Proyek Supabase Free dapat dijeda jika tidak aktif; perhitungkan ini selama pengujian.

## Status teknis dan informasi berikutnya

- Migrasi SQL lokal tersedia di `supabase/migrations/202611040001_urbann_attier_initial_schema.sql` dan sudah berhasil dijalankan pada project baru `urbann attier store`.
- Migrasi tersebut sempat dijalankan pada project lama `urbann attier Project`, yang digunakan website lain. Project lama sudah aktif kembali; tabel tambahan dari migrasi perlu ditinjau sebelum dibersihkan. Jangan menjeda atau menghapus project lama.
- Project percobaan `Rudy84 Project` sedang dijeda untuk menyediakan kuota project Free; data project tersebut masih tersimpan.
- Akun admin pertama berhasil ditambahkan ke `admin_users` pada project baru.
- Koneksi dashboard berikutnya memakai Project URL dan publishable key `sb_publishable_...`; jangan gunakan secret/service-role key di browser.
- File `admin.html`, `admin.css`, `admin.js`, dan `supabase-config.js` disiapkan untuk website statis. Login dan pembacaan ringkasan sebelumnya berhasil di browser. Tombol “Atur stok” membuka editor stok dengan tombol simpan mandiri; produk dapat dihapus dengan konfirmasi dan snapshot pesanan lama tetap tersimpan. Upload foto memakai bucket `product-images`, dibatasi pada tipe gambar dan 10 MB per file; jalankan migrasi Storage terkait sebelum dipakai. Foto yang diunggah berada di bucket publik agar dapat ditampilkan di website, sedangkan unggah/hapus dibatasi untuk admin aktif. Halaman utama, detail, keranjang, dan checkout membaca katalog aktif melalui `main.js`; sinkronisasi instan pada tab yang terbuka memerlukan migrasi Realtime. Impor awal menjaga ID produk lama (`0`–`4`) agar isi keranjang tersimpan tidak berubah. Jangan taruh secret/service-role key di frontend.
- Data katalog, stok final, dan lokasi asal pengiriman masih perlu diisi/ditetapkan.
- Nama provider gateway dan URL toko/deployment baru diperlukan saat tahap otomatisasi pembayaran.
