/* ================================
   CONFIG
   ================================ */
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxFIw7-m_ihP7y5mmMHgM_7zCIrXwnCeyAuOoX74KQ6t5SoIur_zpPZsJpxAuQq7g0lKQ/exec";

/* ================================
   WISHLIST UI
   ================================ */
function toggleWishlist() {
  const gift = document.querySelector('input[name="gift"]:checked')?.value;
  const block = document.getElementById("wishlistFields");
  if (!block) return;
  block.style.display = (gift === "Contribute to our home wishlist") ? "block" : "none";
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
    toggleWishlist();
  } catch (err) {
    console.error(err);
    status.textContent = "❌ Error. Please try again.";
  }
}

/* ================================
   INIT
   ================================ */
document.addEventListener("DOMContentLoaded", () => {
  loadWishlist();
  toggleWishlist();

  document.querySelectorAll('input[name="gift"]').forEach(r =>
    r.addEventListener("change", toggleWishlist)
  );

  const form = document.getElementById("rsvpForm");
  if (form) form.addEventListener("submit", submitForm);
});
