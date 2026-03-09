const STYLE_ID = "livestyle-sync-injected";

function applyCss(css) {
  let el = document.getElementById(STYLE_ID);
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    (document.head || document.documentElement).appendChild(el);
  }
  el.textContent = css;
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== "LIVESTYLE_CSS" || typeof msg.css !== "string") return;
  if (document.head || document.body) {
    applyCss(msg.css);
  } else {
    document.addEventListener("DOMContentLoaded", () => applyCss(msg.css));
  }
});
