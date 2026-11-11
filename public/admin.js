/* LiteraKebumen — Admin dashboard */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const view = $("#view");
let user = null, token = localStorage.getItem("lit_token") || "";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—";
const fmtDT = (iso) => iso ? new Date(iso + (iso.length === 19 ? "Z" : "")).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2600); }

async function api(path, opts = {}) {
  const res = await fetch("/api" + path, {
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    ...opts,
  });
  if (res.status === 401) { showLogin(); throw new Error("Sesi berakhir. Silakan login kembali."); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Terjadi kesalahan.");
  return data;
}

/* ================= LOGIN ================= */
function showLogin() {
  $("#login").style.display = "block";
  $("#shell").style.display = "none";
}
$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#l-err"); err.style.display = "none";
  try {
    const d = await api("/auth/login", { method: "POST", body: JSON.stringify({ email: $("#l-email").value, password: $("#l-pass").value }) });
    token = d.token; localStorage.setItem("lit_token", token);
    user = d.user;
    boot();
  } catch (ex) { err.textContent = ex.message; err.style.display = "block"; }
});
async function logout() {
  await api("/auth/logout", { method: "POST" }).catch(() => {});
  localStorage.removeItem("lit_token"); token = ""; user = null; showLogin();
}
$("#logoutBtn").addEventListener("click", logout);
$("#logoutBtn2").addEventListener("click", logout);

/* ================= SHELL ================= */
function boot() {
  $("#login").style.display = "none";
  $("#shell").style.display = "block";
  $("#who").innerHTML = `<b>${esc(user.name)}</b><br>${esc(user.role === "admin" ? "Admin" : "Kurator")}`;
  if (user.role === "admin") $$(".admin-only").forEach((el) => (el.style.display = ""));
  route();
}

const setStatusBadge = (s) => `<span class="badge ${s}">${s === "published" ? "Published" : s === "draft" ? "Draft" : s === "archived" ? "Archived" : "Deleted"}</span>`;

/* ---------- overview ---------- */
async function pgDashboard() {
  $("#pgTitle").textContent = "Overview";
  $("#pgDesc").textContent = "Ringkasan arsip dan aktivitas terbaru.";
  const s = await api("/stats");
  view.innerHTML = `
  <div class="stats">
    <div class="stat"><b>${s.published}</b><span>Published</span></div>
    <div class="stat"><b>${s.draft}</b><span>Draft</span></div>
    <div class="stat"><b>${s.karya}</b><span>Karya Tulis</span></div>
    <div class="stat"><b>${s.review}</b><span>Review Acara</span></div>
    <div class="stat"><b>${s.archived}</b><span>Archived</span></div>
  </div>
  <div style="display:flex;gap:10px;margin-bottom:24px">
    <a class="btn btn-primary" href="#/editor/karya">+ Buat Karya Tulis</a>
    <a class="btn" href="#/editor/review">+ Buat Review Acara</a>
  </div>
  <div class="panel"><h3>Konten Terbaru</h3>
    <table><thead><tr><th>Judul</th><th>Tipe</th><th>Status</th><th>Diperbarui</th><th></th></tr></thead>
    <tbody>${s.latest.map((c) => `<tr><td><a href="#/editor/${c.id}">${esc(c.title)}</a></td><td>${c.type === "review" ? "Review" : "Karya"}</td><td>${setStatusBadge(c.status)}</td><td class="muted">${fmtDT(c.updated_at)}</td>
    <td><a class="btn btn-sm" href="#/editor/${c.id}">Edit</a></td></tr>`).join("") || '<tr><td colspan="5" class="muted">Belum ada konten.</td></tr>'}</tbody></table>
  </div>
  <div class="panel"><h3>Aktivitas Terbaru</h3>
    <table><thead><tr><th>Pengguna</th><th>Aksi</th><th>Waktu</th></tr></thead>
    <tbody>${s.activity.map((a) => `<tr><td>${esc(a.user_name)}</td><td>${esc(a.action)}${a.metadata ? " — " + esc(a.metadata) : ""}</td><td class="muted">${fmtDT(a.created_at)}</td></tr>`).join("") || '<tr><td colspan="3" class="muted">Belum ada aktivitas.</td></tr>'}</tbody></table>
  </div>`;
}

