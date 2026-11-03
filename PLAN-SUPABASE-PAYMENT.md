# Rencana Supabase dan Payment Gateway — Urbann Attier

**Status:** Ditunda atas permintaan pengguna. Jangan mulai implementasi sampai pengguna memanggil kata kunci di bawah.

**Kata kunci untuk melanjutkan:** `LANJUT-SUPABASE-URBANN`

## Rencana kerja

1. Pengguna membuat akun Supabase dan proyek Free untuk lingkungan uji coba.
2. Siapkan tabel produk, varian warna/ukuran, stok, pesanan, dan item pesanan.
3. Atur Row Level Security agar browser tidak dapat mengubah harga atau stok secara langsung.
4. Buat Supabase Edge Function untuk memvalidasi produk, komposisi pembelian ecer/serian/grosir, harga, dan stok; lalu membuat transaksi sandbox melalui payment gateway.
5. Buat Edge Function webhook untuk memverifikasi notifikasi gateway. Jika pembayaran sah, tandai pesanan dibayar dan kurangi stok secara atomik serta idempoten.
6. Hubungkan halaman detail ke alur checkout, lalu uji pembayaran sukses, gagal, kedaluwarsa, stok tidak cukup, dan notifikasi berulang.
7. Sebelum produksi, pilih paket layanan yang sesuai dan aktifkan akun/payment gateway produksi.

## Prinsip implementasi

- Mulai dengan mode sandbox; jangan memakai uang sungguhan saat pengujian.
- Simpan kunci rahasia gateway hanya di Supabase Edge Function Secrets, jangan di HTML atau JavaScript browser.
- Harga dan stok selalu divalidasi di server.
- Stok hanya berkurang setelah webhook pembayaran yang sah diterima.
- Proyek Supabase Free dapat dijeda jika tidak aktif; perhitungkan ini selama pengujian.

## Informasi yang masih diperlukan saat melanjutkan

- Nama penyedia payment gateway yang akan dipakai.
- URL toko/deployment untuk konfigurasi return URL dan webhook.
- Konfirmasi aturan harga dan stok final dari pemilik toko.
