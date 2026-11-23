# Halaman SEO produk

Website ini menggunakan hosting statis. Jalankan pembuat halaman SEO setelah ada perubahan katalog dan sebelum menerbitkan website:

```powershell
node scripts/generate-seo-pages.mjs
```

Script mengambil produk aktif dan gambar publik dari Supabase menggunakan publishable key di `supabase-config.js`, lalu membuat satu halaman awal-HTML per produk di folder `produk/` dan memperbarui `sitemap.xml`. Jalankan ulang setelah menambah, mengubah, menonaktifkan, atau menghapus produk agar halaman statis dan sitemap tetap sama dengan katalog.

Script tidak mengubah data Supabase. Jangan menaruh `service_role` key atau secret di file konfigurasi website.