/* ---------- content list ---------- */
async function pgContents(query) {
  const q = new URLSearchParams(query);
  const tipe = q.get("tipe") || "", status = q.get("status") || "";
  $("#pgTitle").textContent = status === "draft" ? "Draft" : status === "archived" ? "Konten Archived" : tipe === "karya" ? "Karya Tulis" : tipe === "review" ? "Review Acara" : "Semua Konten";
  $("#pgDesc").textContent = "Kelola konten: edit, terbitkan, arsipkan, atau hapus.";
  const p = new URLSearchParams();
  if (tipe) p.set("type", tipe);
  if (status) p.set("status", status);
  p.set("page", "1");
  const d = await api("/contents?" + p);
  view.innerHTML = `
  <div style="display:flex;gap:10px;margin-bottom:18px">
    <a class="btn btn-primary" href="#/editor/${tipe || "karya"}">+ Buat Konten</a>
    ${status ? `<a class="btn" href="#/konten">Lihat semua status</a>` : ""}
  </div>
  <div class="panel">
  <table><thead><tr><th>Judul</th><th>Tipe</th><th>Kategori</th><th>Penulis</th><th>Status</th><th>Diperbarui</th><th>Aksi</th></tr></thead>
  <tbody>${d.items.map((c) => `<tr>
    <td><a href="#/editor/${c.id}"><b>${esc(c.title)}</b></a><br><span class="muted">/${esc(c.slug)}</span></td>
    <td>${c.type === "review" ? "Review" : "Karya"}</td>
    <td>${esc(c.category_name || "—")}</td>
    <td>${esc(c.author_name)}</td>
    <td>${setStatusBadge(c.status)}</td>
    <td class="muted">${fmtDT(c.updated_at)}</td>
    <td><div class="acts">
      <a class="btn btn-sm" href="#/editor/${c.id}">Edit</a>
      ${c.status !== "published" ? `<button class="btn btn-sm btn-primary" data-act="publish" data-id="${c.id}">Publish</button>` : `<button class="btn btn-sm" data-act="unpublish" data-id="${c.id}">Unpublish</button>`}
      ${c.status !== "archived" ? `<button class="btn btn-sm" data-act="archive" data-id="${c.id}">Arsipkan</button>` : ""}
      ${c.status !== "deleted"
        ? `<button class="btn btn-sm btn-danger" data-act="delete" data-id="${c.id}">Hapus</button>`
        : `<button class="btn btn-sm" data-act="restore" data-id="${c.id}">Restore</button>${user.role === "admin" ? `<button class="btn btn-sm btn-danger" data-act="purge" data-id="${c.id}">Permanen</button>` : ""}`}
    </div></td>
  </tr>`).join("") || '<tr><td colspan="7" class="muted">Belum ada konten pada filter ini.</td></tr>'}</tbody></table>
  </div>`;
  view.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const id = b.dataset.id, act = b.dataset.act;
    if (act === "delete" && !confirm("Hapus konten ini? Konten tetap tersimpan dan dapat dipulihkan Admin.")) return;
    if (act === "purge" && !confirm("Hapus PERMANEN? Tindakan ini tidak dapat dibatalkan.")) return;
    try {
      if (act === "publish") await api(`/contents/${id}/status`, { method: "POST", body: JSON.stringify({ status: "published" }) });
      if (act === "unpublish") await api(`/contents/${id}/status`, { method: "POST", body: JSON.stringify({ status: "draft" }) });
      if (act === "archive") await api(`/contents/${id}/status`, { method: "POST", body: JSON.stringify({ status: "archived" }) });
      if (act === "delete") await api(`/contents/${id}`, { method: "DELETE", body: JSON.stringify({}) });
      if (act === "restore") await api(`/contents/${id}/restore`, { method: "POST" });
      if (act === "purge") await api(`/contents/${id}`, { method: "DELETE", body: JSON.stringify({ permanent: true }) });
      toast("Berhasil."); route();
    } catch (ex) { toast(ex.message); }
  }, { once: true });
}

