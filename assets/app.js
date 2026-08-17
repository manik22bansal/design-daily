const VOTE_ENDPOINT = "https://manik22bansal--64ce13cc671511f1b67a1607ee4eb77e.web.val.run"; // Val.town designDailyVote; empty = signals stay local-only
const STATE_ENDPOINT = "https://manik22bansal--56595daa9a3311f18d211607ee4eb77e.web.val.run"; // Val.town designDailyState; per-reader stars/notes/read, gated by a personal key

const LANE_LABELS = { essay: "Essay", inspiration: "Inspiration", news: "News", voices: "Voices" };

/* Inline icons/glyphs — static strings only; never interpolate data into these. */
const ICON_STAR = `<svg class="icon" viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" focusable="false"><path d="M12 2.5l2.92 5.92 6.53.95-4.73 4.6 1.12 6.51L12 17.41l-5.84 3.07 1.12-6.51-4.73-4.6 6.53-.95L12 2.5z" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
const ICON_NOTE = `<svg class="icon" viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" focusable="false"><path d="M4 20.5h4L18.6 9.9a2 2 0 0 0-2.83-2.83L5 17.7v2.8z M13.5 9.5l3 3" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
const GLYPH_POOP = `<span class="glyph" aria-hidden="true">\u{1F4A9}</span>`;

async function loadJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

