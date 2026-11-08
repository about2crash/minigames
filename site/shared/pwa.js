// Registers the site-wide service worker. Include with the right relative path
// and pass the site root via data-root, e.g. <script src="../../shared/pwa.js" data-root="../../"></script>
// Also applies the Light/Dark/System choice from the Settings page (before the page paints,
// so keep this script in <head>, not deferred) and paints the browser bar
// (<meta name="theme-color">) in the brand's --face color.
(() => {
  const root = document.currentScript?.dataset.root || "./";
  const applyTheme = () => {
    let theme = "system";
    try { theme = JSON.parse(localStorage.getItem("minigames:settings"))?.theme || "system"; } catch {}
    if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
  };
  const paintBar = () => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta || !document.body) return;
    document.body.style.color = "var(--face)";
    meta.content = getComputedStyle(document.body).color;
    document.body.style.color = "";
  };
  applyTheme();
  // another tab (the Settings page) changed it
  window.addEventListener("storage", (e) => { if (e.key === "minigames:settings") { applyTheme(); paintBar(); } });
  window.addEventListener("minigames:theme", () => { applyTheme(); paintBar(); });
  window.addEventListener("load", () => {
    paintBar();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register(`${root}sw.js`, { scope: root }).catch(() => {});
    }
  });
})();