/* ---------- editor ---------- */
async function pgEditor(arg) {
  let c = { type: arg === "review" ? "review" : "karya", status: "draft", title: "", slug: "", excerpt: "", body: "", author_name: user.name, category_id: "", cover_url: "", event_name: "", event_date: "", organizer: "", event_location: "", seo_title: "", seo_description: "" };
  let id = null;
  if (/^\d+$/.test(arg)) {
    id = arg;
    const d = await api("/contents/by-id/" + id);
    c = d; c.category_id = c.category_id || "";
  }
  $("#pgTitle").textContent = id ? "Edit Konten" : "Buat Konten";
  $("#pgDesc").textContent = "Isi konten, simpan draft, lalu terbitkan saat siap.";
  const cats = (await api("/categories")).filter((x) => x.is_active);
  const isReview = c.type === "review";
  const slugPreview = () => { $("#slugPrev").textContent = c.slug || "(otomatis dari judul)"; };

  view.innerHTML = `
  <form id="edForm" class="ed-grid">
    <div>
      <div class="ed-card">
        <h3>Tipe Konten</h3>
        <select class="select" id="f-type" ${id ? "disabled" : ""}>
          <option value="karya" ${!isReview ? "selected" : ""}>Karya Tulis</option>
          <option value="review" ${isReview ? "selected" : ""}>Review Acara</option>
        </select>
      </div>
      <div class="ed-card">
        <label for="f-title">Judul <span class="req">*</span></label>
        <input class="input" id="f-title" value="${esc(c.title)}" required>
        <label>Slug</label>
        <div class="muted" id="slugPrev">${esc(c.slug || "(otomatis dari judul)")}</div>
        <label for="f-excerpt">Ringkasan (wajib untuk publikasi)</label>
        <textarea class="textarea" id="f-excerpt" rows="3">${esc(c.excerpt)}</textarea>
        <label>Isi Konten <span class="req">*</span></label>
        <div class="te-toolbar">
          <button type="button" data-cmd="formatBlock" data-val="p" title="Paragraf">¶</button>
          <button type="button" data-cmd="formatBlock" data-val="h2" title="Judul 2">H2</button>
          <button type="button" data-cmd="formatBlock" data-val="h3" title="Judul 3">H3</button>
          <button type="button" data-cmd="bold"><b>B</b></button>
          <button type="button" data-cmd="italic"><i>I</i></button>
          <button type="button" data-cmd="insertUnorderedList" title="Bullet">• List</button>
          <button type="button" data-cmd="insertOrderedList" title="Nomor">1. List</button>
          <button type="button" data-cmd="quote" title="Kutipan">❝</button>
          <button type="button" data-cmd="link" title="Tautan">🔗</button>
          <button type="button" data-cmd="image" title="Gambar">🖼️</button>
        </div>
        <div class="te" id="f-body" contenteditable="true" data-ph="Tulis isi konten di sini…">${c.body || ""}</div>
      </div>
      <div class="ed-card" id="reviewFields" style="${isReview ? "" : "display:none"}">
        <h3>Metadata Acara</h3>
        <label for="f-event">Nama Acara <span class="req">*</span></label>
        <input class="input" id="f-event" value="${esc(c.event_name || "")}">
        <label for="f-edate">Tanggal Acara <span class="req">*</span></label>
        <input class="input" id="f-edate" type="date" value="${esc(c.event_date || "")}">
        <label for="f-org">Penyelenggara</label>
        <input class="input" id="f-org" value="${esc(c.organizer || "")}">
        <label for="f-loc">Lokasi (opsional)</label>
        <input class="input" id="f-loc" value="${esc(c.event_location || "")}">
      </div>
    </div>
    <div>
      <div class="ed-card">
        <h3>Publikasi</h3>
        <label for="f-status">Status</label>
        <select class="select" id="f-status">
          ${["draft", "published", "archived"].map((s) => `<option value="${s}" ${c.status === s ? "selected" : ""}>${{ draft: "Draft", published: "Published", archived: "Archived" }[s]}</option>`).join("")}
        </select>
        <label for="f-author">Penulis <span class="req">*</span></label>
        <input class="input" id="f-author" value="${esc(c.author_name)}" required>
        <label for="f-cat">Kategori</label>
        <select class="select" id="f-cat"><option value="">— Tanpa kategori —</option>
          ${cats.map((x) => `<option value="${x.id}" ${c.category_id == x.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}
        </select>
      </div>
      <div class="ed-card">
        <h3>Gambar Sampul</h3>
        <img class="cover-prev" id="coverPrev" src="${esc(c.cover_url || "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#F6F3ED"/></svg>'))}" alt="">
        <input type="file" id="f-cover" accept="image/*" style="display:none">
        <button type="button" class="btn btn-sm" id="coverBtn">Pilih gambar</button>
        <button type="button" class="btn btn-sm btn-danger" id="coverDel">Hapus</button>
      </div>
      <div class="ed-card">
        <h3>SEO</h3>
        <label for="f-seot">Meta title</label>
        <input class="input" id="f-seot" value="${esc(c.seo_title || "")}">
        <label for="f-seod">Meta description</label>
        <textarea class="textarea" id="f-seod" rows="3">${esc(c.seo_description || "")}</textarea>
      </div>
      ${id ? `<div class="ed-card"><h3>Riwayat Revisi</h3><div id="revList" class="muted">Memuat…</div></div>` : ""}
    </div>
  </form>
  <div class="actionbar">
    <button class="btn" type="button" id="saveDraft">Simpan Draft</button>
    ${id ? `<a class="btn" href="/${isReview ? "review-acara" : "karya-tulis"}/${esc(c.slug)}" target="_blank">Pratinjau</a>` : ""}
    <button class="btn btn-primary" type="button" id="publishBtn">${c.status === "published" ? "Perbarui" : "Publikasikan"}</button>
    <span class="save-ind" id="saveInd"></span>
  </div>`;

  const collect = () => ({
    type: $("#f-type").value,
    title: $("#f-title").value.trim(),
    excerpt: $("#f-excerpt").value.trim(),
    body: $("#f-body").innerHTML,
    author_name: $("#f-author").value.trim(),
    category_id: $("#f-cat").value || null,
    cover_url: c.cover_url || null,
    status: $("#f-status").value,
    event_name: $("#f-event")?.value.trim() || null,
    event_date: $("#f-edate")?.value || null,
    organizer: $("#f-org")?.value.trim() || null,
    event_location: $("#f-loc")?.value.trim() || null,
    seo_title: $("#f-seot").value.trim() || null,
    seo_description: $("#f-seod").value.trim() || null,
  });

  const save = async (statusOverride) => {
    const data = collect();
    if (statusOverride) data.status = statusOverride;
    try {
      let res;
      if (id) res = await api("/contents/" + id, { method: "PUT", body: JSON.stringify(data) });
      else res = await api("/contents", { method: "POST", body: JSON.stringify(data) });
      toast(statusOverride === "published" ? "Konten diterbitkan." : "Draft berhasil disimpan.");
      if (!id) { location.hash = "#/editor/" + res.id; }
      else { c.slug = res.slug; $("#slugPrev").textContent = res.slug; $("#saveInd").textContent = "Tersimpan " + new Date().toLocaleTimeString("id-ID"); }
      return true;
    } catch (ex) { toast(ex.message); return false; }
  };
  $("#saveDraft").addEventListener("click", () => save("draft"));
  $("#publishBtn").addEventListener("click", () => {
    const d = collect();
    if (!d.excerpt) { toast("Ringkasan wajib diisi untuk publikasi."); return; }
    save("published");
  });
  $("#f-type").addEventListener("change", (e) => {
    $("#reviewFields").style.display = e.target.value === "review" ? "" : "none";
  });
  $("#f-title").addEventListener("input", () => { if (!id) { c.slug = $("#f-title").value.toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-"); slugPreview(); } });

  // cover upload
  $("#coverBtn").addEventListener("click", () => $("#f-cover").click());
  $("#f-cover").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const fd = new FormData(); fd.append("file", f);
    try {
      const res = await fetch("/api/media", { method: "POST", headers: { Authorization: "Bearer " + token }, body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Upload gagal.");
      c.cover_url = d.url; $("#coverPrev").src = d.url;
      toast("Gambar sampul terunggah.");
    } catch (ex) { toast(ex.message); }
  });
  $("#coverDel").addEventListener("click", () => { c.cover_url = null; $("#coverPrev").src = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#F6F3ED"/></svg>'); });

  // rich text toolbar
  $$(".te-toolbar button").forEach((b) => b.addEventListener("click", (e) => {
    e.preventDefault();
    const cmd = b.dataset.cmd;
    if (cmd === "link") { const u = prompt("URL tautan:"); if (u) document.execCommand("createLink", false, u); }
    else if (cmd === "image") {
      const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
      inp.onchange = async () => {
        const fd = new FormData(); fd.append("file", inp.files[0]);
        const res = await fetch("/api/media", { method: "POST", headers: { Authorization: "Bearer " + token }, body: fd });
        const d = await res.json();
        if (res.ok) document.execCommand("insertImage", false, d.url); else toast(d.error);
      };
      inp.click();
    }
    else if (cmd === "quote") document.execCommand("formatBlock", false, "blockquote");
    else document.execCommand(cmd, false, b.dataset.val || null);
    $("#f-body").focus();
  }));

  // revisions
  if (id) {
    api(`/contents/${id}/revisions`).then((revs) => {
      $("#revList").innerHTML = revs.length ? revs.map((r) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #efece5">
          <span>v${r.version} · ${esc(r.changed_by)}<br><span class="muted">${fmtDT(r.created_at)}</span></span>
          <button type="button" class="btn btn-sm" data-rev="${r.version}">Pulihkan</button>
        </div>`).join("") : "Belum ada revisi.";
      $("#revList").addEventListener("click", async (e) => {
        const b = e.target.closest("button[data-rev]");
        if (!b || !confirm("Pulihkan versi " + b.dataset.rev + "? Perubahan saat ini akan diganti.")) return;
        try { await api(`/contents/${id}/revisions/${b.dataset.rev}/restore`, { method: "POST" }); toast("Revisi dipulihkan."); pgEditor(id); }
        catch (ex) { toast(ex.message); }
      });
    });
  }
}

