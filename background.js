const DEFAULT_WS = "ws://127.0.0.1:8765";
const STYLE_ID = "livestyle-sync-injected";
const DEBUG_LOG_MAX = 100;

let wsUrl = DEFAULT_WS;
let syncTabId = null;
let debugLog = [];
let debugEnabled = false;

function isInjectableUrl(url) {
  if (!url) return false;
  return url.startsWith("http://") || url.startsWith("https://");
}

function dbg(msg) {
  if (!debugEnabled) return;
  const line = `[${new Date().toLocaleTimeString("ru-RU", { hour12: false })}] ${msg}`;
  debugLog.push(line);
  if (debugLog.length > DEBUG_LOG_MAX) debugLog.shift();
}

async function closeOffscreen() {
  try {
    await chrome.offscreen.closeDocument();
  } catch (_) {}
  syncTabId = null;
  chrome.storage.local.set({ livestyleConnected: false, livestyleSyncTabId: null });
  dbg("отключено");
}

function doInject(tabId, css, useMainWorld) {
  const opts = {
    target: { tabId },
    func: (id, cssText) => {
      var el = document.getElementById(id);
      if (!el) {
        el = document.createElement("style");
        el.id = id;
        (document.head || document.documentElement).appendChild(el);
      }
      el.textContent = cssText;
    },
    args: [STYLE_ID, css],
  };
  if (useMainWorld) opts.world = "MAIN";
  return chrome.scripting.executeScript(opts);
}

function injectCssInTab(tabId, css) {
  dbg("инъекция в вкладку " + tabId + ", " + css.length + " байт");
  doInject(tabId, css, false)
    .then(() => { dbg("инъекция OK"); })
    .catch((err) => {
      dbg("инъекция ошибка: " + (err && err.message) + ", пробуем MAIN world");
      doInject(tabId, css, true)
        .then(() => { dbg("инъекция OK (MAIN)"); })
        .catch((e2) => { dbg("инъекция ошибка MAIN: " + (e2 && e2.message)); });
    });
}

function sendCssToTab(tabId, css) {
  chrome.tabs.sendMessage(tabId, { type: "LIVESTYLE_CSS", css }).then(() => {
    dbg("CSS отправлено в content script вкладки " + tabId);
  }).catch(() => {
    injectCssInTab(tabId, css);
  });
}

async function ensureOffscreenAndStart() {
  if (!syncTabId) return;
  try {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["WORKERS"],
      justification: "WebSocket for LiveStyle CSS sync (service worker cannot hold persistent connections)",
    });
    // Документ загружен — сразу говорим открыть WebSocket (OFFSCREEN_READY из offscreen может не дойти до SW)
    chrome.runtime.sendMessage({ type: "START_WS", wsUrl, syncTabId }).catch(() => {});
  } catch (e) {
    if (!e.message || !e.message.includes("single offscreen")) throw e;
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "OFFSCREEN_READY") {
    if (syncTabId && wsUrl) {
      chrome.runtime.sendMessage({ type: "START_WS", wsUrl, syncTabId }).catch(() => {});
    }
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === "LIVESTYLE_WS_CONNECTED") {
    chrome.storage.local.set({ livestyleConnected: true });
    dbg("подключено к редактору");
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === "LIVESTYLE_WS_DISCONNECTED") {
    chrome.storage.local.set({ livestyleConnected: false });
    dbg("соединение с редактором закрыто");
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === "INJECT_CSS") {
    const tabId = msg.tabId;
    const css = msg.css;
    if (tabId != null && typeof css === "string") {
      dbg("получен CSS " + css.length + " байт");
      chrome.tabs.get(tabId).then((tab) => {
        if (tab?.id && isInjectableUrl(tab.url)) sendCssToTab(tab.id, css);
      }).catch(() => {});
    }
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === "GET_SYNC_STATE") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTabId = tabs[0]?.id ?? null;
      const isThisTab = currentTabId !== null && currentTabId === syncTabId;
      sendResponse({ enabled: isThisTab, syncTabId });
    });
    return true;
  }
  if (msg.type === "ENABLE_SYNC_FOR_THIS_TAB") {
    const tabId = msg.tabId ?? sender.tab?.id;
    if (!tabId) { sendResponse({ ok: false }); return true; }
    chrome.tabs.get(tabId).then(async (tab) => {
      if (!tab || !isInjectableUrl(tab.url)) {
        dbg("вкладка не подходит: " + (tab?.url || tabId));
        sendResponse({ ok: false });
        return;
      }
      syncTabId = tabId;
      chrome.storage.local.set({ livestyleSyncTabId: tabId });
      dbg("синхронизация включена для вкладки " + tabId);
      await ensureOffscreenAndStart();
      sendResponse({ ok: true });
    }).catch(() => { sendResponse({ ok: false }); });
    return true;
  }
  if (msg.type === "DISABLE_SYNC") {
    dbg("синхронизация выключена пользователем");
    closeOffscreen();
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === "GET_WS_PORT") {
    try {
      const port = new URL(wsUrl).port || "8765";
      sendResponse({ port: parseInt(port, 10) });
    } catch (_) {
      sendResponse({ port: 8765 });
    }
    return true;
  }
  if (msg.type === "GET_DEBUG_LOG") {
    sendResponse(debugLog.slice());
    return true;
  }
  if (msg.type === "CLEAR_DEBUG_LOG") {
    debugLog = [];
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === "GET_DEBUG_STATE") {
    sendResponse({ debug: debugEnabled });
    return true;
  }
  if (msg.type === "SET_DEBUG") {
    debugEnabled = msg.value === true;
    chrome.storage.local.set({ livestyleDebug: debugEnabled });
    sendResponse({ ok: true });
    return true;
  }
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === syncTabId) {
    dbg("рабочая вкладка закрыта");
    closeOffscreen();
  }
});

chrome.storage.local.get(["wsUrl", "livestyleSyncTabId", "livestyleDebug"], (r) => {
  wsUrl = (r.wsUrl && r.wsUrl.trim()) || DEFAULT_WS;
  debugEnabled = r.livestyleDebug === true;
  if (r.livestyleSyncTabId != null) {
    syncTabId = r.livestyleSyncTabId;
    ensureOffscreenAndStart();
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.wsUrl) {
    wsUrl = (changes.wsUrl.newValue || DEFAULT_WS).trim() || DEFAULT_WS;
  }
  if (changes.livestyleDebug !== undefined) {
    debugEnabled = changes.livestyleDebug.newValue === true;
  }
  if (changes.livestyleSyncTabId !== undefined) {
    syncTabId = changes.livestyleSyncTabId.newValue ?? null;
    if (!syncTabId) closeOffscreen();
    else ensureOffscreenAndStart();
  }
});
