// LiteraKebumen — Express server (production mode)
const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const zlib = require("zlib");
const multer = require("multer");
const { db, verifyPassword, uniqueSlug, log, saveRevision } = require("./db");

const app = express();
const PORT = process.env.PORT || 3020;
const IS_PROD = process.env.NODE_ENV === "production";
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, "");

/* ================= security headers ================= */
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Content-Security-Policy",
    "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  if (req.path.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
  next();
});

/* ================= compression ================= */
app.use((req, res, next) => {
  const accept = req.headers["accept-encoding"] || "";
  if (!/\bgzip\b/.test(accept)) return next();
  const origSend = res.send.bind(res);
  const origJson = res.json.bind(res);
  const maybeGzip = (body) => {
    const len = typeof body === "string" ? body.length : Buffer.byteLength(body);
    if (len > 1024 && !res.getHeader("Content-Encoding")) {
      res.setHeader("Content-Encoding", "gzip");
      res.setHeader("Vary", "Accept-Encoding");
      return zlib.gzipSync(Buffer.isBuffer(body) ? body : Buffer.from(body));
    }
    return body;
  };
  res.send = (body) => {
    const b = maybeGzip(body);
    res.setHeader("Content-Length", Buffer.byteLength(b));
    return origSend(b);
  };
  res.json = (obj) => {
    const b = maybeGzip(JSON.stringify(obj));
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Length", Buffer.byteLength(b));
    res.end(b);
  };
  next();
});

