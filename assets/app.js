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

function renderItem(item, editionDate) {
  const el = document.createElement("article");
  el.className = "item";
  const voted = localStorage.getItem(voteKey(item.id));
  el.innerHTML = `
    <div class="item-meta">
      <span class="lane lane-${item.lane}">${LANE_LABELS[item.lane] ?? item.lane}</span>
      <span class="source">${item.source}</span>
    </div>
    <h2 class="item-title"><a href="${item.url}" target="_blank" rel="noopener">${item.title}</a></h2>
    ${item.image ? `<img class="item-image" src="${item.image}" alt="" loading="lazy">` : ""}
    <p class="item-summary">${item.summary}</p>
    <div class="item-actions">
      <button class="vote" data-vote="more" ${voted ? "disabled" : ""}>${voted === "more" ? "Noted — more like this" : "More like this"}</button>
      <button class="vote" data-vote="less" ${voted ? "disabled" : ""}>${voted === "less" ? "Noted — less of this" : "Less of this"}</button>
    </div>`;
  el.querySelectorAll("button.vote").forEach((btn) =>
    btn.addEventListener("click", () => castVote(editionDate, item, btn.dataset.vote, el)),
  );
  return el;
}

async function castVote(editionDate, item, vote, itemEl) {
  // Optimistic: record locally and update UI immediately; network is best-effort.
  localStorage.setItem(voteKey(item.id), vote);
  itemEl.querySelectorAll("button.vote").forEach((b) => {
    b.disabled = true;
    if (b.dataset.vote === vote) b.textContent = vote === "more" ? "Noted — more like this" : "Noted — less of this";
  });
  if (!VOTE_ENDPOINT) return;
  try {
    await fetch(VOTE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ editionDate, itemId: item.id, vote, source: item.source, lane: item.lane }),
    });
  } catch (e) {
    console.warn("vote not delivered:", e);
  }
}

async function renderArchive(dates, currentDate) {
  const nav = document.querySelector("#archive");
  nav.innerHTML = dates
    .map((d) => `<a href="?date=${d}" class="${d === currentDate ? "current" : ""}">${fmtDate(d)}</a>`)
    .join("");
}

async function main() {
  const dates = await loadJSON("editions/index.json");
  const requested = new URLSearchParams(location.search).get("date");
  const date = dates.includes(requested) ? requested : dates[0];
  const edition = await loadJSON(`editions/${date}.json`);

  document.querySelector("#edition-date").textContent = fmtDate(date);
  const mainEl = document.querySelector("#edition");
  mainEl.innerHTML = "";
  edition.items.forEach((item) => mainEl.appendChild(renderItem(item, date)));
  renderArchive(dates, date);
}

main().catch((e) => {
  document.querySelector("#edition").innerHTML = `<p class="error">Couldn't load the edition. ${e.message}</p>`;
});
