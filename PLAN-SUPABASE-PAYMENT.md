# Rencana Supabase, Ongkir, dan Payment Gateway — Urbann Attier

## Status saat ini

- Website dan dashboard admin memakai project Supabase terpisah `urbann attier store`.
- Versi website yang sudah dipakai masih checkout WhatsApp manual. Sumber kode lokal sekarang sudah disiapkan untuk checkout Midtrans Sandbox, tetapi belum diterapkan ke Supabase dan website.
- Fungsi RajaOngkir `shipping-rates` telah dibuat dan diuji dari Supabase. Pencarian tujuan dan perhitungan ongkir berjalan; checkout menampilkan tarif sebagai perkiraan dan admin mengonfirmasi biaya akhir.
- Perubahan status pengiriman otomatis disimpan sebagai rencana lanjutan. Penerapannya memerlukan API pelacakan AWB dan saluran notifikasi pelanggan; dukungan AWB berbeda antar-ekspedisi.
- Akun Midtrans Sandbox sudah dibuat. `MIDTRANS_SERVER_KEY` dan `MIDTRANS_CLIENT_KEY` sudah ditambahkan ke Supabase Edge Function Secrets.

## Rencana payment gateway

Keputusan awal: **Midtrans Snap, mulai dari Sandbox**. Jangan mengaktifkan transaksi produksi sebelum klien menyetujui alur, akun merchant, biaya, dan metode pembayaran.

1. Akun dan kunci Midtrans Sandbox sudah disiapkan; Server Key tidak boleh masuk ke HTML, JavaScript browser, GitHub, atau chat.
2. Migrasi `202611120001_midtrans_snap_payments.sql` menambahkan reservasi stok terpisah. Stok tersedia untuk pembeli tidak berkurang permanen sebelum pembayaran sukses; reservasi dilepas pada transaksi gagal/kedaluwarsa.
3. Edge Function `create-midtrans-payment` memeriksa ulang tarif ongkir dari RajaOngkir, menyiapkan order berdasarkan harga database, dan meminta Snap token dari Midtrans.
4. Edge Function `midtrans-notification` memvalidasi signature dan memproses status pembayaran secara idempoten. Pada pembayaran sukses, reservasi dikonversi menjadi pengurangan stok.
5. Checkout sudah diarahkan ke Snap Sandbox. Fungsi server dan migrasi belum diterapkan ke Supabase; endpoint notifikasi Midtrans juga belum dikonfigurasi di dashboard.
6. Setelah penerapan, uji alur berhasil, pending, dibatalkan, kedaluwarsa, notifikasi ganda, dan kegagalan API di Sandbox. Pindah ke kredensial produksi setelah uji dan persetujuan klien.
7. Sebelum produksi, tambahkan pembatasan penyalahgunaan/rate limit untuk endpoint pembuatan pembayaran yang dapat dipanggil pelanggan tanpa akun.

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
- Fungsi baru: `supabase/functions/create-midtrans-payment/index.ts` dan `supabase/functions/midtrans-notification/index.ts`.
- Migrasi pembayaran: `supabase/migrations/202611120001_midtrans_snap_payments.sql`.
- Edge Function `midtrans-notification` harus menerima panggilan eksternal Midtrans, sehingga verifikasi JWT Supabase dimatikan untuk endpoint tersebut; signature Midtrans diverifikasi di dalam fungsi.
