// ====== CONFIG ======
const ENDPOINT = "https://script.google.com/macros/s/AKfycbxisXOwzPp0r80TtYfl9dukolyd_1DFkAX5PLOC1xSX7Hm_0aDKwBsMkg6fn5dshe941w/exec";
const PAGE_SIZE = 48;

// ====== STATE ======
let currentGallery = "pro";
let nextPageToken = "";
let isLoading = false;
let currentStatusKey = null;

// ====== DOM ======
const grid = document.getElementById("galleryGrid");
const statusEl = document.getElementById("galleryStatus");
const loadMoreBtn = document.getElementById("loadMoreBtn");
const tabWrap = document.querySelector(".gallery-switch");

const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightboxImg");
const lightboxName = document.getElementById("lightboxName");
const lightboxDownload = document.getElementById("lightboxDownload");

// ====== I18N ======
function t(key, fallback = "") {
  const lang = localStorage.getItem("lang") || document.documentElement.lang || "sk";
  return window.I18N?.[lang]?.[key] || window.I18N?.sk?.[key] || fallback || key;
}

// ====== LIGHTBOX ======
function openLightbox({ previewSrc, name, downloadUrl }) {
  lightbox.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  lightboxName.textContent = name || "";
  lightboxImg.alt = name || "Photo";
  lightboxImg.src = previewSrc || "";

  lightboxDownload.href = downloadUrl || "#";
}

function closeLightbox() {
  lightbox.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  lightboxImg.removeAttribute("src");
  lightboxImg.alt = "";
  lightboxName.textContent = "";
  lightboxDownload.href = "#";
}

lightbox.addEventListener("click", (e) => {
  if (e.target.closest("[data-close='1']")) closeLightbox();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && lightbox.getAttribute("aria-hidden") === "false") {
    closeLightbox();
  }
});

lightboxDownload.addEventListener("click", (e) => {
  e.preventDefault();
  if (lightboxDownload.href !== "#") {
    window.open(lightboxDownload.href, "_blank", "noopener");
  }
});

// ====== HELPERS ======
function setStatus(key) {
  currentStatusKey = key;
  statusEl.textContent = key ? t(key) : "";
}

function setActiveTab(key) {
  document.querySelectorAll(".gallery-switch .tab").forEach(btn => {
    const active = btn.dataset.gallery === key;
    btn.classList.toggle("is-active", active);
  });
}

function showLoadMore(show) {
  loadMoreBtn.style.display = show ? "" : "none";
}

function setLoading(loading) {
  isLoading = loading;
  loadMoreBtn.disabled = loading;
  loadMoreBtn.textContent = loading ? t("gallery_btn_loading") : t("gallery_load_more");
}

function clearGrid() {
  grid.innerHTML = "";
}

function thumbUrl(id, w) {
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${w}`;
}

function appendItems(items) {
  const frag = document.createDocumentFragment();

  for (const it of (items || [])) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "gcard";
    btn.title = it.name || "Photo";

    btn.dataset.name = it.name || "";
    btn.dataset.preview = thumbUrl(it.id, 2400);
    btn.dataset.thumb = thumbUrl(it.id, 1000);
    btn.dataset.download = it.download || "";

    const img = document.createElement("img");
    img.loading = "lazy";
    img.alt = it.name || "Photo";
    img.src = btn.dataset.thumb;

    btn.appendChild(img);
    frag.appendChild(btn);
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

  setStatus("gallery_loading");
  setLoading(true);

  try {
    const data = await fetchPage();
    appendItems(data.items);

    nextPageToken = data.nextPageToken || "";
    showLoadMore(!!nextPageToken);

    setStatus(data.items?.length ? null : "gallery_empty");
  } catch (err) {
    console.error(err);
    setStatus("gallery_error_load");
  } finally {
    setLoading(false);
  }
}

async function loadMore() {
  if (isLoading || !nextPageToken) return;

  setLoading(true);

  try {
    const data = await fetchPage();
    appendItems(data.items);

    nextPageToken = data.nextPageToken || "";
    showLoadMore(!!nextPageToken);
  } catch {
    setStatus("gallery_error_more");
  } finally {
    setLoading(false);
  }
}

// ====== EVENTS ======

// Tabs: click delegation only in the tabs wrapper
tabWrap?.addEventListener("click", (e) => {
  const tab = e.target.closest(".tab");
  if (!tab) return;
  loadFirstPage(tab.dataset.gallery);
});

// Grid: click delegation only in the grid (VERY IMPORTANT)
grid?.addEventListener("click", (e) => {
  const card = e.target.closest(".gcard");

  if (card) {
    const name = card.dataset.name || "Photo";
    const previewSrc = card.dataset.preview || card.dataset.thumb || "";
    const downloadUrl = card.dataset.download || "";
    openLightbox({ previewSrc, name, downloadUrl });
  }
});

loadMoreBtn?.addEventListener("click", loadMore);

// Initial load
document.addEventListener("DOMContentLoaded", () => {
  loadFirstPage("pro");
});

// Infinite scroll
window.addEventListener("scroll", () => {
  if (!nextPageToken || isLoading) return;
  const nearBottom = window.innerHeight + window.scrollY > document.body.offsetHeight - 600;
  if (nearBottom) loadMore();
});

// 🔥 LANGUAGE CHANGE SUPPORT
document.addEventListener("langChanged", () => {
  setLoading(isLoading);
  if (currentStatusKey) statusEl.textContent = t(currentStatusKey);
});