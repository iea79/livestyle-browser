let ws = null;
let wsUrl = "";
let syncTabId = null;
let reconnectTimer = null;
const PING_INTERVAL_MS = 8000;
let pingInterval = null;

function connect() {
  if (!wsUrl || syncTabId == null) return;
  if (ws) {
    if (ws.readyState === 1) return;
    if (ws.readyState === 0) return;
    try { ws.close(); } catch (_) {}
    ws = null;
  }
  ws = new WebSocket(wsUrl);
  ws.onopen = () => {
    chrome.runtime.sendMessage({ type: "LIVESTYLE_WS_CONNECTED" });
    if (pingInterval) clearInterval(pingInterval);
    pingInterval = setInterval(() => {
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: "ping" }));
    }, PING_INTERVAL_MS);
  };
  ws.onclose = () => {
    if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
    chrome.runtime.sendMessage({ type: "LIVESTYLE_WS_DISCONNECTED" });
    ws = null;
    if (syncTabId != null) {
      reconnectTimer = setTimeout(connect, 3000);
    }
  };
  ws.onerror = () => { ws = null; };
  ws.onmessage = (event) => {
    try {
      const raw = event.data;
      if (typeof raw !== "string") return;
      const payload = JSON.parse(raw);
      if (payload && payload.type === "pong") return;
      const css = payload.css;
      if (typeof css !== "string" || syncTabId == null) return;
      chrome.runtime.sendMessage({ type: "INJECT_CSS", tabId: syncTabId, css });
    } catch (_) {}
  };
}

chrome.runtime.sendMessage({ type: "OFFSCREEN_READY" }).catch(() => {});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "START_WS") {
    wsUrl = msg.wsUrl || "";
    syncTabId = msg.syncTabId ?? null;
    connect();
  } else if (msg.type === "UPDATE_TAB") {
    syncTabId = msg.syncTabId ?? null;
  } else if (msg.type === "CLOSE_WS") {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    syncTabId = null;
    if (ws) {
      try { ws.close(); } catch (_) {}
      ws = null;
    }
    if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
  }
});