/* ---------- categories ---------- */
async function pgCategories() {
  $("#pgTitle").textContent = "Kategori";
  $("#pgDesc").textContent = "Kelola kategori konten.";
  const cats = await api("/categories");
  view.innerHTML = `
  <div class="panel"><h3>Tambah Kategori</h3>
    <form id="catForm" style="display:flex;gap:10px;flex-wrap:wrap;align-items:end">
      <div style="flex:1;min-width:180px"><label for="c-name">Nama</label><input class="input" id="c-name" required></div>
      <div style="flex:1.5;min-width:220px"><label for="c-desc">Deskripsi</label><input class="input" id="c-desc"></div>
      <button class="btn btn-primary" type="submit">Tambah</button>
    </form>
  </div>
  <div class="panel">
  <table><thead><tr><th>Nama</th><th>Slug</th><th>Deskripsi</th><th>Status</th><th>Published</th><th>Aksi</th></tr></thead>
  <tbody>${cats.map((c) => `<tr>
    <td><b>${esc(c.name)}</b></td><td class="muted">${esc(c.slug)}</td><td class="muted">${esc(c.description || "—")}</td>
    <td>${c.is_active ? '<span class="badge published">Aktif</span>' : '<span class="badge archived">Nonaktif</span>'}</td>
    <td>${c.published_count}</td>
    <td><div class="acts">
      <button class="btn btn-sm" data-edit="${c.id}" data-name="${esc(c.name)}">${c.is_active ? "Nonaktifkan" : "Aktifkan"}</button>
    </div></td></tr>`).join("")}</tbody></table></div>`;
  $("#catForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try { await api("/categories", { method: "POST", body: JSON.stringify({ name: $("#c-name").value, description: $("#c-desc").value }) }); toast("Kategori ditambahkan."); route(); }
    catch (ex) { toast(ex.message); }
  });
  view.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-edit]");
    if (!b) return;
    try { await api("/categories/" + b.dataset.edit, { method: "PUT", body: JSON.stringify({ is_active: b.textContent.trim().startsWith("Nonaktifkan") ? false : true }) }); toast("Berhasil."); route(); }
    catch (ex) { toast(ex.message); }
  }, { once: true });
}

