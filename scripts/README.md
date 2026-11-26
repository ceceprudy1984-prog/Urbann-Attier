# Halaman SEO produk

Website ini menggunakan hosting statis. Workflow GitHub Actions `.github/workflows/deploy-pages.yml` menjalankan pembuat halaman SEO setiap jam, setiap ada push ke `main`, atau saat dijalankan manual. Setelah workflow diaktifkan, produk aktif baru dari katalog Supabase akan dibuatkan halaman SEO dan dimasukkan ke sitemap pada pemeriksaan berikutnya; website lalu di-deploy otomatis. Jadwal dapat tertunda jika antrean GitHub Actions sedang padat.

Untuk pembaruan langsung atau jika workflow belum aktif, jalankan pembuat halaman secara manual:

```powershell
node scripts/generate-seo-pages.mjs
```

Script mengambil produk aktif dan gambar publik dari Supabase menggunakan publishable key di `supabase-config.js`, lalu membuat satu halaman awal-HTML per produk di folder `produk/` dan memperbarui `sitemap.xml`. Jalankan ulang setelah menambah, mengubah, menonaktifkan, atau menghapus produk agar halaman statis dan sitemap tetap sama dengan katalog.

Script tidak mengubah data Supabase. Jangan menaruh `service_role` key atau secret di file konfigurasi website.
