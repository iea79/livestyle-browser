const statusEl = document.getElementById('status');
const toggleBtn = document.getElementById('toggle');
const optionsLink = document.getElementById('options');

function setToggle(enabled) {
    if (!toggleBtn) return;
    toggleBtn.textContent = enabled ? 'Выключить' : 'Включить';
    toggleBtn.className = enabled ? 'btn btn-off' : 'btn btn-on';
}

function showStatus(connected) {
    if (!statusEl) return;
    statusEl.textContent = connected ? 'Подключено к редактору' : 'Нет подключения (включите синхронизацию)';
    statusEl.className = 'status' + (connected ? ' ok' : '');
}

function init() {
    chrome.storage.local.get(['livestyleConnected'], (r) => {
        showStatus(r.livestyleConnected === true);
    });
    chrome.runtime.sendMessage({ type: 'GET_SYNC_STATE' }, (r) => {
        setToggle(r && r.enabled === true);
    });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.livestyleConnected) showStatus(changes.livestyleConnected.newValue === true);
    });

    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            chrome.runtime.sendMessage({ type: 'GET_SYNC_STATE' }, (r) => {
                if (r && r.enabled) {
                    chrome.runtime.sendMessage({ type: 'DISABLE_SYNC' }, () => {
                        setToggle(false);
                        showStatus(false);
                    });
                } else {
                    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                        const tabId = tabs[0]?.id;
                        if (!tabId) return;
                        chrome.runtime.sendMessage({ type: 'ENABLE_SYNC_FOR_THIS_TAB', tabId }, (res) => {
                            if (res && res.ok) {
                                setToggle(true);
                                chrome.storage.local.get(['livestyleConnected'], (x) => showStatus(x.livestyleConnected === true));
                            }
                        });
                    });
                }
            });
        });
    }

    if (optionsLink) {
        optionsLink.addEventListener('click', (e) => {
            e.preventDefault();
            chrome.runtime.openOptionsPage();
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
setTimeout(() => {
    if (statusEl && statusEl.textContent === 'Загрузка…') {
        statusEl.textContent = 'Нет подключения (включите синхронизацию)';
        statusEl.className = 'status';
    }
}, 500);