/* ---------- media ---------- */
async function pgMedia() {
  $("#pgTitle").textContent = "Media Library";
  $("#pgDesc").textContent = "Kelola gambar yang diunggah.";
  const meds = await api("/media");
  view.innerHTML = `
  <div class="panel">
    <h3>Unggah Gambar</h3>
    <div class="drop" id="drop">Seret &amp; letakkan gambar di sini, atau <a href="#" id="pickFile">pilih file</a><br><span class="muted">PNG/JPG/WebP/GIF · maks 5 MB</span></div>
    <input type="file" id="medFile" accept="image/*" style="display:none">
  </div>
  <div class="med-grid">${meds.map((m) => `<div><img src="${esc(m.url)}" alt="${esc(m.alt_text || m.file_name)}" title="${esc(m.file_name)}"><div class="muted" style="margin-top:6px">${esc(m.file_name.slice(0, 24))}<br>${(m.file_size / 1024).toFixed(0)} KB · ${fmtDate(m.created_at)}<br><button type="button" class="btn btn-sm btn-danger" style="margin-top:6px" data-delmed="${m.id}">Hapus</button></div></div>`).join("") || '<p class="muted">Belum ada media.</p>'}</div>`;
  view.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-delmed]");
    if (!b) return;
    if (!confirm("Hapus gambar ini dari media library?")) return;
    try { await api("/media/" + b.dataset.delmed, { method: "DELETE" }); toast("Media dihapus."); route(); }
    catch (ex) { toast(ex.message); }
  }, { once: true });
  const drop = $("#drop"), file = $("#medFile");
  const upload = async (f) => {
    if (!f) return;
    const fd = new FormData(); fd.append("file", f);
    const res = await fetch("/api/media", { method: "POST", headers: { Authorization: "Bearer " + token }, body: fd });
    const d = await res.json();
    if (!res.ok) return toast(d.error || "Upload gagal.");
    toast("Media terunggah."); route();
  };
  drop.addEventListener("click", () => file.click());
  $("#pickFile").addEventListener("click", (e) => { e.preventDefault(); file.click(); });
  file.addEventListener("change", () => upload(file.files[0]));
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); upload(e.dataTransfer.files[0]); });
}