function fmtDate(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function fmtDateShort(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

const voteKey = (id) => `vote:${id}`;
const reasonKey = (id) => `reason:${id}`;

// Generated editions may carry imperfect data — escape everything we interpolate.
const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/* ================= Synced per-reader state (stars · notes · read) =================
   One store per reader, kept in Val.town, gated by a personal key the reader pastes
   once per device. localStorage mirrors it as an offline cache + fallback, so the
   site still works with no key (local-only) and renders instantly before the network
   answers. An entry: { starred, note, readAt, editionDate, item }.  (item = a cached
   copy so the Starred view needs no fetch, mirroring the old localStorage stars.) */
const KEY_LS = "dd_state_key";     // the secret word, per device
const CACHE_LS = "dd_state_cache"; // mirror of the store's items map
const LEGACY_STARS_LS = "stars";   // pre-sync localStorage star collection (migrated once)

let STATE = {};

function readCache() {
  try { const v = JSON.parse(localStorage.getItem(CACHE_LS)); return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  catch { return {}; }
}
function writeCache() { try { localStorage.setItem(CACHE_LS, JSON.stringify(STATE)); } catch { /* quota / private mode */ } }
function getKey() { return localStorage.getItem(KEY_LS) || ""; }
function setKey(k) { localStorage.setItem(KEY_LS, k); }
function clearKey() { localStorage.removeItem(KEY_LS); }
const synced = () => Boolean(STATE_ENDPOINT && getKey());

const entryFor = (id) => STATE[id] || {};
const isStarred = (id) => Boolean(entryFor(id).starred);
const isRead = (id) => Boolean(entryFor(id).readAt);
const noteFor = (id) => entryFor(id).note || "";

// Merge a patch into local state, mirroring the server's merge + prune-empties.
function applyLocal(id, patch) {
  const next = { ...(STATE[id] || {}), ...patch };
  if ("readAt" in patch && !patch.readAt) delete next.readAt;
  if ("note" in patch && !patch.note) delete next.note;
  if (!next.starred && !next.note && !next.readAt) delete STATE[id];
  else STATE[id] = next;
  writeCache();
}

// Optimistic: update local immediately, push to the store best-effort.
async function pushPatch(id, patch) {
  applyLocal(id, patch);
  if (!synced()) return;
  try {
    await fetch(STATE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Key": getKey() },
      body: JSON.stringify({ id, patch }),
    });
  } catch (e) { console.warn("state push not delivered:", e); }
}

let onBadKey = () => {};

// Pull the whole store into STATE. A 401 means the stored key is wrong.
async function pullState() {
  if (!synced()) return;
  try {
    const res = await fetch(STATE_ENDPOINT, { headers: { "X-Key": getKey() }, cache: "no-store" });
    if (res.status === 401) { clearKey(); onBadKey(); return; }
    if (!res.ok) return;
    const doc = await res.json();
    const items = doc && doc.items && typeof doc.items === "object" ? doc.items : {};
    STATE = items;
    writeCache();
  } catch (e) { console.warn("state pull failed:", e); }
}

// One-time lift of the old localStorage stars into the store (keeps the old key as backup).
async function migrateLegacyStars() {
  let legacy;
  try { legacy = JSON.parse(localStorage.getItem(LEGACY_STARS_LS)); } catch { return; }
  if (!legacy || typeof legacy !== "object") return;
  const bulk = {};
  for (const [id, e] of Object.entries(legacy)) {
    if (!e || !e.item || isStarred(id)) continue;
    const patch = { starred: true, item: e.item, editionDate: e.editionDate || "" };
    applyLocal(id, patch);
    bulk[id] = patch;
  }
  if (synced() && Object.keys(bulk).length) {
    try {
      await fetch(STATE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Key": getKey() },
        body: JSON.stringify({ items: bulk }),
      });
    } catch { /* best-effort; local already updated */ }
  }
}

function castButtonHTML() {
  const label = "Noted — less of this";
  return `<button class="vote cast icon-only" disabled aria-label="${label}" title="${label}">${GLYPH_POOP}</button>`;
}

function voteButtonsHTML(voted) {
  if (voted) return castButtonHTML();
  return `<button class="vote" data-vote="less">${GLYPH_POOP}<span class="vote-label">poop</span></button>`;
}

function noteBlockHTML(note) {
  return `<div class="item-note"><span class="item-note-label">Note</span><span class="item-note-body">${esc(note)}</span></div>`;
}

function renderItem(item, editionDate, index, opts = {}) {
  // Normalize: generated editions (and stored stars) may omit fields.
  const title = item.title || "Untitled";
  const source = item.source || "";
  const summary = item.summary || "";
  const why = item.why || ""; // old sample editions omit this — render nothing when absent
  const lane = item.lane || "";
  const id = item.id || `${editionDate}-${index}`;
  const url = /^https?:\/\//.test(item.url || "") ? item.url : "#";

  const voted = localStorage.getItem(voteKey(id)) === "less" ? "less" : null;
  const starred = isStarred(id);
  const read = isRead(id);
  const note = noteFor(id);

  const el = document.createElement("article");
  el.dataset.id = id;
  el.className = `item${voted === "less" ? " dismissed" : ""}${read ? " read" : ""}${opts.animate === false ? " no-anim" : ""}`;
  el.innerHTML = `
    <div class="item-meta">
      ${read ? "" : `<span class="unread-dot" title="Unread" aria-label="Unread"></span>`}
      ${lane ? `<span class="lane">${esc(LANE_LABELS[lane] ?? lane)}</span>` : ""}
      ${source ? `<span class="source">${esc(source)}</span>` : ""}
      ${item.paid === true ? `<span class="paid-tag" title="Behind a paywall — heads up before you click">Paid</span>` : ""}
      ${opts.showDate && fmtDateShort(editionDate) ? `<span class="edition-ref">${esc(fmtDateShort(editionDate))}</span>` : ""}
    </div>
    <h2 class="item-title"><a href="${esc(url)}" target="_blank" rel="noopener">${esc(title)}</a></h2>
    ${item.image ? `<img class="item-image" src="${esc(item.image)}" alt="" loading="lazy">` : ""}
    ${summary ? `<p class="item-summary">${esc(summary)}</p>` : ""}
    ${why ? `<p class="item-why">${esc(why)}</p>` : ""}
    ${note ? noteBlockHTML(note) : ""}
    <div class="item-actions">${voteButtonsHTML(voted)}
      <button class="act note-btn${note ? " has-note" : ""}" aria-label="Add or edit note">${ICON_NOTE}<span class="act-label">Note</span></button>
      <button class="act read-btn" aria-label="${read ? "Mark as unread" : "Mark as read"}">${read ? "Read" : "Mark read"}</button>
      <button class="star${starred ? " starred" : ""}" aria-pressed="${starred}" aria-label="${starred ? "Unstar this item" : "Star this item"}">${ICON_STAR}</button>
    </div>`;

  el.querySelectorAll("button.vote:not(:disabled)").forEach((btn) =>
    btn.addEventListener("click", () => castVote(editionDate, item, id, el)),
  );
  // Opening the actual article is the honest "I read it" signal — mark on link click.
  el.querySelector(".item-title a")?.addEventListener("click", () => markRead(id, el, true));
  el.querySelector(".read-btn").addEventListener("click", () => markRead(id, el, !isRead(id)));
  el.querySelector(".note-btn").addEventListener("click", () => openNoteEditor(el, item, id, editionDate));
  el.querySelector("button.star").addEventListener("click", () => toggleStar(editionDate, item, id, el, opts));
  return el;
}

/* ---------------------------- Read / unread ---------------------------- */

function markRead(id, el, read) {
  if (isRead(id) === read) return;
  pushPatch(id, { readAt: read ? new Date().toISOString() : null });
  setReadUI(el, read);
}

function setReadUI(el, read) {
  el.classList.toggle("read", read);
  const meta = el.querySelector(".item-meta");
  const dot = el.querySelector(".unread-dot");
  if (read) dot?.remove();
  else if (!dot && meta) meta.insertAdjacentHTML("afterbegin", `<span class="unread-dot" title="Unread" aria-label="Unread"></span>`);
  const btn = el.querySelector(".read-btn");
  if (btn) {
    btn.textContent = read ? "Read" : "Mark read";
    btn.setAttribute("aria-label", read ? "Mark as unread" : "Mark as read");
  }
}

/* -------------------------------- Notes -------------------------------- */
/* A note attaches to a saved (starred) item — saving a note also stars it, so
   there's one annotated collection, not two overlapping "saved" lists. */

function openNoteEditor(el, item, id, editionDate) {
  const open = el.querySelector(".note-editor");
  if (open) { open.querySelector("textarea").focus(); return; }
  const current = noteFor(id);
  const wrap = document.createElement("div");
  wrap.className = "note-editor";
  wrap.innerHTML = `
    <textarea class="note-input" maxlength="2000" placeholder="a note to your future self…" aria-label="Your note">${esc(current)}</textarea>
    <div class="note-editor-actions">
      <button class="note-save" type="button">Save</button>
      <button class="note-cancel" type="button">Cancel</button>
      ${current ? `<button class="note-delete" type="button">Delete</button>` : ""}
    </div>`;
  el.querySelector(".item-actions").insertAdjacentElement("afterend", wrap);
  const ta = wrap.querySelector(".note-input");
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);

  wrap.querySelector(".note-save").addEventListener("click", async () => {
    const text = ta.value.trim();
    if (text) await pushPatch(id, { note: text, starred: true, item: { ...item, id }, editionDate: editionDate || "" });
    else await pushPatch(id, { note: "" });
    wrap.remove();
    refreshNoteUI(el, id);
    refreshStarUI(el, id);
  });
  wrap.querySelector(".note-cancel").addEventListener("click", () => wrap.remove());
  wrap.querySelector(".note-delete")?.addEventListener("click", async () => {
    await pushPatch(id, { note: "" });
    wrap.remove();
    refreshNoteUI(el, id);
  });
}

