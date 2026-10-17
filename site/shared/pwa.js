// Registers the site-wide service worker. Include with the right relative path
// and pass the site root via data-root, e.g. <script src="../../shared/pwa.js" data-root="../../" defer></script>
// Also paints the browser bar (<meta name="theme-color">) in the brand's --face color.
(() => {
  const root = document.currentScript?.dataset.root || "./";
  window.addEventListener("load", () => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      document.body.style.color = "var(--face)";
      meta.content = getComputedStyle(document.body).color;
      document.body.style.color = "";
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register(`${root}sw.js`, { scope: root }).catch(() => {});
    }
  });
})();
