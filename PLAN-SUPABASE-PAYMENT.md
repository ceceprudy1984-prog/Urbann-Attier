# Rencana Supabase, Ongkir, dan Payment Gateway — Urbann Attier

## Status saat ini

- Website dan dashboard admin memakai project Supabase terpisah `urbann attier store`.
- Checkout WhatsApp manual sudah berjalan. Harga, pesanan, dan stok diperiksa melalui database.
- Fungsi RajaOngkir `shipping-rates` telah dibuat dan diuji dari Supabase. Pencarian tujuan dan perhitungan ongkir berjalan; checkout menampilkan tarif sebagai perkiraan dan admin mengonfirmasi biaya akhir.
- Perubahan status pengiriman otomatis disimpan sebagai rencana lanjutan. Penerapannya memerlukan API pelacakan AWB dan saluran notifikasi pelanggan; dukungan AWB berbeda antar-ekspedisi.

## Rencana payment gateway

Keputusan awal: **Midtrans Snap, mulai dari Sandbox**. Akun Midtrans belum dibuat. Jangan mengaktifkan transaksi produksi sebelum klien menyetujui alur, akun merchant, biaya, dan metode pembayaran.

1. Siapkan akun Midtrans Sandbox dan simpan Server Key sebagai Supabase Secret. Client Key boleh dipakai pada halaman checkout; Server Key tidak boleh masuk ke HTML, JavaScript browser, GitHub, atau chat.
2. Buat fungsi server untuk menghitung ulang harga, kemasan, ongkir terpilih, dan total dari data yang dipercaya. Jangan menerima jumlah pembayaran dari browser sebagai nilai final.
3. Buat pesanan berstatus menunggu pembayaran dan minta Snap token dari Midtrans melalui Supabase Edge Function. Checkout menampilkan UI pembayaran Snap.
4. Terima notifikasi Midtrans melalui fungsi webhook. Verifikasi signature/status transaksi dari sisi server dan proses notifikasi secara idempoten agar pembayaran serta stok tidak tercatat dua kali.
5. Pada status pembayaran sukses yang tervalidasi, ubah status pembayaran/pesanan dan kurangi stok tepat satu kali. Pesanan yang masih menunggu pembayaran perlu reservasi stok sementara agar tidak oversold; reservasi dilepas ketika transaksi kedaluwarsa/gagal sesuai kebijakan yang ditetapkan.
6. Uji alur berhasil, pending, dibatalkan, kedaluwarsa, notifikasi ganda, dan kegagalan API di Sandbox. Pindah ke kredensial produksi setelah uji dan persetujuan klien.

## Keputusan ongkir untuk checkout gateway

- Tarif yang dipilih pelanggan dari RajaOngkir menjadi nilai ongkir yang dibayar; admin tidak mengonfirmasi ulang sebelum pembayaran.
- Sebelum produksi, pastikan nilai tarif mewakili berat yang benar-benar ditagihkan ekspedisi. Checkout saat ini mengirim berat aktual 500 gram per potong; ukuran paket belum dipakai pada permintaan kalkulasi. Perbedaan berat aktual dan berat volume dapat menimbulkan selisih yang perlu ditanggung toko.

## Rencana lanjutan pelacakan pengiriman

- Setelah admin memasukkan kurir dan nomor resi, sistem dapat memeriksa tracking secara berkala dan memperbarui status pesanan.
- Untuk mengirim pesan WhatsApp otomatis dibutuhkan WhatsApp Business Platform/API atau penyedia resmi; tautan `wa.me` saat ini hanya membuka pesan yang perlu dikirim manual.
- Periksa dukungan tracking tiap kurir dan paket RajaOngkir sebelum implementasi. Fitur kalkulasi ongkir yang aktif saat ini tidak otomatis membuat resi atau mengambil status perjalanan paket.

## Aturan keamanan dan alur bisnis

- Harga, stok, total, dan status pembayaran diputuskan di server/database, bukan berdasarkan data browser.
- Semua credential provider disimpan di Supabase Edge Function Secrets.
- Browser hanya menerima data publik dan token Snap yang dibutuhkan untuk membuka UI pembayaran.
- Notifikasi Midtrans dianggap valid setelah diverifikasi; callback di browser bukan bukti pembayaran.
- Pembayaran manual tetap diverifikasi admin jika metode tersebut dipertahankan sebagai pilihan.
- Project Supabase lama yang dipakai website lain tidak boleh diubah atau dijeda.

## Catatan teknis

- Edge Function ongkir: `supabase/functions/shipping-rates/index.ts`.
- Migrasi estimasi ongkir: `supabase/migrations/202611110001_store_shipping_quotes.sql`.
- Checkout: `checkout.html` dan `checkout.js`.
- Skema order/payment dan proses stok saat ini berada pada migrasi `supabase/migrations/202611040001_urbann_attier_initial_schema.sql`, `202611050001_checkout_stock_reservation.sql`, `202611060001_admin_order_workflow.sql`, dan migrasi ongkir.
- Integrasi Snap belum diimplementasikan. Nama secret, fungsi, tabel, dan aturan reservasi akan ditambahkan secara bertahap setelah akses Sandbox tersedia.