function refreshNoteUI(el, id) {
  const note = noteFor(id);
  const block = el.querySelector(".item-note");
  if (note) {
    if (block) block.querySelector(".item-note-body").textContent = note;
    else {
      const anchor = el.querySelector(".item-why") || el.querySelector(".item-summary") || el.querySelector(".item-title");
      anchor.insertAdjacentHTML("afterend", noteBlockHTML(note));
    }
  } else block?.remove();
  el.querySelector(".note-btn")?.classList.toggle("has-note", Boolean(note));
}

function refreshStarUI(el, id) {
  const btn = el.querySelector("button.star");
  if (!btn) return;
  const starred = isStarred(id);
  btn.classList.toggle("starred", starred);
  btn.setAttribute("aria-pressed", String(starred));
  btn.setAttribute("aria-label", starred ? "Unstar this item" : "Star this item");
}

/* -------------------------------- Votes -------------------------------- */

function castVote(editionDate, item, id, itemEl) {
  // Optimistic: record locally and update UI immediately; network is best-effort.
  localStorage.setItem(voteKey(id), "less");
  itemEl.classList.add("dismissed");
  const actions = itemEl.querySelector(".item-actions");
  actions.querySelectorAll("button.vote").forEach((b) => b.remove());
  actions.insertAdjacentHTML("afterbegin", castButtonHTML());
  sendSignal({ editionDate, itemId: id, vote: "less", source: item.source, lane: item.lane, reason: "" });
  openReasonPrompt(actions, editionDate, item, id);
}

