# LiteraKebumen

> Ruang baca digital & arsip publik literasi Kebumen.
> *Merawat ingatan. Menjaga gagasan.*

Platform web arsip kolektif untuk **Karya Tulis** dan **Review Acara** komunitas literasi Kebumen — dengan CMS internal untuk Admin & Kurator, publikasi editorial, dan arsip jangka panjang yang dapat ditelusuri.

![Node](https://img.shields.io/badge/Node.js-22%2B-green) ![DB](https://img.shields.io/badge/SQLite-WAL-blue) ![Mode](https://img.shields.io/badge/production--ready-yes-brightgreen)

## ✨ Fitur

**Website publik**
- Beranda editorial dengan featured content & arsip terbaru
- Dua kanal: **Karya Tulis** & **Review Acara** (metadata acara terpisah: nama, tanggal, penyelenggara, lokasi)
- Pencarian, filter kategori & tahun, pagination
- Arsip per tahun, halaman baca fokus (kolom 720px, serif), konten terkait
- Responsive mobile-first, empty states, halaman 404

**CMS (`/admin`)**
- Role-based: **Admin** & **Kurator** (diperiksa server-side, bukan hanya UI)
- Editor rich-text + upload gambar (drag & drop)
- Workflow: Draft → Publish → Archive → Soft delete → Restore
- Riwayat revisi & pemulihan versi
- Kategori, media library, activity log, manajemen pengguna

**Production-ready**
- 🔒 CSP & security headers, rate limiting, sanitasi anti-XSS, validasi upload 3 lapis, sesi aman
- ⚡ Gzip, cache aset statis, SQLite WAL
- 🔍 `sitemap.xml`, `robots.txt`, slug unik + redirect 301, SEO metadata per konten
- 🛠 Request log, graceful shutdown, backup harian (`backup.sh`)

## 🚀 Mulai Cepat

```bash
git clone https://github.com/Nizarjoe/literakebumen.git
cd literakebumen
npm install
NODE_ENV=production SEED_DEMO=1 node server.js
# → http://localhost:3020  |  Dashboard: /admin
```

Kredensial admin pertama dibangkitkan acak dan dicetak di `data/initial-admin.txt` — **ganti segera lewat dashboard, lalu hapus file itu**.

Bisa juga tentukan sendiri saat boot pertama:
```bash
NODE_ENV=production SEED_DEMO=1 ADMIN_EMAIL=admin@domainku.id ADMIN_PASSWORD='sandi-panjang' node server.js
```

## 📖 Dokumentasi

Panduan lengkap — instalasi, konfigurasi env vars, panduan Admin/Kurator, dokumentasi API, keamanan, backup & pemulihan, deploy (systemd + Nginx / Railway / Render), struktur proyek, dan troubleshooting — ada di:

**→ [docs/DOKUMENTASI.md](docs/DOKUMENTASI.md)**

## 🧰 Teknologi

| Layer | Teknologi |
|---|---|
| Runtime | Node.js ≥ 22 |
| Backend | Express 4, Multer (upload) |
| Database | SQLite bawaan Node (`node:sqlite`), WAL |
| Frontend | Vanilla JS SPA + design system editorial |
| Tipografi | DM Serif Display + Inter |

Tanpa database eksternal, tanpa layanan berbayar — cukup Node 22 dan satu folder.

## 🗂 Struktur Singkat
```
server.js          API + keamanan + SEO + static server
db.js              Schema SQLite + bootstrap admin + seed
docs/              Dokumentasi lengkap
public/            SPA publik + dashboard CMS
data/litera.db     Database (WAL) — file utama untuk backup
```

## 📜 Lisensi

MIT
