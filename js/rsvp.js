/* ================================
   CONFIG
   ================================ */
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzE_axYNmfP5xuQCjwopt3aMKmj6slniOl23CWiOMRvLWEYPVF-jFcpJhnMah00Itc5Uw/exec";

const BASE_CCY = "HUF";

// Fixed rate (simple + stable). You can update whenever.
const FX_EUR_HUF = 385; // 1 EUR = 385 HUF


function getLang() {
  return localStorage.getItem("lang") || "sk";
}

function hufToEur(huf) {
  return huf / FX_EUR_HUF;
}

function eurToHuf(eur) {
  return eur * FX_EUR_HUF;
}

function fmtHuf(x) {
  return Math.round(x).toLocaleString("hu-HU") + " Ft";
}

function fmtEur(x) {
  return x.toFixed(2).replace(".", ",") + " €";
}

let wishlistLoadedOnce = false;

async function loadWishlist({ silent = false } = {}) {
  const sel = document.getElementById("wishlistItemSelect");
  if (!sel) return;

  // Remember current selection so we can restore it
  const prevSelected = sel.value;

  // Only show Loading on FIRST load (or if empty)
  const shouldShowLoading = !wishlistLoadedOnce && !silent;
  if (shouldShowLoading) {
    sel.innerHTML = `<option value="">Loading…</option>`;
  }

  try {
    const res = await fetch(`${SCRIPT_URL}?action=wishlist`, { cache: "no-store" });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "wishlist fetch failed");

    const lang = getLang();

    // Build options in memory (no flicker), then swap once
    const frag = document.createDocumentFragment();

    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "Choose…"; // i18n if you want
    frag.appendChild(opt0);

    data.items.forEach(item => {
      const opt = document.createElement("option");
      opt.value = item.item_id;

      const remHuf = Number(item.remaining || 0);
      const remEur = hufToEur(remHuf);

      // HU: HUF primary, EUR approx
      if (lang === "hu") {
        opt.textContent = `${item.item_name} — ${fmtHuf(remHuf)} (≈ ${fmtEur(remEur)})`;
      }
      // SK: EUR primary, HUF approx  ✅ (Slovakia uses EUR)
      else {
        opt.textContent = `${item.item_name} — ${fmtEur(remEur)} (≈ ${fmtHuf(remHuf)})`;
      }

      opt.dataset.remainingHuf = String(remHuf);
      frag.appendChild(opt);
    });

    // Swap options in one operation (minimizes UI jump)
    sel.replaceChildren(frag);

    // Restore selection if still present
    if (prevSelected) {
      const exists = Array.from(sel.options).some(o => o.value === prevSelected);
      if (exists) sel.value = prevSelected;
    }

    wishlistLoadedOnce = true;
  } catch (err) {
    // Only show error on first load; don’t destroy UI on background refresh
    if (!wishlistLoadedOnce) {
      sel.innerHTML = `<option value="">Failed to load</option>`;
    }
    console.error(err);
  }
}

function syncWishlistCurrencyUI() {
  const lang = getLang();
  const amountInput = document.querySelector('input[name="wishlist_amount"]');
  const currencyHidden = document.querySelector('input[name="wishlist_currency"]');
  if (!amountInput || !currencyHidden) return;

  if (lang === "hu") {
    amountInput.placeholder = "Összeg (HUF)";
    amountInput.inputMode = "numeric";
    currencyHidden.value = "HUF";
  } else {
    amountInput.placeholder = "Suma (EUR)";
    amountInput.inputMode = "decimal";
    currencyHidden.value = "EUR";
  }

  // optional: re-sanitize when switching language
  amountInput.dispatchEvent(new Event("input", { bubbles: true }));
}

/* ================================
   FORM SUBMIT
   ================================ */
function formToJSON(form) {
  const fd = new FormData(form);
  const obj = {};

  obj.help = fd.getAll("help[]");
  for (const [k, v] of fd.entries()) {
    if (k !== "help[]") obj[k] = v;
  }

  obj.lang = getLang();

  // Normalize wishlist pledge into HUF
  if (obj.wishlist_type === "PLEDGE" && obj.wishlist_amount) {
  const currency = obj.wishlist_currency || "HUF";
  const raw = String(obj.wishlist_amount).replace(",", ".");
  const num = Number(raw);

  if (!Number.isFinite(num) || num <= 0) {
    delete obj.wishlist_amount_huf;
  } else if (currency === "EUR") {
    obj.wishlist_amount_huf = Math.round(eurToHuf(num));
  } else {
    obj.wishlist_amount_huf = Math.round(num);
  }
}

  return obj;
}

async function submitForm(e) {
  e.preventDefault();
  const form = e.target;
  const status = document.getElementById("formStatus");

  status.textContent = "Sending…";

  try {
    const payload = formToJSON(form);

    const res = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });

    const out = await res.json();
    if (!out.ok) throw new Error(out.error || "Failed");

    status.textContent = "✅ Sent. Thank you!";
    form.reset();

  } catch (err) {
    console.error(err);
    status.textContent = "❌ Error. Please try again.";
  }
}

function setExtraOpen(extraEl, open) {
  extraEl.dataset.open = open ? "true" : "false";

  extraEl.querySelectorAll("input, textarea, select").forEach(inp => {
    inp.disabled = !open;

    if (!open) {
      // Clear in a type-safe way
      if (inp.tagName === "SELECT") {
        inp.selectedIndex = 0;
        return;
      }

      if (inp.type === "radio" || inp.type === "checkbox") {
        inp.checked = false;      // ✅ clear selection
        // DO NOT touch inp.value
        return;
      }

      // text/number/textarea/etc.
      inp.value = "";
    }
  });
}