/* ================= body parsing & static ================= */
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
const staticOpts = { maxAge: IS_PROD ? "7d" : 0, setHeaders: (res, p) => {
  if (p.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
}};
const sendStatic = (root) => (req, res, next) => {
  const fp = path.join(root, req.path === "/" ? "index.html" : decodeURIComponent(req.path.replace(/^\/+/, "")));
  if (!fp.startsWith(root) || !fs.existsSync(fp) || !fs.statSync(fp).isFile()) return next();
  const ext = path.extname(fp);
  const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml", ".xml": "application/xml", ".txt": "text/plain", ".ico": "image/x-icon" };
  res.setHeader("Content-Type", types[ext] || "application/octet-stream");
  res.setHeader("Cache-Control", ext === ".html" ? "no-cache" : (IS_PROD ? "public, max-age=604800" : "no-cache"));
  const data = fs.readFileSync(fp);
  if (IS_PROD && /\bgzip\b/.test(req.headers["accept-encoding"] || "") && data.length > 1024 && /^\.(html|css|js|json|xml|svg|txt)$/.test(ext)) {
    const gz = zlib.gzipSync(data);
    res.setHeader("Content-Encoding", "gzip");
    res.setHeader("Vary", "Accept-Encoding");
    return res.end(gz);
  }
  res.end(data);
};
app.use("/uploads", sendStatic(path.join(__dirname, "public", "uploads")));
app.use(sendStatic(path.join(__dirname, "public")));

/* ================= request log ================= */
app.use((req, res, next) => {
  const t0 = Date.now();
  res.on("finish", () => {
    if (req.path.startsWith("/api/") || res.statusCode >= 400)
      console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - t0}ms`);
  });
  next();
});

/* ================= rate limiting ================= */
const buckets = new Map();
function rateLimit({ windowMs, max, keyFn }) {
  return (req, res, next) => {
    const key = keyFn(req);
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || now > b.reset) { b = { count: 0, reset: now + windowMs }; buckets.set(key, b); }
    b.count++;
    if (buckets.size > 5000) for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k);
    if (b.count > max) return res.status(429).json({ error: "Terlalu banyak permintaan. Coba lagi nanti." });
    next();
  };
}
const ipOf = (req) => req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress;
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, keyFn: ipOf });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, keyFn: ipOf });
app.use("/api/", apiLimiter);

/* ================= session / auth ================= */
const SESSION_DAYS = 7;
function getUser(req) {
  const tok = (req.headers.authorization || "").replace("Bearer ", "") ||
    (req.headers.cookie || "").match(/lit_session=([^;]+)/)?.[1];
  if (!tok) return null;
  const row = db.prepare(`SELECT u.id,u.name,u.email,u.role,s.token FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?`).get(tok);
  if (!row) return null;
  const age = db.prepare("SELECT created_at FROM sessions WHERE token=?").get(tok);
  if (age && Date.now() - new Date(age.created_at + "Z").getTime() > SESSION_DAYS * 864e5) {
    db.prepare("DELETE FROM sessions WHERE token=?").run(tok);
    return null;
  }
  return row;
}
function requireAuth(role) {
  return (req, res, next) => {
    const u = getUser(req);
    if (!u) return res.status(401).json({ error: "Silakan login terlebih dahulu." });
    if (role === "admin" && u.role !== "admin") return res.status(403).json({ error: "Akses tidak cukup. Hanya Admin." });
    req.user = u;
    next();
  };
}
app.post("/api/auth/login", loginLimiter, (req, res) => {
  const { email, password } = req.body || {};
  const u = db.prepare("SELECT * FROM users WHERE email=?").get(String(email || "").toLowerCase().trim());
  if (!u || !verifyPassword(String(password || ""), u.password_hash))
    return res.status(401).json({ error: "Email atau kata sandi salah." });
  const tok = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions (token, user_id) VALUES (?,?)").run(tok, u.id);
  log(u.name, "login", "user", u.id);
  res.setHeader("Set-Cookie", `lit_session=${tok}; HttpOnly; Path=/; SameSite=Lax${IS_PROD ? "; Secure" : ""}; Max-Age=${SESSION_DAYS * 86400}`);
  res.json({ token: tok, user: { id: u.id, name: u.name, email: u.email, role: u.role } });
});
app.post("/api/auth/logout", (req, res) => {
  const tok = (req.headers.authorization || "").replace("Bearer ", "");
  if (tok) db.prepare("DELETE FROM sessions WHERE token=?").run(tok);
  res.setHeader("Set-Cookie", "lit_session=; HttpOnly; Path=/; Max-Age=0");
  res.json({ ok: true });
});
app.get("/api/auth/me", (req, res) => res.json({ user: getUser(req) }));
// session cleanup setiap 24 jam
setInterval(() => db.prepare(`DELETE FROM sessions WHERE created_at < datetime('now', '-${SESSION_DAYS} days')`).run(), 864e5).unref();

/* ================= users (admin) ================= */
app.get("/api/users", requireAuth("admin"), (req, res) => {
  res.json(db.prepare("SELECT id,name,email,role,created_at FROM users ORDER BY id").all());
});
app.post("/api/users", requireAuth("admin"), (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name || !email || !password || password.length < 8 || !["admin", "kurator"].includes(role))
    return res.status(400).json({ error: "Data tidak lengkap. Kata sandi minimal 8 karakter, role admin/kurator." });
  try {
    const info = db.prepare("INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)")
      .run(name, email.toLowerCase().trim(), require("./db").hashPassword(password), role);
    log(req.user.name, "create_user", "user", info.lastInsertRowid, role);
    res.json({ ok: true, id: info.lastInsertRowid });
  } catch (e) { res.status(400).json({ error: "Email sudah digunakan." }); }
});
app.put("/api/users/:id", requireAuth("admin"), (req, res) => {
  const { role, password } = req.body || {};
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(req.params.id);
  if (!u) return res.status(404).json({ error: "Pengguna tidak ditemukan." });
  if (password && String(password).length < 8) return res.status(400).json({ error: "Kata sandi minimal 8 karakter." });
  if (role && ["admin", "kurator"].includes(role)) db.prepare("UPDATE users SET role=?, updated_at=datetime('now') WHERE id=?").run(role, u.id);
  if (password) db.prepare("UPDATE users SET password_hash=?, updated_at=datetime('now') WHERE id=?").run(require("./db").hashPassword(password), u.id);
  log(req.user.name, "update_user", "user", u.id);
  res.json({ ok: true });
});

/* ================= categories ================= */
app.get("/api/categories", (req, res) => {
  res.json(db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM contents ct WHERE ct.category_id=c.id AND ct.status='published') AS published_count
    FROM categories c ORDER BY c.name`).all());
});
app.post("/api/categories", requireAuth(), (req, res) => {
  const { name, description } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: "Nama kategori wajib diisi." });
  const slug = require("./db").slugify(name);
  try {
    const info = db.prepare("INSERT INTO categories (name, slug, description) VALUES (?,?,?)").run(String(name).trim(), slug, description || "");
    log(req.user.name, "create_category", "category", info.lastInsertRowid, name);
    res.json({ ok: true, id: info.lastInsertRowid });
  } catch (e) { res.status(400).json({ error: "Slug kategori sudah ada." }); }
});
app.put("/api/categories/:id", requireAuth(), (req, res) => {
  const { name, description, is_active } = req.body || {};
  const c = db.prepare("SELECT * FROM categories WHERE id=?").get(req.params.id);
  if (!c) return res.status(404).json({ error: "Kategori tidak ditemukan." });
  const used = db.prepare("SELECT COUNT(*) n FROM contents WHERE category_id=? AND status<>'deleted'").get(c.id).n;
  if (is_active === false && used > 0) {
    // nonaktif diperbolehkan; hapus permanen tidak lewat endpoint ini
  }
  db.prepare("UPDATE categories SET name=?, description=?, is_active=?, updated_at=datetime('now') WHERE id=?")
    .run(name ?? c.name, description ?? c.description, is_active === undefined ? c.is_active : (is_active ? 1 : 0), c.id);
  log(req.user.name, "update_category", "category", c.id);
  res.json({ ok: true });
});

