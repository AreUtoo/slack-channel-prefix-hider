const STORAGE_KEY = 'prefixes';
const STATUS_HIDE_DELAY = 2000;
const DEBUG_LOGGING = false;

const logWarning = (...args) => {
  if (DEBUG_LOGGING) {
    console.warn(...args);
  }
};

const getStoredPrefixes = () =>
  new Promise((resolve, reject) => {
    chrome.storage.sync.get(STORAGE_KEY, (data) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }

      const stored = data?.[STORAGE_KEY];
      resolve(Array.isArray(stored) ? stored : []);
    });
  });

const savePrefixes = (prefixes) =>
  new Promise((resolve, reject) => {
    chrome.storage.sync.set({ [STORAGE_KEY]: prefixes }, () => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve();
    });
  });

const querySlackTabs = () =>
  new Promise((resolve, reject) => {
    chrome.tabs.query({ url: '*://app.slack.com/*' }, (tabs) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(tabs || []);
    });
  });

const notifySlackTabs = async () => {
  const tabs = await querySlackTabs();
  if (tabs.length === 0) {
    return 0;
  }

  let notified = 0;

  await Promise.all(
    tabs.map(
      (tab) =>
        new Promise((resolve) => {
          if (!tab.id) {
            resolve();
            return;
          }

          chrome.tabs.sendMessage(tab.id, { action: 'updatePrefixes' }, () => {
            if (!chrome.runtime.lastError) {
              notified += 1;
            }
            resolve();
          });
        })
    )
  );

  return notified;
};

const parsePrefixesInput = (value) => {
  const seen = new Set();
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => {
      if (seen.has(line)) {
        return false;
      }
      seen.add(line);
      return true;
    });
};

document.addEventListener('DOMContentLoaded', () => {
  const prefixesText = document.getElementById('prefixes');
  const saveButton = document.getElementById('save');
  const statusEl = document.getElementById('status');

  let statusTimerId;

  const showStatus = (message, isError = false) => {
    if (!statusEl) {
      return;
    }

    window.clearTimeout(statusTimerId);
    statusEl.textContent = message;
    statusEl.style.color = isError ? '#d72d30' : '#007a5a';

    if (!isError) {
      statusTimerId = window.setTimeout(() => {
        statusEl.textContent = '';
      }, STATUS_HIDE_DELAY);
    }
  };

  const loadStoredPrefixes = async () => {
    try {
      const stored = await getStoredPrefixes();
      if (prefixesText) {
        prefixesText.value = stored.join('\n');
      }
    } catch (error) {
      logWarning('Slack Prefix Hider: failed to load prefixes from storage.', error);
      showStatus('設定の読み込みに失敗しました。', true);
    }
  };

  saveButton?.addEventListener('click', async () => {
    if (!prefixesText) {
      return;
    }

    const prefixes = parsePrefixesInput(prefixesText.value);

    try {
      await savePrefixes(prefixes);
      const notifiedCount = await notifySlackTabs();

      if (notifiedCount === 0) {
        showStatus('保存しました。Slack タブが開いていないため、再読込で反映されます。');
      } else {
        showStatus('保存しました！');
      }
    } catch (error) {
      logWarning('Slack Prefix Hider: failed to save prefixes.', error);
      showStatus('保存に失敗しました。もう一度お試しください。', true);
    }
  });

  loadStoredPrefixes();
});
