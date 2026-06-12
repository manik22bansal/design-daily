const VOTE_ENDPOINT = ""; // set in Task 3 (Val.town URL); empty = votes stay local-only

const LANE_LABELS = { essay: "Essay", inspiration: "Inspiration", news: "News", voices: "Voices" };

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

const voteKey = (id) => `vote:${id}`;

// Generated editions may carry imperfect data — escape everything we interpolate.
const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function renderItem(item, editionDate, index) {
  // Normalize: generated editions may omit fields.
  const title = item.title || "Untitled";
  const source = item.source || "";
  const summary = item.summary || "";
  const lane = item.lane || "";
  const id = item.id || `${editionDate}-${index}`;
  const url = /^https?:\/\//.test(item.url || "") ? item.url : "#";

  const el = document.createElement("article");
  el.className = "item";
  const voted = localStorage.getItem(voteKey(id));
  el.innerHTML = `
    <div class="item-meta">
      ${lane ? `<span class="lane">${esc(LANE_LABELS[lane] ?? lane)}</span>` : ""}
      ${source ? `<span class="source">${esc(source)}</span>` : ""}
    </div>
    <h2 class="item-title"><a href="${esc(url)}" target="_blank" rel="noopener">${esc(title)}</a></h2>
    ${item.image ? `<img class="item-image" src="${esc(item.image)}" alt="" loading="lazy">` : ""}
    ${summary ? `<p class="item-summary">${esc(summary)}</p>` : ""}
    <div class="item-actions">
      <button class="vote${voted === "more" ? " cast" : ""}" data-vote="more" ${voted ? "disabled" : ""}>${voted === "more" ? "Noted — more like this" : "More like this"}</button>
      <button class="vote${voted === "less" ? " cast" : ""}" data-vote="less" ${voted ? "disabled" : ""}>${voted === "less" ? "Noted — less of this" : "Less of this"}</button>
    </div>`;
  el.querySelectorAll("button.vote").forEach((btn) =>
    btn.addEventListener("click", () => castVote(editionDate, item, id, btn.dataset.vote, el)),
  );
  return el;
}

async function castVote(editionDate, item, id, vote, itemEl) {
  // Optimistic: record locally and update UI immediately; network is best-effort.
  localStorage.setItem(voteKey(id), vote);
  itemEl.querySelectorAll("button.vote").forEach((b) => {
    b.disabled = true;
    b.classList.toggle("cast", b.dataset.vote === vote);
    if (b.dataset.vote === vote) b.textContent = vote === "more" ? "Noted — more like this" : "Noted — less of this";
  });
  if (!VOTE_ENDPOINT) return;
  try {
    await fetch(VOTE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ editionDate, itemId: id, vote, source: item.source, lane: item.lane }),
    });
  } catch (e) {
    console.warn("vote not delivered:", e);
  }
}

function renderArchive(dates, currentDate) {
  const nav = document.querySelector("#archive");
  nav.innerHTML = dates
    .map((d) => `<a href="?date=${esc(d)}" class="${d === currentDate ? "current" : ""}">${esc(fmtDate(d))}</a>`)
    .join("");
}

async function main() {
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
