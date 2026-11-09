// LiteraKebumen — database layer (node:sqlite)
const { DatabaseSync } = require("node:sqlite");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, "litera.db"));
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','kurator')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_name TEXT NOT NULL,
  url TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  alt_text TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS contents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('karya','review')),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  excerpt TEXT DEFAULT '',
  body TEXT DEFAULT '',
  author_name TEXT NOT NULL,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  cover_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived','deleted')),
  published_at TEXT,
  event_name TEXT, event_date TEXT, organizer TEXT, event_location TEXT,
  seo_title TEXT, seo_description TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS content_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id INTEGER NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  snapshot TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_name TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  metadata TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS slug_redirects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  old_slug TEXT NOT NULL UNIQUE,
  new_slug TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY, value TEXT
);
CREATE INDEX IF NOT EXISTS idx_contents_status ON contents(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_contents_type ON contents(type, status);
CREATE INDEX IF NOT EXISTS idx_rev_content ON content_revisions(content_id, version DESC);
`);

function hashPassword(pw, salt) {
  salt = salt || crypto.randomBytes(16).toString("hex");
  return salt + ":" + crypto.scryptSync(pw, salt, 64).toString("hex");
}
function verifyPassword(pw, stored) {
  const [salt, h] = String(stored).split(":");
  if (!salt || !h) return false;
  const a = Buffer.from(h, "hex");
  const b = crypto.scryptSync(pw, salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function slugify(t) {
  return String(t).toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim()
    .replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 120) || "konten";
}
function uniqueSlug(title, excludeId) {
  const base = slugify(title);
  let s = base, i = 2;
  while (true) {
    const row = excludeId
      ? db.prepare("SELECT id FROM contents WHERE slug=? AND id<>?").get(s, excludeId)
      : db.prepare("SELECT id FROM contents WHERE slug=?").get(s);
    if (!row) return s;
    s = base + "-" + i++;
  }
}
function log(user, action, entityType, entityId, metadata) {
  try {
    db.prepare("INSERT INTO activity_log (user_name, action, entity_type, entity_id, metadata) VALUES (?,?,?,?,?)")
      .run(user, action, entityType, entityId || null, metadata || "");
  } catch {}
}
function saveRevision(contentId, user) {
  const c = db.prepare("SELECT * FROM contents WHERE id=?").get(contentId);
  if (!c) return;
  const v = (db.prepare("SELECT MAX(version) v FROM content_revisions WHERE content_id=?").get(contentId).v || 0) + 1;
  db.prepare("INSERT INTO content_revisions (content_id, version, snapshot, changed_by) VALUES (?,?,?,?)")
    .run(contentId, v, JSON.stringify(c), user);
}

/* ---------------- first boot ---------------- */
const userCount = db.prepare("SELECT COUNT(*) n FROM users").get().n;

if (userCount === 0) {
  const email = (process.env.ADMIN_EMAIL || "admin@literakebumen.local").toLowerCase();
  let password = process.env.ADMIN_PASSWORD || "";
  let generated = false;
  if (!password) {
    password = crypto.randomBytes(12).toString("base64url").slice(0, 16);
    generated = true;
  }
  db.prepare("INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)")
    .run(process.env.ADMIN_NAME || "Admin LiteraKebumen", email, hashPassword(password), "admin");
  const admin = db.prepare("SELECT * FROM users WHERE email=?").get(email);

  if (generated) {
    const credPath = path.join(DATA_DIR, "initial-admin.txt");
    fs.writeFileSync(credPath,
      `Dibuat: ${new Date().toISOString()}\nEmail: ${email}\nKata sandi: ${password}\n\nSegera ganti kata sandi ini lewat dashboard -> Pengguna & Peran, lalu hapus file ini.\n`,
      { mode: 0o600 });
    console.log(`[init] Akun admin dibuat. Kredensial awal: ${credPath}`);
  }
  log(admin.name, "bootstrap_admin", "user", admin.id, email);

  if (process.env.SEED_DEMO === "1") {
    const kpass = process.env.KURATOR_PASSWORD || crypto.randomBytes(10).toString("base64url");
    db.prepare("INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)")
      .run("Kurator", "kurator@literakebumen.local", hashPassword(kpass), "kurator");
    if (!process.env.KURATOR_PASSWORD) {
      fs.appendFileSync(path.join(DATA_DIR, "initial-admin.txt"), `Kurator email: kurator@literakebumen.local\nKurator kata sandi: ${kpass}\n`);
    }
    seedDemo(admin);
  }
}

function seedDemo(admin) {
  const cats = [
    ["Esai", "esai", "Esai dan tulisan reflektif"],
    ["Opini", "opini", "Tulisan opini dan pendapat"],
    ["Catatan", "catatan", "Catatan dan jurnal kegiatan"],
    ["Resensi", "resensi", "Resensi buku dan karya"],
    ["Dokumentasi", "dokumentasi", "Dokumentasi kegiatan komunitas"],
  ];
  const insCat = db.prepare("INSERT OR IGNORE INTO categories (name, slug, description) VALUES (?,?,?)");
  for (const c of cats) insCat.run(...c);
  const esai = db.prepare("SELECT id FROM categories WHERE slug='esai'").get();

  const demo = [
    {
      type: "karya", title: "Merawat Ingatan di Tengah Arus Waktu",
      excerpt: "Tentang mengapa sebuah komunitas perlu merawat ingatannya secara kolektif, dan apa yang hilang bila gagasan tidak pernah dicatat.",
      body: "<p>Setiap komunitas memiliki ingatan. Ingatan itu tidak lahir dari dokumen resmi, melainkan dari percakapan panjang setelah pertemuan, catatan kecil di buku tulis, dan foto-foto yang dibagikan tanpa perencanaan.</p><h2>Ingatan yang tersebar</h2><p>Masalahnya, ingatan tersebut tersebar. Ia menempel pada media sosial yang berganti algoritma, pada percakapan yang menguap, dan pada penyimpanan pribadi yang tak pernah dibuka lagi.</p><blockquote>Merawat ingatan bukan pekerjaan satu orang, melainkan kebiasaan kolektif.</blockquote><p>Arsip publik adalah jawaban yang sederhana: satu tempat yang terbuka, terstruktur, dan dapat ditemukan kembali kapan pun.</p>",
      author_name: "Tim LiteraKebumen", category_id: esai ? esai.id : null, status: "published",
    },
    {
      type: "review", title: "Catatan Setelah Diskusi Literasi di Perpustakaan",
      excerpt: "Refleksi atas diskusi komunitas yang membaca ulang satu karya sastra lokal, dari rencana sederhana hingga percakapan yang tidak terduga.",
      body: "<p>Diskusi berlangsung lebih lama dari rencana. Kertas diskusi yang semula berisi tiga pertanyaan akhirnya meluas menjadi percakapan tentang identitas, tempat, dan cara membaca kembali kota sendiri.</p><h2>Yang berjalan baik</h2><p>Ruang yang terbuka membuat peserta baru berani bicara. Sesi refleksi akhir memberi waktu untuk menampung gagasan yang belum selesai.</p><h2>Yang perlu diperbaiki</h2><ul><li>Waktu untuk pemula bisa diperpanjang.</li><li>Dokumentasi foto perlu satu penanggung jawab.</li></ul><p>Dari diskusi ini, beberapa peserta mengusulkan sesi menulis lanjutan — gagasan yang akan dijadwalkan pada pertemuan berikutnya.</p>",
      author_name: "Tim LiteraKebumen", category_id: null,
      event_name: "Diskusi Literasi Bulanan", event_date: "2026-10-18",
      organizer: "Komunitas Literasi Kebumen", event_location: "Perpustakaan Kota Kebumen",
      status: "published",
    },
    {
      type: "karya", title: "Menulis sebagai Kebiasaan Kolektif",
      excerpt: "Bagaimana kebiasaan menulis bisa tumbuh dari lingkaran kecil yang saling menopang, bukan dari tekad individual semata.",
      body: "<p>Menulis sering digambarkan sebagai pekerjaan menyendiri. Namun di banyak komunitas, justru kebersamaan yang membuat kebiasaan ini bertahan.</p><p>Sebuah lingkaran menulis mingguan memberi dua hal: tenggat yang lembut dan pendengar yang nyata.</p>",
      author_name: "Kontributor", category_id: null, status: "draft",
    },
  ];
  const ins = db.prepare(`INSERT INTO contents (type,title,slug,excerpt,body,author_name,category_id,status,published_at,event_name,event_date,organizer,event_location,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const d of demo) {
    const slug = uniqueSlug(d.title);
    const info = ins.run(d.type, d.title, slug, d.excerpt, d.body, d.author_name, d.category_id, d.status,
      d.status === "published" ? new Date().toISOString() : null,
      d.event_name || null, d.event_date || null, d.organizer || null, d.event_location || null, admin.id);
    saveRevision(info.lastInsertRowid, admin.name);
  }
  log(admin.name, "seed_demo", "content", null, "Konten contoh awal");
}

module.exports = { db, hashPassword, verifyPassword, slugify, uniqueSlug, log, saveRevision };