/* ---------- activity ---------- */
async function pgActivity() {
  $("#pgTitle").textContent = "Activity Log";
  $("#pgDesc").textContent = "Riwayat aktivitas pengelolaan.";
  const logs = await api("/activity");
  view.innerHTML = `<div class="panel">
  <table><thead><tr><th>Waktu</th><th>Pengguna</th><th>Aksi</th><th>Entitas</th><th>Keterangan</th></tr></thead>
  <tbody>${logs.map((a) => `<tr><td class="muted">${fmtDT(a.created_at)}</td><td>${esc(a.user_name)}</td><td>${esc(a.action)}</td><td class="muted">${esc(a.entity_type)}#${a.entity_id ?? "—"}</td><td class="muted">${esc(a.metadata || "")}</td></tr>`).join("") || '<tr><td colspan="5" class="muted">Belum ada aktivitas.</td></tr>'}</tbody></table></div>`;
}

/* ---------- users ---------- */
async function pgUsers() {
  if (user.role !== "admin") { view.innerHTML = '<div class="panel"><h3>403 — Akses tidak cukup</h3><p class="muted">Hanya Admin dapat mengelola pengguna.</p></div>'; return; }
  $("#pgTitle").textContent = "Pengguna & Peran";
  $("#pgDesc").textContent = "Kelola akun Admin dan Kurator.";
  const users = await api("/users");
  view.innerHTML = `
  <div class="panel"><h3>Tambah Pengguna</h3>
    <form id="uForm" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;align-items:end">
      <div><label for="u-name">Nama</label><input class="input" id="u-name" required></div>
      <div><label for="u-email">Email</label><input class="input" id="u-email" type="email" required></div>
      <div><label for="u-pass">Kata sandi</label><input class="input" id="u-pass" type="password" required minlength="6"></div>
      <div><label for="u-role">Peran</label><select class="select" id="u-role"><option value="kurator">Kurator</option><option value="admin">Admin</option></select></div>
      <button class="btn btn-primary" type="submit">Tambah</button>
    </form>
    <p class="muted" style="margin-top:10px">Kurator dapat mengelola konten; Admin dapat pula mengelola pengguna dan konfigurasi.</p>
  </div>
  <div class="panel">
  <table><thead><tr><th>Nama</th><th>Email</th><th>Peran</th><th>Bergabung</th><th>Aksi</th></tr></thead>
  <tbody>${users.map((u) => `<tr>
    <td><b>${esc(u.name)}</b></td><td class="muted">${esc(u.email)}</td>
    <td><select class="select" style="max-width:130px" data-role="${u.id}" ${u.id === user.id ? "disabled" : ""}>
      <option value="kurator" ${u.role === "kurator" ? "selected" : ""}>Kurator</option>
      <option value="admin" ${u.role === "admin" ? "selected" : ""}>Admin</option>
    </select></td>
    <td class="muted">${fmtDate(u.created_at)}</td>
    <td>${u.id !== user.id ? `<button class="btn btn-sm" data-reset="${u.id}">Reset sandi</button>` : '<span class="muted">(kamu)</span>'}</td>
  </tr>`).join("")}</tbody></table></div>`;
  $("#uForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try { await api("/users", { method: "POST", body: JSON.stringify({ name: $("#u-name").value, email: $("#u-email").value, password: $("#u-pass").value, role: $("#u-role").value }) }); toast("Pengguna ditambahkan."); route(); }
    catch (ex) { toast(ex.message); }
  });
  view.addEventListener("change", async (e) => {
    const s = e.target.closest("select[data-role]");
    if (!s) return;
    try { await api("/users/" + s.dataset.role, { method: "PUT", body: JSON.stringify({ role: s.value }) }); toast("Peran diperbarui."); }
    catch (ex) { toast(ex.message); }
  }, { once: true });
  view.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-reset]");
    if (!b) return;
    const p = prompt("Kata sandi baru (min. 6 karakter):");
    if (!p) return;
    try { await api("/users/" + b.dataset.reset, { method: "PUT", body: JSON.stringify({ password: p }) }); toast("Kata sandi direset."); }
    catch (ex) { toast(ex.message); }
  }, { once: true });
}