/* ================= media ================= */
const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, "public", "uploads"),
    filename: (req, f, cb) => cb(null, Date.now() + "-" + crypto.randomBytes(4).toString("hex") + f.originalname.replace(/[^\w.-]/g, "_").slice(-60)),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, f, cb) => cb(null, /^image\/(png|jpe?g|webp|gif)$/.test(f.mimetype)),
});
app.post("/api/media", requireAuth(), upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "File tidak valid. Gunakan gambar PNG/JPG/WebP/GIF maksimal 5 MB." });
  // validasi magic bytes sederhana
  const fd = fs.openSync(req.file.path, "r");
  const buf = Buffer.alloc(8); fs.readSync(fd, buf, 0, 8, 0); fs.closeSync(fd);
  const sigs = [[0x89, 0x50], [0xff, 0xd8], [0x47, 0x49], [0x52, 0x49]];
  const ok = sigs.some(([a, b]) => buf[0] === a && buf[1] === b) || (buf[0] === 0x52 && buf[1] === 0x49);
  if (!ok) { fs.unlinkSync(req.file.path); return res.status(400).json({ error: "Isi file bukan gambar yang valid." }); }
  const info = db.prepare("INSERT INTO media (file_name,url,mime_type,file_size) VALUES (?,?,?,?)")
    .run(req.file.originalname.slice(0, 120), "/uploads/" + req.file.filename, req.file.mimetype, req.file.size);
  res.json({ ok: true, url: "/uploads/" + req.file.filename, id: info.lastInsertRowid });
});
app.get("/api/media", requireAuth(), (req, res) => {
  res.json(db.prepare("SELECT * FROM media ORDER BY id DESC LIMIT 200").all());
});
app.delete("/api/media/:id", requireAuth("admin"), (req, res) => {
  const m = db.prepare("SELECT * FROM media WHERE id=?").get(req.params.id);
  if (!m) return res.status(404).json({ error: "Media tidak ditemukan." });
  const used = db.prepare("SELECT COUNT(*) n FROM contents WHERE cover_url=? OR body LIKE ?").get(m.url, `%${m.url}%`).n;
  if (used > 0) return res.status(409).json({ error: `Gambar masih dipakai ${used} konten. Copot dulu dari konten.` });
  db.prepare("DELETE FROM media WHERE id=?").run(m.id);
  try { const fp = path.join(__dirname, "public", m.url.replace(/^\/+/, "")); if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch (e) {}
  log(req.user.name, "delete_media", "media", m.id, m.file_name);
  res.json({ ok: true });
});

/* ================= contents ================= */
const PUBLIC_FIELDS = `id,type,title,slug,excerpt,author_name,cover_url,status,published_at,created_at,updated_at,event_name,event_date,organizer,event_location,category_id,
  (SELECT name FROM categories WHERE id=category_id) AS category_name`;

app.get("/api/contents", (req, res) => {
  const { type, q, cat, year, status, page } = req.query;
  const u = getUser(req);
  const where = []; const args = [];
  if (status && u) { where.push("status=?"); args.push(String(status)); }
  else if (!u) where.push("status='published'");
  else if (!status) where.push("status<>'deleted'");
  if (type && ["karya", "review"].includes(type)) { where.push("type=?"); args.push(type); }
  if (cat && /^\d+$/.test(cat)) { where.push("category_id=?"); args.push(cat); }
  if (year && /^\d{4}$/.test(year)) { where.push("strftime('%Y', COALESCE(published_at, created_at))=?"); args.push(year); }
  if (q) { where.push("(title LIKE ? OR excerpt LIKE ? OR body LIKE ? OR author_name LIKE ? OR IFNULL(event_name,'') LIKE ?)"); const like = `%${String(q).slice(0, 100)}%`; args.push(like, like, like, like, like); }
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
  const per = 12; const p = Math.max(1, Math.min(500, parseInt(page) || 1));
  const total = db.prepare(`SELECT COUNT(*) n FROM contents ${whereSql}`).get(...args).n;
  const rows = db.prepare(`SELECT ${PUBLIC_FIELDS} FROM contents ${whereSql} ORDER BY COALESCE(published_at, created_at) DESC LIMIT ? OFFSET ?`)
    .all(...args, per, (p - 1) * per);
  res.json({ items: rows, total, page: p, pages: Math.max(1, Math.ceil(total / per)) });
});
app.get("/api/contents/by-id/:id", requireAuth(), (req, res) => {
  const c = db.prepare(`SELECT *, (SELECT name FROM categories WHERE id=category_id) AS category_name FROM contents WHERE id=? AND status<>'deleted'`).get(req.params.id);
  if (!c) return res.status(404).json({ error: "Konten tidak ditemukan." });
  res.json(c);
});
app.get("/api/contents/:slug", (req, res) => {
  const c = db.prepare(`SELECT *, (SELECT name FROM categories WHERE id=category_id) AS category_name FROM contents WHERE slug=?`).get(String(req.params.slug).slice(0, 140));
  if (!c) return res.status(404).json({ error: "Konten tidak ditemukan." });
  const u = getUser(req);
  if (c.status !== "published" && !u) return res.status(404).json({ error: "Konten tidak ditemukan." });
  if (c.status === "deleted" && (!u || u.role !== "admin")) return res.status(404).json({ error: "Konten tidak ditemukan." });
  const related = db.prepare(`SELECT ${PUBLIC_FIELDS} FROM contents WHERE status='published' AND id<>? AND (type=? OR category_id=?) ORDER BY COALESCE(published_at,created_at) DESC LIMIT 3`)
    .all(c.id, c.type, c.category_id);
  res.json({ ...c, related });
});

/* ================= XSS sanitasi untuk rich text ================= */
const ALLOWED_TAGS = new Set(["p","br","h2","h3","strong","b","em","i","u","ul","ol","li","blockquote","a","img","figure","figcaption","hr"]);
const ALLOWED_ATTR = /^(href|src|alt|title|class|target|rel|loading)$/i;
function sanitizeHtml(html) {
  return String(html || "")
    .replace(/<\s*(script|style|iframe|object|embed|form|input|button|svg|link|meta)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*\/?\s*(script|style|iframe|object|embed|form|input|button|svg|link|meta)[^>]*>/gi, "")
    .replace(/on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/data\s*:\s*text\/html/gi, "")
    .replace(/<(\/?)([\w-]+)((?:[^>"']|"[^"]*"|'[^']*')*)>/g, (m, close, tag, attrs) => {
      if (!ALLOWED_TAGS.has(tag.toLowerCase())) return "";
      const cleanAttrs = attrs.replace(/\s[a-zA-Z-]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/g, (am, av) => {
        const name = am.match(/\s([a-zA-Z-]+)\s*=/)[1];
        return ALLOWED_ATTR.test(name) ? am : "";
      });
      return `<${close}${tag.toLowerCase()}${cleanAttrs}>`;
    });
}

function validateContent(b) {
  const errs = [];
  if (!b.title || !String(b.title).trim()) errs.push("Judul wajib diisi.");
  if (!b.author_name || !String(b.author_name).trim()) errs.push("Penulis wajib diisi.");
  if (!b.body || !String(b.body).trim()) errs.push("Isi konten wajib diisi.");
  if (b.excerpt && String(b.excerpt).length > 500) errs.push("Ringkasan maksimal 500 karakter.");
  if (b.type === "review") {
    if (!b.event_name) errs.push("Nama acara wajib diisi untuk Review Acara.");
    if (!b.event_date) errs.push("Tanggal acara wajib diisi untuk Review Acara.");
  }
  return errs;
}

app.post("/api/contents", requireAuth(), (req, res) => {
  const b = req.body || {};
  b.type = b.type === "review" ? "review" : "karya";
  const errs = validateContent(b);
  if (errs.length) return res.status(400).json({ error: errs.join(" ") });
  const status = ["draft", "published", "archived"].includes(b.status) ? b.status : "draft";
  const slug = uniqueSlug(b.title);
  const info = db.prepare(`INSERT INTO contents (type,title,slug,excerpt,body,author_name,category_id,cover_url,status,published_at,event_name,event_date,organizer,event_location,seo_title,seo_description,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(b.type, String(b.title).trim().slice(0, 200), slug, String(b.excerpt || "").slice(0, 500), sanitizeHtml(b.body), String(b.author_name).trim().slice(0, 120),
      /^\d+$/.test(b.category_id) ? b.category_id : null,
      typeof b.cover_url === "string" && b.cover_url.startsWith("/uploads/") ? b.cover_url : null,
      status, status === "published" ? new Date().toISOString() : null,
      b.event_name ? String(b.event_name).slice(0, 200) : null, b.event_date || null,
      b.organizer ? String(b.organizer).slice(0, 200) : null, b.event_location ? String(b.event_location).slice(0, 200) : null,
      b.seo_title ? String(b.seo_title).slice(0, 200) : null, b.seo_description ? String(b.seo_description).slice(0, 300) : null, req.user.id);
  saveRevision(info.lastInsertRowid, req.user.name);
  log(req.user.name, status === "published" ? "publish" : "create", "content", info.lastInsertRowid, String(b.title).slice(0, 80));
  res.json({ ok: true, id: info.lastInsertRowid, slug });
});
app.put("/api/contents/:id", requireAuth(), (req, res) => {
  const c = db.prepare("SELECT * FROM contents WHERE id=? AND status<>'deleted'").get(req.params.id);
  if (!c) return res.status(404).json({ error: "Konten tidak ditemukan." });
  const b = req.body || {};
  const errs = validateContent({ ...c, ...b });
  if (errs.length) return res.status(400).json({ error: errs.join(" ") });
  let slug = c.slug;
  if (b.title && String(b.title).trim() !== c.title) slug = uniqueSlug(b.title.trim(), c.id);
  const status = ["draft", "published", "archived"].includes(b.status) ? b.status : c.status;
  const published_at = status === "published" ? (c.published_at || new Date().toISOString()) : c.published_at;
  db.prepare(`UPDATE contents SET title=?, slug=?, excerpt=?, body=?, author_name=?, category_id=?, cover_url=?, status=?, published_at=?,
    event_name=?, event_date=?, organizer=?, event_location=?, seo_title=?, seo_description=?, updated_at=datetime('now') WHERE id=?`)
    .run(b.title ? String(b.title).trim().slice(0, 200) : c.title, slug,
      b.excerpt !== undefined ? String(b.excerpt).slice(0, 500) : c.excerpt,
      b.body !== undefined ? sanitizeHtml(b.body) : c.body,
      b.author_name ? String(b.author_name).trim().slice(0, 120) : c.author_name,
      b.category_id !== undefined ? (/^\d+$/.test(b.category_id) ? b.category_id : null) : c.category_id,
      b.cover_url !== undefined ? (typeof b.cover_url === "string" && (b.cover_url.startsWith("/uploads/") || b.cover_url === "") ? (b.cover_url || null) : c.cover_url) : c.cover_url,
      status, published_at,
      b.event_name !== undefined ? (b.event_name ? String(b.event_name).slice(0, 200) : null) : c.event_name,
      b.event_date !== undefined ? (b.event_date || null) : c.event_date,
      b.organizer !== undefined ? (b.organizer ? String(b.organizer).slice(0, 200) : null) : c.organizer,
      b.event_location !== undefined ? (b.event_location ? String(b.event_location).slice(0, 200) : null) : c.event_location,
      b.seo_title !== undefined ? (b.seo_title ? String(b.seo_title).slice(0, 200) : null) : c.seo_title,
      b.seo_description !== undefined ? (b.seo_description ? String(b.seo_description).slice(0, 300) : null) : c.seo_description,
      c.id);
  if (slug !== c.slug) db.prepare("INSERT OR IGNORE INTO slug_redirects (old_slug, new_slug) VALUES (?,?)").run(c.slug, slug);
  saveRevision(c.id, req.user.name);
  log(req.user.name, "update", "content", c.id, String(b.title ?? c.title).slice(0, 80));
  res.json({ ok: true, slug });
});
app.post("/api/contents/:id/status", requireAuth(), (req, res) => {
  const c = db.prepare("SELECT * FROM contents WHERE id=?").get(req.params.id);
  if (!c) return res.status(404).json({ error: "Konten tidak ditemukan." });
  const to = req.body?.status;
  const allowed = { draft: ["draft", "published"], published: ["published", "draft", "archived"], archived: ["archived", "published", "draft"], deleted: ["draft", "published"] };
  if (!["draft", "published", "archived"].includes(to) || !allowed[c.status]?.includes(to))
    return res.status(400).json({ error: `Transisi status dari ${c.status} ke ${to} tidak diizinkan.` });
  db.prepare("UPDATE contents SET status=?, published_at=?, updated_at=datetime('now') WHERE id=?")
    .run(to, to === "published" ? (c.published_at || new Date().toISOString()) : c.published_at, c.id);
  saveRevision(c.id, req.user.name);
  log(req.user.name, "status_" + to, "content", c.id, c.title);
  res.json({ ok: true });
});
app.delete("/api/contents/:id", requireAuth(), (req, res) => {
  const c = db.prepare("SELECT * FROM contents WHERE id=? AND status<>'deleted'").get(req.params.id);
  if (!c) return res.status(404).json({ error: "Konten tidak ditemukan." });
  if (req.body?.permanent === true) {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Hanya Admin dapat menghapus permanen." });
    db.prepare("DELETE FROM contents WHERE id=?").run(c.id);
    log(req.user.name, "delete_permanent", "content", c.id, c.title);
  } else {
    db.prepare("UPDATE contents SET status='deleted', deleted_at=datetime('now'), updated_at=datetime('now') WHERE id=?").run(c.id);
    log(req.user.name, "delete_soft", "content", c.id, c.title);
  }
  res.json({ ok: true });
});
app.post("/api/contents/:id/restore", requireAuth("admin"), (req, res) => {
  const c = db.prepare("SELECT * FROM contents WHERE id=?").get(req.params.id);
  if (!c) return res.status(404).json({ error: "Konten tidak ditemukan." });
  db.prepare("UPDATE contents SET status='draft', deleted_at=NULL, updated_at=datetime('now') WHERE id=?").run(c.id);
  log(req.user.name, "restore", "content", c.id, c.title);
  res.json({ ok: true });
});
app.get("/api/contents/:id/revisions", requireAuth(), (req, res) => {
  res.json(db.prepare("SELECT id,version,changed_by,created_at FROM content_revisions WHERE content_id=? ORDER BY version DESC").all(req.params.id));
});
app.post("/api/contents/:id/revisions/:ver/restore", requireAuth(), (req, res) => {
  const r = db.prepare("SELECT * FROM content_revisions WHERE content_id=? AND version=?").get(req.params.id, req.params.ver);
  if (!r) return res.status(404).json({ error: "Revisi tidak ditemukan." });
  const s = JSON.parse(r.snapshot);
  db.prepare("UPDATE contents SET title=?, excerpt=?, body=?, author_name=?, updated_at=datetime('now') WHERE id=?")
    .run(s.title, s.excerpt, sanitizeHtml(s.body), s.author_name, req.params.id);
  saveRevision(req.params.id, req.user.name);
  log(req.user.name, "restore_revision", "content", req.params.id, "v" + req.params.ver);
  res.json({ ok: true });
});

/* ================= stats / archive / SEO ================= */
app.get("/api/stats", requireAuth(), (req, res) => {
  const s = (sql) => db.prepare(sql).get().n;
  res.json({
    published: s(`SELECT COUNT(*) n FROM contents WHERE status='published'`),
    draft: s(`SELECT COUNT(*) n FROM contents WHERE status='draft'`),
    archived: s(`SELECT COUNT(*) n FROM contents WHERE status='archived'`),
    karya: s(`SELECT COUNT(*) n FROM contents WHERE type='karya' AND status<>'deleted'`),
    review: s(`SELECT COUNT(*) n FROM contents WHERE type='review' AND status<>'deleted'`),
    latest: db.prepare(`SELECT ${PUBLIC_FIELDS} FROM contents WHERE status<>'deleted' ORDER BY updated_at DESC LIMIT 8`).all(),
    activity: db.prepare("SELECT * FROM activity_log ORDER BY id DESC LIMIT 10").all(),
  });
});
app.get("/api/activity", requireAuth(), (req, res) => {
  res.json(db.prepare("SELECT * FROM activity_log ORDER BY id DESC LIMIT 100").all());
});
app.get("/api/archive", (req, res) => {
  const years = db.prepare(`SELECT strftime('%Y', COALESCE(published_at, created_at)) y, COUNT(*) n FROM contents WHERE status='published' GROUP BY y ORDER BY y DESC`).all();
  const cats = db.prepare(`SELECT c.id, c.name, c.slug, COUNT(ct.id) n FROM categories c JOIN contents ct ON ct.category_id=c.id AND ct.status='published' GROUP BY c.id ORDER BY c.name`).all();
  res.json({ years, categories: cats });
});
app.get("/sitemap.xml", (req, res) => {
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  const escX = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const staticPages = ["", "karya-tulis", "review-acara", "arsip", "tentang"];
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
  for (const p of staticPages) xml += `  <url><loc>${BASE_URL}/${p}</loc></url>\n`;
  const rows = db.prepare(`SELECT type, slug, updated_at FROM contents WHERE status='published' ORDER BY published_at DESC LIMIT 5000`).all();
  for (const r of rows) xml += `  <url><loc>${BASE_URL}/${r.type === "review" ? "review-acara" : "karya-tulis"}/${escX(r.slug)}</loc><lastmod>${r.updated_at}</lastmod></url>\n`;
  xml += `</urlset>`;
  res.send(xml);
});
app.get("/robots.txt", (req, res) => {
  res.setHeader("Content-Type", "text/plain");
  res.send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /uploads\nSitemap: ${BASE_URL}/sitemap.xml\n`);
});

/* ================= slug redirects ================= */
app.use((req, res, next) => {
  const m = req.path.match(/^\/(karya-tulis|review-acara)\/(.+)$/);
  if (m) {
    const r = db.prepare("SELECT new_slug FROM slug_redirects WHERE old_slug=?").get(m[2].slice(0, 140));
    if (r) return res.redirect(301, `/${m[1]}/${r.new_slug}`);
  }
  next();
});

/* ================= SPA fallback ================= */
app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Endpoint tidak ditemukan." });
  if (req.path.startsWith("/admin")) {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    return res.sendFile(path.join(__dirname, "public", "admin.html"));
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* ================= error handler ================= */
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "Ukuran file melebihi 5 MB." : "Upload gagal." });
  console.error(`${new Date().toISOString()} ERROR ${req.method} ${req.originalUrl}:`, err.message);
  res.status(500).json({ error: "Terjadi kesalahan pada server. Coba beberapa saat lagi." });
});

/* ================= graceful shutdown ================= */
const server = app.listen(PORT, () =>
  console.log(`LiteraKebumen [${IS_PROD ? "PRODUCTION" : "development"}] berjalan di ${BASE_URL} (port ${PORT})`));
function shutdown(sig) {
  console.log(`\n${sig} diterima — menutup server…`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 8000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
