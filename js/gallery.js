// ====== CONFIG ======
const ENDPOINT = "https://script.google.com/macros/s/AKfycbw_8ysR66_7OYhEGZ0U1GTwPx2M-SmheXdkHZXOoLEJVncDo67XX_oKFjygyrV5xJaIWQ/exec";
// Example:
// const ENDPOINT = "https://script.google.com/macros/s/XXXX/exec";

const PAGE_SIZE = 48;

// ====== STATE ======
let currentGallery = "pro";
let nextPageToken = "";
let isLoading = false;

// ====== DOM ======
const grid = document.getElementById("galleryGrid");
const statusEl = document.getElementById("galleryStatus");
const loadMoreBtn = document.getElementById("loadMoreBtn");

// ====== HELPERS ======
function setStatus(msg) {
  statusEl.textContent = msg || "";
}

function setActiveTab(key) {
  document.querySelectorAll(".gallery-switch .tab").forEach(btn => {
    const active = btn.dataset.gallery === key;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
}

function showLoadMore(show) {
  loadMoreBtn.style.display = show ? "" : "none";
}

function setLoading(loading) {
  isLoading = loading;
  loadMoreBtn.disabled = loading;
  if (loading) {
    loadMoreBtn.textContent = "Načítavam…";
  } else {
    // let i18n.js overwrite this later if you translate
    loadMoreBtn.textContent = loadMoreBtn.getAttribute("data-i18n") ? loadMoreBtn.textContent : "Načítať viac";
  }
}

function clearGrid() {
  grid.innerHTML = "";
}

function appendItems(items) {
  const frag = document.createDocumentFragment();

  for (const it of (items || [])) {
    const a = document.createElement("a");
    a.href = it.view || "#";
    a.target = "_blank";
    a.rel = "noopener";
    a.className = "gcard";
    a.title = it.name || "Photo";

    const img = document.createElement("img");
    img.loading = "lazy";
    img.alt = it.name || "Photo";
    img.src = it.thumb || "";

    const meta = document.createElement("div");
    meta.className = "gmeta";
    meta.textContent = it.name || "";

    a.appendChild(img);
    a.appendChild(meta);
    frag.appendChild(a);
  }

  grid.appendChild(frag);
}

async function fetchPage() {
  const url = new URL(ENDPOINT);
  url.searchParams.set("action", "gallery");
  url.searchParams.set("gallery", currentGallery);
  url.searchParams.set("pageSize", String(PAGE_SIZE));
  if (nextPageToken) url.searchParams.set("pageToken", nextPageToken);

  const res = await fetch(url.toString(), { method: "GET" });
  const data = await res.json();
  if (!data || data.ok !== true) {
    throw new Error((data && data.code) ? data.code : "FETCH_FAILED");
  }
  return data;
}

// ====== ACTIONS ======
async function loadFirstPage(key) {
  if (isLoading) return;

  currentGallery = key;
  nextPageToken = "";
  setActiveTab(key);
  clearGrid();
  showLoadMore(false);

  setStatus("Načítavam fotky…");
  setLoading(true);

  try {
    const data = await fetchPage();
    appendItems(data.items);

    nextPageToken = data.nextPageToken || "";
    showLoadMore(!!nextPageToken);

    setStatus((data.items && data.items.length) ? "" : "Zatiaľ tu nie sú žiadne fotky.");
  } catch (err) {
    console.error(err);
    setStatus("Nepodarilo sa načítať galériu. Skontrolujte prístup k priečinku v Google Drive.");
  } finally {
    setLoading(false);
  }
}

async function loadMore() {
  if (isLoading || !nextPageToken) return;

  setStatus("");
  setLoading(true);

  try {
    const data = await fetchPage();
    appendItems(data.items);

    nextPageToken = data.nextPageToken || "";
    showLoadMore(!!nextPageToken);

    if (!nextPageToken) {
      setStatus("To je všetko 🙂");
    }
  } catch (err) {
    console.error(err);
    setStatus("Nepodarilo sa načítať ďalšie fotky.");
  } finally {
    setLoading(false);
  }
}

// ====== EVENTS ======
document.addEventListener("click", (e) => {
  const tab = e.target.closest(".gallery-switch .tab");
  if (tab) {
    loadFirstPage(tab.dataset.gallery);
    return;
  }
});

loadMoreBtn.addEventListener("click", loadMore);

// Initial load
document.addEventListener("DOMContentLoaded", () => {
  loadFirstPage("pro");
});

window.addEventListener("scroll", () => {
  if (!nextPageToken || isLoading) return;
  const nearBottom = window.innerHeight + window.scrollY > document.body.offsetHeight - 600;
  if (nearBottom) loadMore();
});