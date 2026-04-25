/* ================================
   CONFIG
   ================================ */
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxisXOwzPp0r80TtYfl9dukolyd_1DFkAX5PLOC1xSX7Hm_0aDKwBsMkg6fn5dshe941w/exec";

/* ================================
   I18N HELPERS
   ================================ */
function t(key, params = {}) {
  const lang = window.getLang();
  const dict = (window.I18N && (I18N[lang] || I18N.sk)) || {};
  let s = dict[key] || (I18N?.sk?.[key]) || key;

  Object.entries(params).forEach(([k, v]) => {
    s = s.replaceAll(`{${k}}`, String(v));
  });
  return s;
}

/* ================================
   FORM HELPERS
   ================================ */

function getLabelText(form, name, value) {
  const el = form.querySelector(`[name="${CSS.escape(name)}"]`);

  if (el?.tagName === "SELECT") {
    return el.selectedOptions[0]?.textContent.trim() || value;
  }

  const input = form.querySelector(
    `[name="${CSS.escape(name)}"]:checked[value="${CSS.escape(value)}"]`
  );

  const label = input?.closest("label");
  return label?.innerText.trim() || value;
}

function formToJSON(form) {
  const fd = new FormData(form);
  const obj = {};
  const translated = {};

  for (const [k, v] of fd.entries()) {
    const key = k.replace(/\[]$/, "");

    if (k.endsWith("[]")) {
      if (!obj[key]) obj[key] = [];
      obj[key].push(v);
    } else {
      obj[key] = v;
    }

    const text = getLabelText(form, k, v);

    if (k.endsWith("[]")) {
      if (!translated[key]) translated[key] = [];
      translated[key].push(text);
    } else {
      translated[key] = text;
    }
  }

  obj.translated = translated;
  obj.lang = window.getLang();

  return obj;
}

/* ================================
   UI HELPERS
   ================================ */

function setLoading(open) {
  const ov = document.getElementById("loadingOverlay");
  if (!ov) return;
  ov.dataset.open = open ? "true" : "false";
  ov.setAttribute("aria-hidden", open ? "false" : "true");
}

function showToast({
  type = "info",
  titleKey = null,
  messageKey = null,
  autoHideMs = 10000,
  dismissible = true
} = {}) {
  const stack = document.getElementById("toastStack");
  if (!stack) return;

  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;

  // store keys for live language switching
  if (titleKey) toast.dataset.titleKey = titleKey;
  if (messageKey) toast.dataset.messageKey = messageKey;

  // ---- TITLE ----
  const title = document.createElement("p");
  title.className = "toast__title";

  const fallbackTitle =
    type === "success" ? t("toast_success_fallback") :
    type === "error"   ? t("toast_error_fallback") :
                         t("toast_info_fallback");

  title.textContent = titleKey ? t(titleKey) : fallbackTitle;

  // ---- MESSAGE ----
  const msg = document.createElement("p");
  msg.className = "toast__msg";
  msg.textContent = messageKey ? t(messageKey) : "";

  toast.appendChild(title);
  toast.appendChild(msg);

  // ---- DISMISS BUTTON ----
  if (dismissible) {
    const btn = document.createElement("button");
    btn.className = "toast__close";
    btn.type = "button";
    btn.setAttribute("aria-label", t("toast_close"));
    btn.innerHTML = "×";

    btn.addEventListener("click", () => toast.remove());

    toast.appendChild(btn);
  }

  // ---- PROGRESS BAR ----
  if (autoHideMs && autoHideMs > 0) {
    const bar = document.createElement("div");
    bar.className = "toast__bar";

    const span = document.createElement("span");
    span.style.animationDuration = `${autoHideMs}ms`;

    bar.appendChild(span);
    toast.appendChild(bar);

    setTimeout(() => {
      if (toast.isConnected) toast.remove();
    }, autoHideMs);
  }

  stack.appendChild(toast);
  return toast;
}

function applyPlaceholders() {
  const phone = document.querySelector('input[name="phone"]');
  if (phone) phone.placeholder = t("phone_placeholder");
}