function attachMoneyInputGuard(form) {
  const amountInput = form.querySelector('input[name="wishlist_amount"]');
  if (!amountInput) return;

  const sanitize = () => {
    const currency = document.querySelector('input[name="wishlist_currency"]')?.value || "HUF";
    let v = amountInput.value || "";

    // keep digits + separators only
    v = v.replace(/[^\d.,]/g, "");

    // normalize: allow only ONE separator -> convert commas to dots
    v = v.replace(/,/g, ".");

    // remove extra dots
    const firstDot = v.indexOf(".");
    if (firstDot !== -1) {
      v =
        v.slice(0, firstDot + 1) +
        v.slice(firstDot + 1).replace(/\./g, "");
    }

    if (currency === "HUF") {
      // integers only
      v = v.replace(/\./g, "");
    } else {
      // EUR: allow up to 2 decimals
      const parts = v.split(".");
      if (parts.length === 2) {
        parts[1] = parts[1].slice(0, 2);
        v = parts[0] + "." + parts[1];
      }
    }

    amountInput.value = v;
  };

  // blocks bad keys early (desktop)
  amountInput.addEventListener("keydown", (e) => {
    const allowed = [
      "Backspace", "Delete", "Tab", "Escape", "Enter",
      "ArrowLeft", "ArrowRight", "Home", "End"
    ];
    if (allowed.includes(e.key)) return;

    // allow Ctrl/Cmd shortcuts
    if ((e.ctrlKey || e.metaKey) && ["a","c","v","x"].includes(e.key.toLowerCase())) return;

    // allow digits
    if (/^\d$/.test(e.key)) return;

    // allow separators (we’ll sanitize later)
    if (e.key === "." || e.key === ",") return;

    // block everything else (letters, minus, e, etc.)
    e.preventDefault();
  });

  // sanitize on any input/paste
  amountInput.addEventListener("input", sanitize);
  amountInput.addEventListener("blur", sanitize);
}

function matchesCondition(form, cond) {
  // Examples:
  // "bring=Other"
  // "diet=Other"
  // "wishlist_type=PLEDGE"
  // "help[]=Other"

  const [nameRaw, expected] = cond.split("=");
  const expectedValue = (expected || "").trim();

  // Checkbox array (help[])
  if (nameRaw.endsWith("[]")) {
    const checkedValues = Array.from(
      form.querySelectorAll(`input[name="${nameRaw}"]:checked`)
    ).map(el => el.value);

    return checkedValues.includes(expectedValue);
  }

  // Radio group
  const checkedRadio = form.querySelector(
    `input[name="${nameRaw}"]:checked`
  );

  if (!checkedRadio) return false;

  return checkedRadio.value === expectedValue;
}


function refreshInlineExtras(form) {
  form.querySelectorAll(".inline-extra[data-show-when]").forEach(extra => {
    const cond = extra.getAttribute("data-show-when");
    const open = matchesCondition(form, cond);
    setExtraOpen(extra, open);
  });
}

function updateFxHint() {
  const hint = document.getElementById("pledgeFxHint");
  const amountInput = document.querySelector('input[name="wishlist_amount"]');
  const typeChecked = document.querySelector('input[name="wishlist_type"]:checked')?.value;
  const currency = document.querySelector('input[name="wishlist_currency"]')?.value || "HUF";
  if (!hint || !amountInput) return;

  // only show when pledge is selected and wishlist visible
  if (typeChecked !== "PLEDGE" || amountInput.disabled) {
    hint.style.display = "none";
    hint.textContent = "";
    return;
  }

  const raw = (amountInput.value || "").replace(",", ".");
  const num = Number(raw);
  if (!num || num <= 0) {
    hint.style.display = "none";
    hint.textContent = "";
    return;
  }

  hint.style.display = "block";
  if (currency === "EUR") {
    hint.textContent = `≈ ${fmtHuf(eurToHuf(num))} (rate: 1€ = ${FX_EUR_HUF} Ft)`;
  } else {
    hint.textContent = `≈ ${fmtEur(hufToEur(num))} (rate: 1€ = ${FX_EUR_HUF} Ft)`;
  }
}

/* ================================
   INIT
   ================================ */
document.addEventListener("DOMContentLoaded", () => {
  loadWishlist().then(() => {
    syncWishlistCurrencyUI();
    updateFxHint();
  });

  setInterval(async () => {
  await loadWishlist({ silent: true });
  updateFxHint();
}, 15000);

  const form = document.getElementById("rsvpForm");
  if (!form) return;

  const langSelect = document.getElementById("langSelect");
  if (langSelect) {
    langSelect.addEventListener("change", () => {
      // i18n.js will update localStorage, so wait a tick
      setTimeout(() => {
        syncWishlistCurrencyUI();
        loadWishlist(); // re-render labels with correct language
        updateFxHint();
      }, 0);
    });
  }

  form.addEventListener("input", updateFxHint);

  // initialize & listen
  refreshInlineExtras(form);
  attachMoneyInputGuard(form);

  form.addEventListener("change", () => refreshInlineExtras(form));

  document.querySelectorAll('input[name="gift"]').forEach(r =>
      r.addEventListener("change", () => refreshInlineExtras(form))
  );

  if (form) form.addEventListener("submit", async (e) => {
    await submitForm(e);
    refreshInlineExtras(form);
  });
});