/* ---------- router ---------- */
const adminRoutes = {
  dashboard: pgDashboard,
  konten: () => pgContents(location.hash.split("?")[1] || ""),
  kategori: pgCategories,
  media: pgMedia,
  aktivitas: pgActivity,
  pengguna: pgUsers,
};
function route() {
  const h = location.hash.replace(/^#\//, "") || "dashboard";
  const [name, arg] = h.split("/");
  const navMap = { dashboard: "Dashboard", konten: "Semua Konten", kategori: "Kategori", media: "Media Library", aktivitas: "Activity Log", pengguna: "Pengguna" };
  $$("#sbNav a").forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#/" + name || (name === "editor" && a.getAttribute("href")?.startsWith("#/konten"))));
  if (name === "editor") {
    if (arg && /^\d+$/.test(arg)) pgEditor(arg).catch((e) => toast(e.message));
    else pgEditor(arg || "karya").catch((e) => toast(e.message));
  } else if (adminRoutes[name]) {
    adminRoutes[name]().catch((e) => { toast(e.message); if (String(e.message).includes("login")) showLogin(); });
  } else pgDashboard();
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", () => { if (user) route(); });
document.addEventListener("click", (e) => {
  const a = e.target.closest('a[href^="#/"]');
  if (a && user) e.preventDefault(), route();
});

/* ---------- init ---------- */
(async () => {
  if (token) {
    try { const me = await api("/auth/me"); if (me.user) { user = me.user; boot(); return; } } catch {}
  }
  showLogin();
})();
