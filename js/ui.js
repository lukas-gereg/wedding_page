document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("menuBtn");
  const nav = document.getElementById("mobileNav");

  btn.addEventListener("click", () => {
    const isOpen = nav.getAttribute("data-open") === "true";

    nav.setAttribute("data-open", !isOpen);
    btn.setAttribute("aria-expanded", !isOpen);
  });
});
