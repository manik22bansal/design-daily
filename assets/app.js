const VOTE_ENDPOINT = ""; // set in Task 3 (Val.town URL); empty = signals stay local-only

const LANE_LABELS = { essay: "Essay", inspiration: "Inspiration", news: "News", voices: "Voices" };

/* Inline line icons — static strings only; never interpolate data into these. */
const ICON_HEART = `<svg class="icon" viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" focusable="false"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
const ICON_POOP = `<svg class="icon" viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" focusable="false"><path d="M11.5 3.5C14 3.8 14.8 5.4 14.4 7.6C15.8 7.9 16.8 9.6 16.4 12.2C18.6 12.8 19.5 14.6 19.2 16.2C18.9 18 17.4 19 15.6 19H8.4C6.6 19 5.1 18 4.8 16.2C4.5 14.6 5.4 12.8 7.6 12.2C7.2 9.6 8.2 7.9 9.6 7.6C9.2 5.6 9.9 4.1 11.5 3.5Z" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
const ICON_STAR = `<svg class="icon" viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" focusable="false"><path d="M12 2.5l2.92 5.92 6.53.95-4.73 4.6 1.12 6.51L12 17.41l-5.84 3.07 1.12-6.51-4.73-4.6 6.53-.95L12 2.5z" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;

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
const STARS_KEY = "stars";

function loadStars() {
  try {
    const v = JSON.parse(localStorage.getItem(STARS_KEY));
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

function saveStars(stars) {
  localStorage.setItem(STARS_KEY, JSON.stringify(stars));
}

// Generated editions may carry imperfect data — escape everything we interpolate.
const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function castButtonHTML(vote) {
  const label = vote === "more" ? "Noted — more like this" : "Noted — less of this";
  return `<button class="vote cast icon-only" data-vote="${esc(vote)}" disabled aria-label="${esc(label)}" title="${esc(label)}">${vote === "more" ? ICON_HEART : ICON_POOP}</button>`;
}

function voteButtonsHTML(voted) {
  if (voted) return castButtonHTML(voted);
  return `
      <button class="vote" data-vote="more">${ICON_HEART}<span>More like this</span></button>
      <button class="vote" data-vote="less">${ICON_POOP}<span>Less of this</span></button>`;
}

function renderItem(item, editionDate, index, opts = {}) {
  // Normalize: generated editions (and stored stars) may omit fields.
  const title = item.title || "Untitled";
  const source = item.source || "";
  const summary = item.summary || "";
  const lane = item.lane || "";
  const id = item.id || `${editionDate}-${index}`;
  const url = /^https?:\/\//.test(item.url || "") ? item.url : "#";

  const el = document.createElement("article");
  const voted = localStorage.getItem(voteKey(id));
  const starred = Boolean(loadStars()[id]);
  el.className = `item${voted === "less" ? " dismissed" : ""}`;
  el.innerHTML = `
    <div class="item-meta">
      ${lane ? `<span class="lane">${esc(LANE_LABELS[lane] ?? lane)}</span>` : ""}
      ${source ? `<span class="source">${esc(source)}</span>` : ""}
      ${opts.showDate && fmtDateShort(editionDate) ? `<span class="edition-ref">${esc(fmtDateShort(editionDate))}</span>` : ""}
    </div>
    <h2 class="item-title"><a href="${esc(url)}" target="_blank" rel="noopener">${esc(title)}</a></h2>
    ${item.image ? `<img class="item-image" src="${esc(item.image)}" alt="" loading="lazy">` : ""}
    ${summary ? `<p class="item-summary">${esc(summary)}</p>` : ""}
    <div class="item-actions">${voteButtonsHTML(voted)}
      <button class="star${starred ? " starred" : ""}" aria-pressed="${starred}" aria-label="${starred ? "Unstar this item" : "Star this item"}">${ICON_STAR}</button>
    </div>`;
  el.querySelectorAll("button.vote:not(:disabled)").forEach((btn) =>
    btn.addEventListener("click", () => castVote(editionDate, item, id, btn.dataset.vote, el)),
  );
  el.querySelector("button.star").addEventListener("click", () => toggleStar(editionDate, item, id, el, opts));
  return el;
}

function castVote(editionDate, item, id, vote, itemEl) {
  // Optimistic: record locally and update UI immediately; network is best-effort.
  localStorage.setItem(voteKey(id), vote);
  itemEl.classList.toggle("dismissed", vote === "less");
  const actions = itemEl.querySelector(".item-actions");
  actions.querySelectorAll("button.vote").forEach((b) => b.remove());
  actions.insertAdjacentHTML("afterbegin", castButtonHTML(vote));
  sendSignal({ editionDate, itemId: id, vote, source: item.source, lane: item.lane });
}

function toggleStar(editionDate, item, id, itemEl, opts = {}) {
  const stars = loadStars();
  const starred = !stars[id];
  if (starred) {
    // Store the full item (with its resolved id) + edition so the starred view needs no fetches.
    stars[id] = { item: { ...item, id }, editionDate };
  } else {
    delete stars[id];
  }
  saveStars(stars);
  sendSignal({ editionDate, itemId: id, vote: starred ? "star" : "unstar", source: item.source, lane: item.lane });

  if (!starred && opts.inStarredView) {
    const container = itemEl.parentElement;
    itemEl.remove();
    if (container && !container.querySelector(".item")) renderStarredEmpty(container);
    return;
  }
  const btn = itemEl.querySelector("button.star");
  btn.classList.toggle("starred", starred);
  btn.setAttribute("aria-pressed", String(starred));
  btn.setAttribute("aria-label", starred ? "Unstar this item" : "Star this item");
  if (starred) {
    btn.classList.add("pop");
    btn.addEventListener("animationend", () => btn.classList.remove("pop"), { once: true });
  }
}

// Single seam for all future network signals (votes, stars). No-op while VOTE_ENDPOINT is empty.
async function sendSignal(payload) {
  if (!VOTE_ENDPOINT) return;
  try {
    await fetch(VOTE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.warn("signal not delivered:", e);
  }
}

function renderArchive(dates, currentDate) {
  const nav = document.querySelector("#archive");
  nav.innerHTML = dates
    .map((d) => `<a href="?date=${esc(d)}" class="${d === currentDate ? "current" : ""}">${esc(fmtDate(d))}</a>`)
    .join("");
}

function renderStarredEmpty(mainEl) {
  mainEl.insertAdjacentHTML("beforeend", `<p class="item-summary empty-state">Nothing starred yet.</p>`);
}

async function renderStarredView() {
  document.title = "Starred — Design Daily";
  document.querySelector("#edition-date").textContent = "Starred";
  document.querySelector(".starred-link")?.classList.add("current");

  const mainEl = document.querySelector("#edition");
  mainEl.innerHTML = `<nav class="view-return"><a href="./">&larr; Back to today&rsquo;s edition</a></nav>`;

  const entries = Object.values(loadStars())
    .filter((e) => e && typeof e === "object" && e.item)
    .sort((a, b) => String(b.editionDate || "").localeCompare(String(a.editionDate || "")));

  if (!entries.length) {
    renderStarredEmpty(mainEl);
  } else {
    entries.forEach((e, i) =>
      mainEl.appendChild(renderItem(e.item, e.editionDate || "", i, { showDate: true, inStarredView: true })),
    );
  }

  // Keep the footer archive useful here too; best-effort only.
  try {
    const dates = await loadJSON("editions/index.json");
    dates.sort().reverse();
    renderArchive(dates, null);
  } catch { /* starred view works without the archive */ }
}

async function main() {
  if (new URLSearchParams(location.search).get("view") === "starred") {
    return renderStarredView();
  }
  const dates = await loadJSON("editions/index.json");
  dates.sort().reverse(); // ISO dates sort lexicographically; enforce newest-first
  const requested = new URLSearchParams(location.search).get("date");
  const date = dates.includes(requested) ? requested : dates[0];
  const edition = await loadJSON(`editions/${date}.json`);

  document.querySelector("#edition-date").textContent = fmtDate(date);
  const mainEl = document.querySelector("#edition");
  mainEl.innerHTML = "";
  if (!edition.items?.length) {
    mainEl.innerHTML = `<p class="item-summary">Nothing in today's edition.</p>`;
  } else {
    edition.items.forEach((item, index) => mainEl.appendChild(renderItem(item, date, index)));
  }
  renderArchive(dates, date);
}

main().catch((e) => {
  document.querySelector("#edition").innerHTML = `<p class="error">Couldn't load the edition. ${e.message}</p>`;
});
