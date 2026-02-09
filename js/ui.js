document.addEventListener("DOMContentLoaded", () => {
  const btn = document.querySelector("#menuBtn");
  const nav = document.querySelector("#mobileNav");
  if (!btn || !nav) return;

  btn.addEventListener("click", () => {
    const open = nav.getAttribute("data-open") === "true";
    nav.setAttribute("data-open", String(!open));
    nav.style.display = open ? "none" : "block";
    btn.setAttribute("aria-expanded", String(!open));
  });
});
