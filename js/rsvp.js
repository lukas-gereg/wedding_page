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

async function loadWishlist() {
  const sel = document.getElementById("wishlistItemSelect");
  if (!sel) return;

  sel.innerHTML = `<option value="">Loading…</option>`;

  try {
    const res = await fetch(`${SCRIPT_URL}?action=wishlist`);
    const data = await res.json();
    if (!data.ok) throw new Error();

    sel.innerHTML = `<option value="">Choose…</option>`;
    const lang = getLang();

    data.items.forEach(item => {
      const opt = document.createElement("option");
      opt.value = item.item_id;

      const remHuf = Number(item.remaining || 0);
      const remEur = hufToEur(remHuf);

      // In HU show Ft first + approx €
      if (lang === "hu") {
        opt.textContent = `${item.item_name} — remaining ${fmtHuf(remHuf)} (≈ ${fmtEur(remEur)})`;
      } else {
        // In SK keep it simple (or show both if you want)
        opt.textContent = `${item.item_name} — zostáva ${fmtHuf(remHuf)} (≈ ${fmtEur(remEur)})`;
      }

      // store remaining in dataset for live helper
      opt.dataset.remainingHuf = String(remHuf);
      sel.appendChild(opt);
    });

  } catch {
    sel.innerHTML = `<option value="">Failed to load</option>`;
  }
}

function syncWishlistCurrencyUI() {
  const lang = getLang();
  const amountInput = document.querySelector('input[name="wishlist_amount"]');
  const currencyHidden = document.querySelector('input[name="wishlist_currency"]');
  if (!amountInput || !currencyHidden) return;

  // If page is HU, guests type EUR. Otherwise type HUF.
  if (lang === "hu") {
    amountInput.placeholder = "Amount (EUR)";
    amountInput.step = "0.01";
    amountInput.inputMode = "decimal";
    currencyHidden.value = "EUR";
  } else {
    amountInput.placeholder = "Amount (HUF)";
    amountInput.step = "1";
    amountInput.inputMode = "numeric";
    currencyHidden.value = "HUF";
  }
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

    if (currency === "EUR") {
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

function enforceNumericInputs(form) {
  form.querySelectorAll('input[type="number"]').forEach(inp => {
    inp.addEventListener("input", () => {
      // replace comma with dot for decimals
      if (inp.step && inp.step.includes(".")) {
        inp.value = inp.value.replace(",", ".");
      }

      // remove invalid chars
      inp.value = inp.value.replace(/[^0-9.]/g, "");

      // allow only one dot
      const parts = inp.value.split(".");
      if (parts.length > 2) {
        inp.value = parts[0] + "." + parts.slice(1).join("");
      }
    });
  });
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
  await loadWishlist();
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
  enforceNumericInputs(form);

  form.addEventListener("change", () => refreshInlineExtras(form));

  document.querySelectorAll('input[name="gift"]').forEach(r =>
      r.addEventListener("change", () => refreshInlineExtras(form))
  );

  if (form) form.addEventListener("submit", async (e) => {
    await submitForm(e);
    refreshInlineExtras(form);
  });
});