/* One-time, optional "why?" — appears only in the moment after a poop is cast. */
function openReasonPrompt(actions, editionDate, item, id) {
  const wrap = document.createElement("span");
  wrap.className = "reason";
  wrap.innerHTML = `
    <input class="reason-input" type="text" maxlength="280" autocomplete="off"
      placeholder="why? (helps tune the feed)" aria-label="Why? Optional, helps tune the feed">
    <button class="reason-send" aria-label="Send reason" title="Noted">&rarr;</button>`;
  actions.querySelector("button.vote.cast").insertAdjacentElement("afterend", wrap);

  const input = wrap.querySelector(".reason-input");
  const send = wrap.querySelector(".reason-send");
  let done = false;

  const collapse = () => { if (done) return; done = true; wrap.remove(); };

  const submit = () => {
    if (done) return;
    const text = input.value.trim();
    if (!text) return collapse();
    done = true;
    localStorage.setItem(reasonKey(id), text);
    sendSignal({ editionDate, itemId: id, vote: "less", source: item.source, lane: item.lane, reason: text });
    wrap.innerHTML = `<span class="reason-ack">noted</span>`;
    setTimeout(() => wrap.remove(), 1200);
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); submit(); }
    if (e.key === "Escape") collapse();
  });
  send.addEventListener("pointerdown", (e) => e.preventDefault());
  send.addEventListener("click", submit);
  wrap.addEventListener("focusout", (e) => {
    if (wrap.contains(e.relatedTarget)) return;
    setTimeout(() => { if (!wrap.contains(document.activeElement)) collapse(); }, 0);
  });
  input.focus();
}

/* ------------------------------- Starring ------------------------------- */

function toggleStar(editionDate, item, id, itemEl, opts = {}) {
  const willStar = !isStarred(id);
  const ed = editionDate || entryFor(id).editionDate || "";
  pushPatch(id, willStar ? { starred: true, item: { ...item, id }, editionDate: ed } : { starred: false });
  sendSignal({ editionDate: ed, itemId: id, vote: willStar ? "star" : "unstar", source: item.source, lane: item.lane });

  if (!willStar && opts.inStarredView) {
    const container = itemEl.parentElement;
    itemEl.remove();
    if (container && !container.querySelector(".item")) renderStarredEmpty(container);
    return;
  }
  const btn = itemEl.querySelector("button.star");
  btn.classList.toggle("starred", willStar);
  btn.setAttribute("aria-pressed", String(willStar));
  btn.setAttribute("aria-label", willStar ? "Unstar this item" : "Star this item");
  if (willStar) {
    btn.classList.add("pop");
    btn.addEventListener("animationend", () => btn.classList.remove("pop"), { once: true });
  }
}

// Single seam for curator-facing signals (votes, stars). No-op while VOTE_ENDPOINT is empty.
async function sendSignal(payload) {
  if (!VOTE_ENDPOINT) return;
  try {
    await fetch(VOTE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) { console.warn("signal not delivered:", e); }
}

/* --------------------------- Sync control (footer) --------------------------- */

function renderSyncControl(opts = {}) {
  const footer = document.querySelector("footer");
  if (!footer) return;
  let box = document.querySelector("#sync-control");
  if (!box) { box = document.createElement("div"); box.id = "sync-control"; footer.appendChild(box); }

  if (synced()) {
    box.innerHTML = `<span class="sync-status">Notes &amp; reads sync across your devices</span> <button class="sync-forget" type="button">forget key on this device</button>`;
    box.querySelector(".sync-forget").addEventListener("click", () => { clearKey(); renderSyncControl(); });
    return;
  }

  box.innerHTML = `
    <button class="sync-open" type="button">Sync notes &amp; reads across devices</button>
    <form class="sync-form" ${opts.error ? "" : "hidden"}>
      <input class="sync-input" type="password" autocomplete="off" placeholder="paste your key" aria-label="Your sync key">
      <button class="sync-go" type="submit">Unlock</button>
      ${opts.error ? `<span class="sync-msg">${esc(opts.error)}</span>` : ""}
    </form>`;
  const openBtn = box.querySelector(".sync-open");
  const form = box.querySelector(".sync-form");
  if (opts.error) openBtn.hidden = true;
  openBtn.addEventListener("click", () => { form.hidden = false; openBtn.hidden = true; form.querySelector(".sync-input").focus(); });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const k = form.querySelector(".sync-input").value.trim();
    if (!k) return;
    setKey(k);
    await pullState();               // clears the key + fires onBadKey on a 401
    if (!getKey()) { renderSyncControl({ error: "That key didn't match. Try again." }); return; }
    await migrateLegacyStars();
    renderSyncControl();
    refreshView(false);
  });
}

