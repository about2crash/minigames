// Registers the site-wide service worker. Include with the right relative path
// and pass the site root via data-root, e.g. <script src="../../shared/pwa.js" data-root="../../" defer></script>
(() => {
  if (!("serviceWorker" in navigator)) return;
  const root = document.currentScript?.dataset.root || "./";
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${root}sw.js`, { scope: root }).catch(() => {});
  });
})();
