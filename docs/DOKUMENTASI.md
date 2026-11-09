# 📚 Dokumentasi LiteraKebumen

Panduan lengkap instalasi, konfigurasi, penggunaan, dan pemeliharaan.

## Daftar Isi
1. [Instalasi](#1-instalasi)
2. [Konfigurasi (Environment Variables)](#2-konfigurasi)
3. [Menjalankan Production](#3-menjalankan-production)
4. [Panduan Admin & Kurator](#4-panduan-admin--kurator)
5. [Dokumentasi API](#5-dokumentasi-api)
6. [Keamanan](#6-keamanan)
7. [Backup & Pemulihan](#7-backup--pemulihan)
8. [Deploy ke Server](#8-deploy-ke-server)
9. [Struktur Proyek](#9-struktur-proyek)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Instalasi

**Syarat:** Node.js ≥ 22 (memakai modul `node:sqlite` bawaan), npm.

```bash
git clone https://github.com/Nizarjoe/literakebumen.git
cd literakebumen
npm install
```

## 2. Konfigurasi

Semua konfigurasi lewat environment variables:

| Variabel | Default | Keterangan |
|---|---|---|
| `PORT` | `3020` | Port server |
| `NODE_ENV` | — | Set `production` di server sungguhan |
| `BASE_URL` | `http://localhost:PORT` | Domain publik, dipakai di `sitemap.xml` (mis. `https://literakebumen.id`) |
| `SEED_DEMO` | — | `1` = isi kategori default + konten contoh + akun kurator saat DB kosong |
| `ADMIN_EMAIL` | `admin@literakebumen.local` | Email admin pertama |
| `ADMIN_PASSWORD` | *(acak)* | Kata sandi admin pertama; jika kosong, dibangkitkan acak dan dicatat di `data/initial-admin.txt` |
| `KURATOR_PASSWORD` | *(acak)* | Kata sandi kurator seed |

## 3. Menjalankan Production

```bash
NODE_ENV=production SEED_DEMO=1 BASE_URL=https://domainmu.id node server.js
```

Rekomendasi systemd (`/etc/systemd/system/litera.service`):

```ini
[Unit]
Description=LiteraKebumen
After=network.target

[Service]
WorkingDirectory=/opt/literakebumen
Environment=NODE_ENV=production
Environment=PORT=3020
Environment=BASE_URL=https://domainmu.id
ExecStart=/usr/bin/node server.js
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now litera
```

### Penting setelah boot pertama
1. Buka `data/initial-admin.txt` → catat kredensial admin.
2. Login ke `/admin` → **Pengguna & Peran** → ganti kata sandi.
3. **Hapus** `data/initial-admin.txt`.

## 4. Panduan Admin & Kurator

Dashboard ada di `/admin`.

### Peran
| Kemampuan | Kurator | Admin |
|---|---|---|
| Buat/edit konten, draft, preview | ✅ | ✅ |
| Publish, arsipkan, hapus (soft) | ✅ | ✅ |
| Kategori & media library | ✅ | ✅ |
| Restore konten terhapus | ❌ | ✅ |
| Hapus permanen | ❌ | ✅ |
| Kelola pengguna & peran | ❌ | ✅ |

### Alur publikasi
```
Draft → (preview) → Publish → tampil di publik
                      ↕
                   Archived (disembunyikan dari publik, masih bisa diedit)
                      ↓
                   Deleted (soft delete — pulihkan via Admin)
```

### Membuat konten
1. Dashboard → **+ Buat Karya Tulis** atau **+ Buat Review Acara**.
2. Isi judul, ringkasan, isi (editor rich-text: heading, bold/italic, list, kutipan, link, gambar).
3. Khusus Review Acara: wajib isi **nama acara** & **tanggal acara**; opsional penyelenggara & lokasi.
4. Panel kanan: penulis, kategori, gambar sampul, SEO title/description.
5. **Simpan Draft** → pratinjau → **Publikasikan**.

Setiap penyimpanan membuat **revisi baru** — dapat dilihat & dipulihkan di panel kanan editor.

### Kategori
Kategori nonaktif tidak muncul di form konten baru & filter publik, tetapi konten lamanya tetap aman.

### Slug & redirect
Slug dibuat otomatis dari judul (huruf kecil, tanda hubung, unik). Jika judul konten published diubah, URL lama otomatis **redirect 301** ke URL baru.

## 5. Dokumentasi API

Semua endpoint di bawah `/api`. Autentikasi: `Authorization: Bearer <token>` (dari login) atau cookie `lit_session`.

### Publik
| Method | Endpoint | Keterangan |
|---|---|---|
| GET | `/api/contents?type=karya\|review&q=&cat=&year=&page=` | Daftar published (12/halaman) |
| GET | `/api/contents/:slug` | Detail + 3 konten terkait |
| GET | `/api/categories` | Kategori + jumlah published |
| GET | `/api/archive` | Indeks tahun & kategori |
| GET | `/sitemap.xml`, `/robots.txt` | SEO |

### Autentikasi
| Method | Endpoint | Keterangan |
|---|---|---|
| POST | `/api/auth/login` | `{email, password}` → token. Rate limit 10/15 menit |
| POST | `/api/auth/logout` | Hapus sesi |
| GET | `/api/auth/me` | User saat ini |

### Konten (perlu login)
| Method | Endpoint | Keterangan |
|---|---|---|
| GET | `/api/contents?status=draft` | Termasuk non-published (khusus login) |
| GET | `/api/contents/by-id/:id` | Untuk editor |
| POST | `/api/contents` | Buat. Field: `type, title, excerpt, body, author_name, category_id, cover_url, status, event_name, event_date, organizer, event_location, seo_title, seo_description` |
| PUT | `/api/contents/:id` | Edit (membuat revisi) |
| POST | `/api/contents/:id/status` | `{status: draft\|published\|archived}` dengan validasi transisi |
| DELETE | `/api/contents/:id` | Soft delete; `{permanent:true}` = Admin only |
| POST | `/api/contents/:id/restore` | Admin only |
| GET | `/api/contents/:id/revisions` | Riwayat revisi |
| POST | `/api/contents/:id/revisions/:ver/restore` | Pulihkan versi |

### Lainnya
| Method | Endpoint | Keterangan |
|---|---|---|
| GET/POST | `/api/categories`, `/api/categories/:id` | Kelola kategori (login) |
| GET/POST | `/api/media` | Media library (login); upload `multipart/form-data` field `file` |
| GET | `/api/stats`, `/api/activity` | Dashboard & activity log (login) |
| GET/POST/PUT | `/api/users` | Admin only |

### Contoh
```bash
TOK=$(curl -s -X POST https://domainmu.id/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@...","password":"..."}' | jq -r .token)

curl -X POST https://domainmu.id/api/contents \
  -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d '{"type":"karya","title":"Judul Tulisan","excerpt":"Ringkasan.","body":"<p>Isi…</p>","author_name":"Nama Penulis","status":"draft"}'
```

## 6. Keamanan

- **Headers**: CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy.
- **Rate limit**: login 10 req/15 menit per IP, API 120 req/menit per IP → `429`.
- **XSS**: isi rich-text disanitasi server-side (whitelist tag; `script`/`iframe`/handler `on*`/`javascript:` dibuang).
- **Upload**: whitelist MIME + cek magic bytes + nama file disanitasi + maks 5 MB.
- **Path traversal**: static server menolak path di luar root.
- **Sesi**: token 256-bit acak, cookie HttpOnly SameSite=Lax (+Secure di production), kadaluarsa 7 hari.
- **RBAC**: pemeriksaan peran di server untuk setiap operasi tulis (bukan hanya menyembunyikan menu).
- **Error**: pesan aman tanpa detail internal; detail hanya di log server.

## 7. Backup & Pemulihan

```bash
./backup.sh                    # backups/litera-backup-<timestamp>.tar.gz (rotasi 14 terakhir)
./backup.sh /mnt/drive-backup  # tulis ke folder lain
```

Cron harian (pukul 02:00):
```
0 2 * * * /opt/literakebumen/backup.sh /var/backups/litera
```

**Pemulihan:**
```bash
tar -xzf litera-backup-<timestamp>.tar.gz -C /opt/literakebumen/
sudo systemctl restart litera
```
Yang dibackup: `data/litera.db` (seluruh konten, pengguna, revisi, log) + `public/uploads/`.

## 8. Deploy ke Server

**VPS (rekomendasi):** systemd (contoh di atas) + Nginx reverse proxy:

```nginx
server {
  server_name literakebumen.id;
  location / {
    proxy_pass http://127.0.0.1:3020;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```
Pasang HTTPS via `certbot --nginx`. Set `BASE_URL=https://literakebumen.id`.

**Railway / Render / Fly.io:** set `NODE_ENV=production`, `PORT`, `BASE_URL`; lampirkan **volume persisten** untuk folder `data/` dan `public/uploads/` (SQLite & upload adalah file lokal).

## 9. Struktur Proyek

```
literakebumen/
├── server.js            API, keamanan, SEO, static server, graceful shutdown
├── db.js                Schema SQLite, bootstrap admin, seed, helper (slug, revisi, log)
├── backup.sh            Backup harian + rotasi
├── public/
│   ├── index.html       SPA publik (shell)
│   ├── app.js           Router & halaman publik
│   ├── style.css        Design tokens (Editorial Minimalism)
│   ├── admin.html       Shell dashboard CMS
│   ├── admin.js         Logika dashboard
│   └── uploads/         Gambar terunggah
└── data/
    ├── litera.db        Database (WAL) — file terpenting
    └── initial-admin.txt  Kredensial awal (hapus setelah dibaca!)
```

**Model data utama:** `users`, `contents` (karya/review + status lifecycle), `categories`, `media`, `content_revisions`, `activity_log`, `slug_redirects`, `sessions`.

## 10. Troubleshooting

| Masalah | Solusi |
|---|---|
| `node:sqlite is not available` | Node < 22. Upgrade Node. |
| Lupa sandi admin | Hapus `data/litera.db*` (⚠️ data hilang) ATAU reset langsung: buat hash baru dengan `node -e "const{hashPassword}=require('./db');console.log(hashPassword('sandiBaru'))"` lalu UPDATE tabel users. |
| `429 Too Many Requests` | Tunggu jendela rate limit (15 menit utk login). |
| Upload gagal | Maks 5 MB, format PNG/JPG/WebP/GIF; cek izin tulis `public/uploads/`. |
| Gambar lama hilang setelah deploy | Volume `public/uploads` tidak persisten — lampirkan volume. |
| Sitemap masih `localhost` | Set `BASE_URL` ke domain publik. |
