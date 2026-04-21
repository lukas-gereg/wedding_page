/* ================================
   CONFIG
   ================================ */
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz_R1JwYyHo3Os45XR0BNXY7OqPdovOBGLwE7CZ7jk09ftYcm1tqBWnByK0GkJ1mVxLzw/exec";

/* ================================
   FORM SUBMIT
   ================================ */
function formToJSON(form) {
  const fd = new FormData(form);
  const obj = {};

  obj.help = fd.getAll("help[]");
  obj.bring = fd.getAll("bring[]");

  for (const [k, v] of fd.entries()) {
    if (k !== "help[]" && k !== "bring[]") obj[k] = v;
  }

  obj.lang = getLang();
  return obj;
}

async function submitForm(e) {
  e.preventDefault();
  const form = e.target;

  const btn = form.querySelector('button[type="submit"]');
  if (btn) btn.disabled = true;

  setLoading(true);

  try {
    const payload = formToJSON(form);

    const res = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });

    const out = await res.json();

    if (!out.ok) {
      const mapped = serverErrorToToast(out);
      const msg = t(mapped.key, mapped.params || {});
      throw new Error(mapped.fallback ? `${msg} ${mapped.fallback}` : msg);
    }

    showToast({
      type: "success",
      title: `✅ ${t("toast_success_title")}`,
      message: t("toast_success_msg"),
      autoHideMs: 10000,
      dismissible: true
    });

    form.reset();
  } catch (err) {
    showToast({
      type: "error",
      title: `❌ ${t("toast_error_title")}`,
      message: String(err?.message || t("toast_unknown_error")),
      autoHideMs: 10000,
      dismissible: true
    });
  } finally {
    setLoading(false);
    if (btn) btn.disabled = false;
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
  // "bring[]=Other"
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

function t(key, params = {}) {
  const lang = getLang();
  const dict = (window.I18N && (I18N[lang] || I18N.sk)) || {};
  let s = dict[key] || (I18N?.sk?.[key]) || key;

  // simple {placeholder} replace
  Object.entries(params).forEach(([k, v]) => {
    s = s.replaceAll(`{${k}}`, String(v));
  });
  return s;
}

function serverErrorToToast(out) {
  return { key: "toast_unknown_error", fallback: out.error || out.message || "" };

}

function setLoading(open) {
  const ov = document.getElementById("loadingOverlay");
  if (!ov) return;
  ov.dataset.open = open ? "true" : "false";
  ov.setAttribute("aria-hidden", open ? "false" : "true");
}

function showToast({ type = "info", title = "", message = "", autoHideMs = 10000, dismissible = true } = {}) {
  const stack = document.getElementById("toastStack");
  if (!stack) return;

  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;

  const h = document.createElement("p");
  h.className = "toast__title";

  const fallbackTitle =
    type === "success" ? t("toast_success_fallback") :
    type === "error"   ? t("toast_error_fallback") :
                         t("toast_info_fallback");

  h.textContent = title || fallbackTitle;

  const p = document.createElement("p");
  p.className = "toast__msg";
  p.textContent = message || "";

  toast.appendChild(h);
  toast.appendChild(p);

  if (dismissible) {
    const btn = document.createElement("button");
    btn.className = "toast__close";
    btn.type = "button";
    btn.setAttribute("aria-label", t("toast_close"));
    btn.innerHTML = "×";
    btn.addEventListener("click", () => toast.remove());
    toast.appendChild(btn);
  }

  // progress bar (optional)
  if (autoHideMs && autoHideMs > 0) {
    const bar = document.createElement("div");
    bar.className = "toast__bar";
    const span = document.createElement("span");
    // match animation duration to autoHideMs
    span.style.animationDuration = `${autoHideMs}ms`;
    bar.appendChild(span);
    toast.appendChild(bar);

    setTimeout(() => {
      // avoid removing if already closed
      if (toast.isConnected) toast.remove();
    }, autoHideMs);
  }

  stack.appendChild(toast);
  return toast;
}

function applyPlaceholders() {
  const phone = document.querySelector('input[name="phone"]');
  if (phone) phone.placeholder = t("phone_placeholder");

  // if you want others too, add them here the same way
  // const name = document.querySelector('input[name="official_name"]');
  // if (name) name.placeholder = t("name_placeholder");
}

function attachPhoneGuard(form) {
  const phone = form.querySelector('input[name="phone"]');
  if (!phone) return;

  const sanitize = () => {
    // allow + at start, digits, spaces, dashes, parentheses
    let v = phone.value || "";
    v = v.replace(/[^\d+\s\-()]/g, "");
    // only one + and only at beginning
    v = v.replace(/\+/g, (m, offset) => (offset === 0 ? "+" : ""));
    phone.value = v;
  };

  phone.addEventListener("input", sanitize);
  phone.addEventListener("blur", sanitize);
}

function attachEmailConfirm(form) {
  const email = form.querySelector('input[name="email"]');
  const email2 = form.querySelector('input[name="email_confirm"]');
  if (!email || !email2) return;

  const validate = () => {
    const a = (email.value || "").trim();
    const b = (email2.value || "").trim();

    // reset visuals if empty
    if (!a && !b) {
      email.classList.remove("field-ok","field-bad");
      email2.classList.remove("field-ok","field-bad");
      email2.setCustomValidity("");
      return;
    }

    const ok = a && b && a.toLowerCase() === b.toLowerCase();

    email.classList.toggle("field-ok", ok);
    email2.classList.toggle("field-ok", ok);
    email.classList.toggle("field-bad", !ok && b.length > 0);
    email2.classList.toggle("field-bad", !ok && b.length > 0);

    email2.setCustomValidity(ok ? "" : "EMAIL_MISMATCH");
  };

  email.addEventListener("input", validate);
  email2.addEventListener("input", validate);
  email2.addEventListener("blur", validate);

  // translate browser validation message via toast on submit
  form.addEventListener("submit", (e) => {
    validate();
    if (!form.checkValidity()) {
      e.preventDefault();
      const msgKey = (email2.validationMessage === "EMAIL_MISMATCH")
        ? "toast_email_mismatch"
        : "toast_invalid_form";
      showToast({
        type: "error",
        title: `❌ ${t("toast_error_title")}`,
        message: t(msgKey),
        autoHideMs: 10000,
        dismissible: true
      });
    }
  }, true);
}

function attachIntOnlyGuard(form, selector) {
  const el = form.querySelector(selector);
  if (!el) return;

  const sanitize = () => {
    let v = (el.value ?? "").toString();
    v = v.replace(/[^\d]/g, "");      // digits only
    // avoid leading zeros like "0003" (optional)
    v = v.replace(/^0+(?=\d)/, "");
    el.value = v;
  };

  el.addEventListener("keydown", (e) => {
    const allowed = [
      "Backspace", "Delete", "Tab", "Escape", "Enter",
      "ArrowLeft", "ArrowRight", "Home", "End"
    ];
    if (allowed.includes(e.key)) return;
    if ((e.ctrlKey || e.metaKey) && ["a", "c", "v", "x"].includes(e.key.toLowerCase())) return;
    if (/^\d$/.test(e.key)) return;
    e.preventDefault();
  });

  el.addEventListener("input", sanitize);
  el.addEventListener("blur", sanitize);
}

/* ================================
   INIT
   ================================ */

function applyRsvpDeadline() {
  // Visible until end of 2026-06-01 (local time), hidden starting 2026-06-02 00:00
  const deadlineEnd = new Date(2026, 6, 7, 23, 59, 59); // months are 0-based (5 = June)

  const openWrap = document.getElementById("rsvpOpen");
  const closedWrap = document.getElementById("rsvpClosed");
  const form = document.getElementById("rsvpForm");

  if (!openWrap || !closedWrap) return;

  const now = new Date();
  const isOpen = now <= deadlineEnd;

  openWrap.style.display = isOpen ? "" : "none";
  closedWrap.style.display = isOpen ? "none" : "";

  // extra safety: if closed, disable all inputs so nothing can submit
  if (!isOpen && form) {
    form.querySelectorAll("input, select, textarea, button").forEach(el => {
      el.disabled = true;
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  getLang();

  applyRsvpDeadline()

  applyPlaceholders();

  const form = document.getElementById("rsvpForm");
  if (!form) return;

  const langSelect = document.getElementById("langSelect");
  if (langSelect) {
    langSelect.addEventListener("change", () => {
      setTimeout(applyPlaceholders, 0);
    });
  }

  // initialize & listen
  refreshInlineExtras(form);
  attachPhoneGuard(form);
  attachIntOnlyGuard(form, 'input[name="car_free_seats"]');
  attachEmailConfirm(form);

  form.addEventListener("change", () => refreshInlineExtras(form));

  document.querySelectorAll('input[name="gift"]').forEach(r =>
      r.addEventListener("change", () => refreshInlineExtras(form))
  );

  if (form) form.addEventListener("submit", async (e) => {
    await submitForm(e);
    refreshInlineExtras(form);
  });
});