/* ================================
   FORM SUBMIT
   ================================ */

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

    if (!out.ok) throw new Error("SERVER_ERROR");

    showToast({
      type: "success",
      titleKey: "toast_success_title",
      messageKey: "toast_success_msg"
    });

    form.reset();

  } catch (err) {
    showToast({
      type: "error",
      titleKey: "toast_error_title",
      messageKey: "toast_unknown_error"
    });
  } finally {
    setLoading(false);
    if (btn) btn.disabled = false;
  }
}

/* ================================
   VALIDATION HELPERS
   ================================ */

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

  form.addEventListener("submit", (e) => {
    validate();
    if (!form.checkValidity()) {
      e.preventDefault();
      const msgKey = (email2.validationMessage === "EMAIL_MISMATCH")
        ? "toast_email_mismatch"
        : "toast_invalid_form";
      showToast({
        type: "error",
        titleKey: "toast_error_title",
        messageKey: msgKey,
      });
    }
  }, true);
}

function attachIntOnlyGuard(form, selector) {
  const el = form.querySelector(selector);
  if (!el) return;

  const sanitize = () => {
    let v = (el.value ?? "").toString();
    v = v.replace(/\D/g, "");      // digits only
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

function setExtraOpen(extraEl, open) {
  extraEl.dataset.open = open ? "true" : "false";

  extraEl.querySelectorAll("input, textarea, select").forEach(inp => {
    inp.disabled = !open;

    if (!open) {
      if (inp.tagName === "SELECT") {
        inp.selectedIndex = 0;
        return;
      }

      if (inp.type === "radio" || inp.type === "checkbox") {
        inp.checked = false;
        return;
      }

      inp.value = "";
    }
  });
}

function matchesCondition(form, cond, negation = false) {
  const [nameRaw, expected] = cond.split("=");
  const expectedValue = (expected || "").trim();

  let result;

  if (nameRaw.endsWith("[]")) {
    const checkedValues = Array.from(
      form.querySelectorAll(`input[name="${nameRaw}"]:checked`)
    ).map(el => el.value);

    result = checkedValues.includes(expectedValue);
  } else {
    const checkedRadio = form.querySelector(
      `input[name="${nameRaw}"]:checked`
    );

    result = checkedRadio ? checkedRadio.value === expectedValue : false;
  }

  return negation ? !result : result;
}

function refreshInlineExtras(form) {
  form.querySelectorAll(".inline-extra[data-show-when]").forEach(extra => {
    const cond = extra.getAttribute("data-show-when");
    const open = matchesCondition(form, cond);
    setExtraOpen(extra, open);
  });
  form.querySelectorAll(".inline-extra[data-show-when-not]").forEach(extra => {
    const cond = extra.getAttribute("data-show-when-not");
    const open = matchesCondition(form, cond, true);
    setExtraOpen(extra, open);
  });
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
  window.getLang();

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
  attachPhoneGuard(form);
  refreshInlineExtras(form);
  attachIntOnlyGuard(form, 'input[name="car_free_seats"]');
  attachEmailConfirm(form);

  form.addEventListener("change", () => refreshInlineExtras(form));

  form.addEventListener("submit", async (e) =>
  {
    await submitForm(e);
    refreshInlineExtras(form);
  });
});

/* ================================
   LANGUAGE CHANGE HANDLER
   ================================ */

document.addEventListener("langChanged", () => {
  document.querySelectorAll(".toast").forEach(toast => {
    const title = toast.querySelector(".toast__title");
    const msg = toast.querySelector(".toast__msg");

    if (toast.dataset.titleKey && title) {
      title.textContent = t(toast.dataset.titleKey);
    }

    if (toast.dataset.messageKey && msg) {
      msg.textContent = t(toast.dataset.messageKey);
    }

    const btn = toast.querySelector(".toast__close");
    if (btn) {
      btn.setAttribute("aria-label", t("toast_close"));
    }
  });
});