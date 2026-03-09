const DEFAULT_WS = "ws://127.0.0.1:8765";
const input = document.getElementById("wsUrl");
const saveBtn = document.getElementById("save");
const savedEl = document.getElementById("saved");
const debugCheck = document.getElementById("debugCheck");
const refreshBtn = document.getElementById("refreshLog");
const clearBtn = document.getElementById("clearLog");
const debugLogEl = document.getElementById("debugLog");

chrome.storage.local.get(["wsUrl", "livestyleDebug"], (r) => {
  input.value = (r.wsUrl && r.wsUrl.trim()) || DEFAULT_WS;
  debugCheck.checked = r.livestyleDebug === true;
});

function refreshLog() {
  chrome.runtime.sendMessage({ type: "GET_DEBUG_LOG" }, (lines) => {
    debugLogEl.textContent = Array.isArray(lines) && lines.length ? lines.join("\n") : "(лог пуст)";
  });
}

saveBtn.addEventListener("click", () => {
  const url = (input.value && input.value.trim()) || DEFAULT_WS;
  chrome.storage.local.set({ wsUrl: url }, () => {
    savedEl.textContent = "Сохранено";
    setTimeout(() => { savedEl.textContent = ""; }, 2000);
  });
});

debugCheck.addEventListener("change", () => {
  chrome.runtime.sendMessage({ type: "SET_DEBUG", value: debugCheck.checked }, () => {
    refreshLog();
  });
});

refreshBtn.addEventListener("click", refreshLog);
clearBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "CLEAR_DEBUG_LOG" }, () => {
    refreshLog();
  });
});

refreshLog();
setInterval(refreshLog, 2000);
