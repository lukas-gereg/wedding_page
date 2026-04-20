document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("menuBtn");
  const nav = document.getElementById("mobileNav");

  btn.addEventListener("click", () => {
    const isOpen = nav.getAttribute("data-open") === "true";

    nav.setAttribute("data-open", !isOpen);
    btn.setAttribute("aria-expanded", !isOpen);
  });
});

function updateTimelineLine() {
  const timeline = document.querySelector(".timeline");
  if (!timeline) return;

  const items = timeline.querySelectorAll(".t-item");
  if (items.length < 2) return;

  const first = items[0];
  const last = items[items.length - 1];

  const timelineRect = timeline.getBoundingClientRect();
  const firstRect = first.getBoundingClientRect();
  const lastRect = last.getBoundingClientRect();

  const top = (firstRect.top - timelineRect.top) + firstRect.height / 2;
  const bottom = (lastRect.top - timelineRect.top) + lastRect.height / 2;
  const height = Math.max(0, bottom - top);

  const dotLeft = getComputedStyle(first, "::before").left;

  timeline.style.setProperty("--timeline-line-top", `${top}px`);
  timeline.style.setProperty("--timeline-line-height", `${height}px`);
  timeline.style.setProperty("--timeline-line-x", dotLeft);
}

window.addEventListener("load", updateTimelineLine);
window.addEventListener("resize", updateTimelineLine);
