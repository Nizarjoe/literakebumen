/* LiteraKebumen — public SPA router */
const $ = (s, el = document) => el.querySelector(s);
const app = $("#app");
let user = null;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "";
const cover = (c) => c.cover_url || "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#D8D0C3"/><text x="320" y="190" font-family="Georgia" font-size="26" fill="#687263" text-anchor="middle">LiteraKebumen</text></svg>');
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2600); }

async function api(path, opts = {}) {
  const res = await fetch("/api" + path, {
    headers: { "Content-Type": "application/json", ...(user ? { Authorization: "Bearer " + user.token } : {}) },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Terjadi kesalahan.");
  return data;
}

// ---------- components ----------
const card = (c) => `
  <a class="card" href="/${c.type === "review" ? "review-acara" : "karya-tulis"}/${c.slug}" data-nav>
    <img src="${esc(cover(c))}" alt="" loading="lazy">
    <div class="cat">${esc(c.category_name || (c.type === "review" ? "Review Acara" : "Karya Tulis"))}</div>
    <h3>${esc(c.title)}</h3>
    <p>${esc(c.excerpt)}</p>
    <div class="meta">${esc(c.author_name)} · ${fmtDate(c.published_at)}</div>
  </a>`;

const emptyState = (title, msg) => `<div class="empty"><h3>${esc(title)}</h3><p>${esc(msg)}</p></div>`;

const pagination = (data, baseQ) => {
  if (data.pages <= 1) return "";
  const q = new URLSearchParams(baseQ);
  let h = "";
  for (let i = 1; i <= Math.min(data.pages, 10); i++) {
    q.set("halaman", i);
    h += i === data.page ? `<span class="on">${i}</span>` : `<a href="?${q}" data-nav>${i}</a>`;
  }
  return `<nav class="pagination" aria-label="Navigasi halaman">${h}</nav>`;
};

// ---------- pages ----------
async function pageHome() {
  const [karya, review, arch] = await Promise.all([api("/contents?type=karya"), api("/contents?type=review"), api("/archive")]);
  const feat = karya.items[0] || review.items[0];
  let html = `
  <section class="hero">
    <h1>Merawat ingatan. Menjaga gagasan.</h1>
    <p>Ruang baca dan arsip kolektif literasi Kebumen — tempat karya tulis dan dokumentasi kegiatan komunitas dirawat bersama.</p>
    <a class="btn btn-primary" href="/arsip" data-nav>Jelajahi arsip</a>
  </section>`;
  if (feat) {
    html += `
    <section class="section">
      <div class="featured">
        <img src="${esc(cover(feat))}" alt="">
        <div>
          <div class="cat" style="font-size:.75rem;letter-spacing:.1em;text-transform:uppercase;color:var(--terra);font-weight:600">${feat.type === "review" ? "Review Acara" : "Karya Tulis"}${feat.category_name ? " · " + esc(feat.category_name) : ""}</div>
          <h2><a style="color:inherit" href="/${feat.type === "review" ? "review-acara" : "karya-tulis"}/${feat.slug}" data-nav>${esc(feat.title)}</a></h2>
          <p style="margin-top:12px;color:var(--sage)">${esc(feat.excerpt)}</p>
          <div class="meta">Oleh ${esc(feat.author_name)} · ${fmtDate(feat.published_at)}</div>
        </div>
      </div>
    </section>`;
  }
  html += `<section class="section">
    <div class="section-head"><h2>Karya Tulis Terbaru</h2><a href="/karya-tulis" data-nav>Lihat semua →</a></div>
    ${karya.items.length ? `<div class="grid">${karya.items.slice(0, 3).map(card).join("")}</div>` : emptyState("Belum ada karya tulis", "Arsip akan terisi seiring publikasi karya pertama.")}
  </section>
  <section class="section">
    <div class="section-head"><h2>Review Acara Terbaru</h2><a href="/review-acara" data-nav>Lihat semua →</a></div>
    ${review.items.length ? `<div class="review-list">${review.items.slice(0, 3).map((c) => `
      <a class="row" href="/review-acara/${c.slug}" data-nav>
        <img src="${esc(cover(c))}" alt="" loading="lazy">
        <div>
          <div class="event">${esc(c.event_name || "Kegiatan")}${c.event_date ? " · " + fmtDate(c.event_date) : ""}</div>
          <h3>${esc(c.title)}</h3>
          <div class="meta">Review oleh ${esc(c.author_name)} · Dipublikasikan ${fmtDate(c.published_at)}${c.event_location ? " · " + esc(c.event_location) : ""}</div>
        </div>
      </a>`).join("")}</div>` : emptyState("Belum ada review acara", "Dokumentasi kegiatan akan muncul di sini.")}
  </section>
  <section class="section">
    <div class="section-head"><h2>Jelajahi Arsip</h2><a href="/arsip" data-nav>Selengkapnya →</a></div>
    <div class="archive-block">
      ${arch.years.length ? arch.years.slice(0, 6).map((y) => `<a class="year-chip" href="/arsip?tahun=${y.y}" data-nav><b>${y.y}</b> — ${y.n} konten</a>`).join("") : `<p style="color:var(--sage)">Arsip tahun belum tersedia.</p>`}
    </div>
  </section>
  <section class="section" style="border-bottom:none">
    <h2 class="serif" style="font-size:1.5rem;margin-bottom:12px">Tentang LiteraKebumen</h2>
    <p style="max-width:640px;color:var(--sage)">LiteraKebumen adalah arsip publik untuk karya tulis dan review kegiatan komunitas literasi di Kebumen. Bukan sekadar tempat mempublikasikan tulisan, melainkan tempat merawat ingatan dan gagasan kolektif. <a href="/tentang" data-nav>Baca selengkapnya →</a></p>
  </section>`;
  app.innerHTML = html;
}

function toolbar(type, data, q) {
  const cats = data._cats || [];
  return `
  <form class="toolbar" id="filterForm">
    <input class="input" name="q" value="${esc(q.q || "")}" placeholder="${type === "review" ? "Cari judul review, nama acara, penyelenggara…" : "Cari judul, penulis, atau isi tulisan…"}" aria-label="Pencarian">
    <select class="select" name="kategori" aria-label="Filter kategori">
      <option value="">Semua kategori</option>
      ${cats.map((c) => `<option value="${c.id}" ${q.kategori == c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
    </select>
    <select class="select" name="tahun" aria-label="Filter tahun">
      <option value="">Semua tahun</option>
      ${(data._years || []).map((y) => `<option value="${y.y}" ${q.tahun == y.y ? "selected" : ""}>${y.y} (${y.n})</option>`).join("")}
    </select>
    <button class="btn btn-sm btn-primary" type="submit">Terapkan</button>
    ${q.q || q.kategori || q.tahun ? `<a class="chip" href="?">Reset ✕</a>` : ""}
  </form>`;
}

async function pageList(type) {
  const q = Object.fromEntries(new URLSearchParams(location.search));
  q.halaman = q.halaman || "1";
  const params = new URLSearchParams();
  if (q.q) params.set("q", q.q);
  if (q.kategori) params.set("cat", q.kategori);
  if (q.tahun) params.set("year", q.tahun);
  params.set("page", q.halaman);
  params.set("type", type);
  const [data, cats, years] = await Promise.all([
    api("/contents?" + params),
    api("/categories"),
    api("/archive"),
  ]);
  data._cats = cats.filter((c) => c.is_active);
  data._years = years.years;
  const label = type === "review" ? "Review Acara" : "Karya Tulis";
  const desc = type === "review"
    ? "Dokumentasi editorial atas kegiatan literasi yang telah berlangsung — refleksi, proses, dan gagasan yang tersisa."
    : "Kumpulan tulisan, esai, opini, catatan, dan refleksi dari komunitas literasi Kebumen.";
  const baseUrl = type === "review" ? "/review-acara" : "/karya-tulis";
  app.innerHTML = `
  <div class="page-head"><h1>${label}</h1><p>${desc}</p></div>
  ${toolbar(type, data, q)}
  ${data.items.length
    ? (type === "review"
      ? `<div class="review-list" style="border-top:1px solid var(--sand)">${data.items.map((c) => `
          <a class="row" href="${baseUrl}/${c.slug}" data-nav>
            <img src="${esc(cover(c))}" alt="" loading="lazy">
            <div>
              <div class="event">${esc(c.event_name || "Kegiatan")}${c.event_date ? " · " + fmtDate(c.event_date) : ""}${c.event_location ? " · " + esc(c.event_location) : ""}</div>
              <h3>${esc(c.title)}</h3>
              <p style="font-size:.9rem;color:var(--sage);margin-top:6px">${esc(c.excerpt)}</p>
              <div class="meta">Review oleh ${esc(c.author_name)} · ${fmtDate(c.published_at)}</div>
            </div>
          </a>`).join("")}</div>`
      : `<div class="grid" style="padding-top:8px">${data.items.map(card).join("")}</div>`)
    : emptyState(q.q ? "Belum ada tulisan yang cocok" : "Belum ada konten", q.q ? "Coba kata kunci lain atau hapus filter." : "Konten akan terbit di sini setelah diterbitkan oleh redaksi.")}
  ${pagination(data, { ...q })}`;
  $("#filterForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const p = new URLSearchParams();
    for (const [k, v] of f) if (v) p.set(k, v);
    navigate(baseUrl + (p.toString() ? "?" + p : ""));
  });
}

async function pageDetail(type, slug) {
  let c;
  try { c = await api("/contents/" + slug); }
  catch { return page404(); }
  const baseUrl = type === "review" ? "/review-acara" : "/karya-tulis";
  app.innerHTML = `
  <nav class="breadcrumb" aria-label="Breadcrumb"><a href="/" data-nav>Beranda</a> → <a href="${baseUrl}" data-nav>${type === "review" ? "Review Acara" : "Karya Tulis"}</a> → ${esc(c.title)}</nav>
  <article>
    <header class="article-header">
      <div class="cat">${esc(c.category_name || (type === "review" ? "Review Acara" : "Karya Tulis"))}</div>
      <h1>${esc(c.title)}</h1>
      ${c.excerpt ? `<p class="dek">${esc(c.excerpt)}</p>` : ""}
      <p class="meta">Oleh <b>${esc(c.author_name)}</b> · Dipublikasikan ${fmtDate(c.published_at)}</p>
    </header>
    ${type === "review" && c.event_name ? `
    <div class="event-box">
      <div><b>Nama Acara</b><span>${esc(c.event_name)}</span></div>
      ${c.event_date ? `<div><b>Tanggal Acara</b><span>${fmtDate(c.event_date)}</span></div>` : ""}
      ${c.organizer ? `<div><b>Penyelenggara</b><span>${esc(c.organizer)}</span></div>` : ""}
      ${c.event_location ? `<div><b>Lokasi</b><span>${esc(c.event_location)}</span></div>` : ""}
    </div>` : ""}
    ${c.cover_url ? `<img class="article-cover" src="${esc(c.cover_url)}" alt="">` : ""}
    <div class="article-body">${c.body}</div>
    <footer class="article-footer">
      <span style="font-size:.85rem;color:var(--sage)">Kategori: ${esc(c.category_name || "—")}</span>
      <button class="btn btn-sm" id="copyLink">Salin tautan</button>
    </footer>
  </article>
  ${c.related?.length ? `<section class="related"><h2>Konten Terkait</h2><div class="grid">${c.related.map(card).join("")}</div></section>` : ""}`;
  $("#copyLink").addEventListener("click", async () => {
    await navigator.clipboard.writeText(location.href).catch(() => {});
    toast("Tautan berhasil disalin.");
  });
  document.title = c.seo_title || c.title + " — LiteraKebumen";
}

async function pageArchive() {
  const q = Object.fromEntries(new URLSearchParams(location.search));
  const arch = await api("/archive");
  let items = null;
  if (q.tahun || q.tipe || q.kategori) {
    const p = new URLSearchParams();
    if (q.tahun) p.set("year", q.tahun);
    if (q.tipe) p.set("type", q.tipe);
    if (q.kategori) p.set("cat", q.kategori);
    items = await api("/contents?" + p);
  }
  app.innerHTML = `
  <div class="page-head"><h1>Arsip</h1><p>Telusuri seluruh dokumentasi terpublikasi berdasarkan tahun dan kategori.</p></div>
  <section class="section" style="border-bottom:none;padding-top:24px">
    <h2 class="serif" style="font-size:1.3rem;margin-bottom:16px">Indeks Tahun</h2>
    <div class="archive-block">
      ${arch.years.length ? arch.years.map((y) => `<a class="year-chip" href="?tahun=${y.y}${q.tipe ? "&tipe=" + q.tipe : ""}" data-nav><b>${y.y}</b> — ${y.n}</a>`).join("") : `<p style="color:var(--sage)">Arsip tahun ini belum tersedia.</p>`}
    </div>
    <h2 class="serif" style="font-size:1.3rem;margin:32px 0 16px">Jenis Konten</h2>
    <div class="archive-block">
      ${[["", "Semua"], ["karya", "Karya Tulis"], ["review", "Review Acara"]].map(([v, l]) =>
        `<a class="year-chip" style="${(q.tipe || "") === v ? "border-color:var(--terra);color:var(--terra)" : ""}" href="?tipe=${v}${q.tahun ? "&tahun=" + q.tahun : ""}" data-nav>${l}</a>`).join("")}
    </div>
    <h2 class="serif" style="font-size:1.3rem;margin:32px 0 16px">Kategori</h2>
    <div class="archive-block">
      ${arch.categories.length ? arch.categories.map((c) => `<a class="year-chip" href="?kategori=${c.id}${q.tahun ? "&tahun=" + q.tahun : ""}" data-nav>${esc(c.name)} <b>${c.n}</b></a>`).join("") : `<p style="color:var(--sage)">Kategori belum tersedia.</p>`}
    </div>
  </section>
  ${items ? `<section class="section" style="border-bottom:none">
    <div class="section-head"><h2 style="font-size:1.3rem">${items.total} konten ditemukan</h2><a href="/arsip" data-nav>Reset filter ✕</a></div>
    ${items.items.length ? `<div class="grid">${items.items.map(card).join("")}</div>` : emptyState("Arsip untuk filter ini belum tersedia.", "Coba ubah tahun atau kategori.")}
  </section>` : ""}`;
}

async function pageSearch() {
  const q = Object.fromEntries(new URLSearchParams(location.search));
  let data = null;
  if (q.q) data = await api("/contents?q=" + encodeURIComponent(q.q));
  app.innerHTML = `
  <div class="page-head"><h1>Pencarian</h1><p>${q.q ? `Hasil pencarian untuk “${esc(q.q)}”` : "Cari judul, penulis, nama acara, atau kata kunci…"}</p></div>
  <form class="toolbar" id="searchForm">
    <input class="input" name="q" value="${esc(q.q || "")}" placeholder="Cari judul, penulis, nama acara, atau kata kunci…" aria-label="Pencarian" style="max-width:480px">
    <button class="btn btn-primary btn-sm" type="submit">Cari</button>
  </form>
  ${!q.q ? "" : data.items.length
    ? `<p style="color:var(--sage);font-size:.9rem">${data.total} hasil ditemukan</p><div class="grid" style="padding-top:16px">${data.items.map(card).join("")}</div>${pagination(data, { q: q.q })}`
    : emptyState("Belum ada tulisan yang cocok", "Periksa ejaan, coba kata kunci lain, atau hapus filter.")}`;
  $("#searchForm").addEventListener("submit", (e) => { e.preventDefault(); navigate("/cari?q=" + encodeURIComponent(new FormData(e.target).get("q") || "")); });
}

function pageAbout() {
  app.innerHTML = `
  <div class="page-head"><h1>Tentang LiteraKebumen</h1></div>
  <div class="prose">
    <p><b>LiteraKebumen</b> adalah ruang baca digital dan arsip publik bagi komunitas literasi dan kolektif di Kebumen. Kami mendokumentasikan, mengarsipkan, dan mempublikasikan hasil kegiatan literasi kolektif dalam dua bentuk utama: karya tulis dan review acara.</p>
    <h2>Visi</h2>
    <p>Menjadi ruang baca digital yang merawat ingatan, gagasan, dan karya literasi kolektif Kebumen melalui dokumentasi yang terbuka, terstruktur, mudah diakses, dan berkelanjutan.</p>
    <h2>Dua Kanal</h2>
    <ul>
      <li><b>Karya Tulis</b> — tulisan, esai, opini, catatan, refleksi, dan karya intelektual lainnya.</li>
      <li><b>Review Acara</b> — dokumentasi editorial yang merekam pengalaman dan refleksi dari kegiatan yang telah berlangsung.</li>
    </ul>
    <h2>Tata Kelola</h2>
    <p>Arsip ini dikelola secara editorial oleh tim Admin dan Kurator. Seluruh konten yang dipublikasikan telah melewati proses kurasi internal. Arsip ini bukan media sosial — tidak ada komentar, like, atau rating; yang ada hanyalah tulisan yang dirawat.</p>
    <h2>Kontak</h2>
    <p>Kanal resmi komunitas akan dicantumkan di halaman ini seiring berjalannya waktu.</p>
  </div>`;
}

function page404() {
  app.innerHTML = `<div class="empty" style="padding:120px 0"><h1 class="serif" style="font-size:3rem">404</h1><h3>Halaman yang kamu cari tidak ditemukan.</h3><p>Mungkin tautannya berubah atau kontennya tidak lagi tersedia.</p><p style="margin-top:20px"><a class="btn" href="/" data-nav>Kembali ke beranda</a></p></div>`;
}

// ---------- router ----------
const routes = [
  [/^\/$/, () => pageHome()],
  [/^\/karya-tulis$/, () => pageList("karya")],
  [/^\/karya-tulis\/([^/]+)$/, (m) => pageDetail("karya", decodeURIComponent(m[1]))],
  [/^\/review-acara$/, () => pageList("review")],
  [/^\/review-acara\/([^/]+)$/, (m) => pageDetail("review", decodeURIComponent(m[1]))],
  [/^\/arsip$/, () => pageArchive()],
  [/^\/cari$/, () => pageSearch()],
  [/^\/tentang$/, () => pageAbout()],
  [/^\/admin/, () => { location.href = "/admin/"; }],
];

function setActiveNav() {
  const path = location.pathname;
  document.querySelectorAll(".main-nav a, .mobile-nav a").forEach((a) => {
    a.classList.toggle("active", a.getAttribute("href") === path);
  });
}

async function navigate(url, replace) {
  const u = new URL(url, location.origin);
  if (replace) history.replaceState({}, "", u);
  else history.pushState({}, "", u);
  render();
}

async function render() {
  const path = location.pathname;
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (m) { setActiveNav(); try { await fn(m); } catch (e) { app.innerHTML = emptyState("Terjadi kesalahan", e.message || "Coba muat ulang halaman."); } window.scrollTo(0, 0); return; }
  }
  setActiveNav();
  page404();
}

document.addEventListener("click", (e) => {
  const a = e.target.closest("a[data-nav]");
  if (!a || e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  navigate(a.getAttribute("href"));
});
window.addEventListener("popstate", render);

// mobile menu
document.addEventListener("DOMContentLoaded", () => {
  const btn = $("#menuBtn"), nav = $("#mainNav");
  if (btn && nav) {
    nav.classList.add("mobile-nav");
    btn.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      btn.setAttribute("aria-expanded", open);
      btn.textContent = open ? "✕" : "☰";
    });
  }
});

(async () => {
  try { const me = await api("/auth/me"); user = me.user ? { ...me.user } : null; } catch {}
  render();
})();
