/* ================================
   CONFIG
   ================================ */
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxFIw7-m_ihP7y5mmMHgM_7zCIrXwnCeyAuOoX74KQ6t5SoIur_zpPZsJpxAuQq7g0lKQ/exec";


async function loadWishlist() {
  const sel = document.getElementById("wishlistItemSelect");
  if (!sel) return;

  sel.innerHTML = `<option value="">Loading…</option>`;

  try {
    const res = await fetch(`${SCRIPT_URL}?action=wishlist`);
    const data = await res.json();
    if (!data.ok) throw new Error();

    sel.innerHTML = `<option value="">Choose…</option>`;
    data.items.forEach(item => {
      const opt = document.createElement("option");
      opt.value = item.item_id;
      opt.textContent = `${item.item_name} — remaining ${item.remaining}`;
      sel.appendChild(opt);
    });
  } catch {
    sel.innerHTML = `<option value="">Failed to load</option>`;
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

  obj.lang = localStorage.getItem("lang") || "sk";
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

/* ================================
   INIT
   ================================ */
document.addEventListener("DOMContentLoaded", () => {
  loadWishlist();

  const form = document.getElementById("rsvpForm");
  if (!form) return;

  // initialize & listen
  refreshInlineExtras(form);
  form.addEventListener("change", () => refreshInlineExtras(form));

  document.querySelectorAll('input[name="gift"]').forEach(r =>
      r.addEventListener("change", () => refreshInlineExtras(form))
  );

  if (form) form.addEventListener("submit", async (e) => {
    await submitForm(e);
    refreshInlineExtras(form);
  });
});