/* -------------------------------- Views -------------------------------- */

function renderArchive(dates, currentDate) {
  const nav = document.querySelector("#archive");
  nav.innerHTML = dates
    .map((d) => `<a href="?date=${esc(d)}" class="${d === currentDate ? "current" : ""}">${esc(fmtDate(d))}</a>`)
    .join("");
}

function renderStarredEmpty(mainEl) {
  mainEl.insertAdjacentHTML("beforeend", `<p class="item-summary empty-state">Nothing starred yet.</p>`);
}

let refreshView = () => {};

function renderStarredView(animate) {
  document.title = "Starred — Design Daily";
  document.querySelector("#edition-date").textContent = "Starred";
  document.querySelector(".starred-link")?.classList.add("current");

  const mainEl = document.querySelector("#edition");
  mainEl.innerHTML = `<nav class="view-return"><a href="./">&larr; Back to today&rsquo;s edition</a></nav>`;

  const entries = Object.entries(STATE)
    .filter(([, e]) => e && e.starred && e.item)
    .map(([id, e]) => ({ id, item: { ...e.item, id }, editionDate: e.editionDate || "" }))
    .sort((a, b) => String(b.editionDate).localeCompare(String(a.editionDate)));

  if (!entries.length) renderStarredEmpty(mainEl);
  else entries.forEach((e, i) =>
    mainEl.appendChild(renderItem(e.item, e.editionDate, i, { showDate: true, inStarredView: true, animate })),
  );
}

async function main() {
  STATE = readCache();
  renderSyncControl();
  onBadKey = () => renderSyncControl({ error: "Your saved key stopped working. Paste it again." });

  const starredView = new URLSearchParams(location.search).get("view") === "starred";

  if (starredView) {
    refreshView = (animate) => renderStarredView(animate);
    refreshView(true);
    // Keep the footer archive useful here too; best-effort only.
    loadJSON("editions/index.json").then((dates) => { dates.sort().reverse(); renderArchive(dates, null); }).catch(() => {});
  } else {
    const dates = await loadJSON("editions/index.json");
    dates.sort().reverse(); // ISO dates sort lexicographically; enforce newest-first
    const requested = new URLSearchParams(location.search).get("date");
    const date = dates.includes(requested) ? requested : dates[0];
    const edition = await loadJSON(`editions/${date}.json`);
    document.querySelector("#edition-date").textContent = fmtDate(date);
    renderArchive(dates, date);
    refreshView = (animate) => {
      const mainEl = document.querySelector("#edition");
      mainEl.innerHTML = "";
      if (!edition.items?.length) { mainEl.innerHTML = `<p class="item-summary">Nothing in today's edition.</p>`; return; }
      edition.items.forEach((item, i) => mainEl.appendChild(renderItem(item, date, i, { animate })));
    };
    refreshView(true);
  }

  // Reconcile with the store (and migrate old stars) in the background; only
  // re-render if something actually changed, so the common case has no flicker.
  const before = JSON.stringify(STATE);
  await pullState();
  await migrateLegacyStars();
  renderSyncControl();
  if (JSON.stringify(STATE) !== before) refreshView(false);
}

main().catch((e) => {
  document.querySelector("#edition").innerHTML = `<p class="error">Couldn't load the edition. ${e.message}</p>`;
});
