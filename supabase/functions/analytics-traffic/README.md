# Laporan sumber trafik GA4

Section **Sumber trafik** di dashboard admin membaca laporan GA4 melalui Google Analytics Data API. Rahasia Google hanya disimpan di Supabase Edge Function Secrets dan tidak dikirim ke browser.

## Persiapan satu kali

1. Di Google Cloud Console, pilih atau buat project lalu aktifkan **Google Analytics Data API**.
2. Buat service account dan unduh kunci JSON-nya. Jangan masukkan berkas kunci ke repository atau kirimkan lewat chat.
3. Di Google Analytics, buka **Admin → Pengelolaan akses properti** dan tambahkan alamat email service account dengan peran **Viewer**.
4. Di dashboard Supabase project `gezqgavjxonrpovcbdhe`, buka **Edge Functions → Secrets**, lalu tambahkan:
   - `GOOGLE_ANALYTICS_PROPERTY_ID` = `565570796`
   - `GOOGLE_SERVICE_ACCOUNT_JSON` = seluruh isi file JSON service account
5. Deploy Edge Function `analytics-traffic` setelah secret tersedia.

Setelah function aktif, admin dapat membuka **Sumber trafik**, memilih periode 7, 30, atau 90 hari, lalu memuat laporan. Data pembelian/omzet akan kosong sampai event `purchase` dikirim ke GA4.

## Penamaan UTM yang disarankan

- Iklan TikTok: `utm_source=tiktok&utm_medium=paid_social`
- Konten organik TikTok: `utm_source=tiktok&utm_medium=organic_social`
- Iklan Instagram: `utm_source=instagram&utm_medium=paid_social`
- Konten organik Instagram: `utm_source=instagram&utm_medium=organic_social`
- Tambahkan `utm_campaign` dengan nama kampanye yang konsisten. Gunakan huruf kecil dan tanda hubung atau garis bawah.

Contoh tautan produk:

`https://urbannattier.com/produk/gamis-lunara/?utm_source=tiktok&utm_medium=paid_social&utm_campaign=peluncuran-koleksi`
