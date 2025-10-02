const SIDEBAR_ROOT_SELECTOR = '.p-channel_sidebar';
const CHANNEL_NAME_SELECTOR = '.p-channel_sidebar__name';

let prefixes = [];
const originalNameMap = new WeakMap();
const appliedNameMap = new WeakMap();

const getOriginalName = (span) => {
  const currentText = span.textContent;
  const lastApplied = appliedNameMap.get(span);

  if (!originalNameMap.has(span) || (lastApplied && currentText !== lastApplied)) {
    originalNameMap.set(span, currentText);
    appliedNameMap.delete(span);
  }

  return originalNameMap.get(span) || currentText;
};

const computeHiddenName = (name) => {
  for (const prefix of prefixes) {
    if (name.startsWith(prefix)) {
      return name.substring(prefix.length).replace(/^[_\- ]/, '');
    }
  }
  return name;
};

const applyPrefixesToSpan = (span) => {
  const originalName = getOriginalName(span);
  const hiddenName = computeHiddenName(originalName);

  if (span.textContent !== hiddenName) {
    span.textContent = hiddenName;
  }

  appliedNameMap.set(span, hiddenName);
};

const hidePrefixes = (spans) => {
  const targets = spans ?? document.querySelectorAll(CHANNEL_NAME_SELECTOR);

  targets.forEach((span) => {
    if (span instanceof HTMLElement && span.isConnected) {
      applyPrefixesToSpan(span);
    }
  });
};

const pendingSpans = new Set();
let scheduleAll = false;
let rafId = null;

const flushPending = () => {
  const spansToProcess = scheduleAll
    ? undefined
    : Array.from(pendingSpans).filter((span) => span.isConnected);

  pendingSpans.clear();
  scheduleAll = false;
  rafId = null;

  hidePrefixes(spansToProcess);
};

const scheduleHide = (spans) => {
  if (Array.isArray(spans) || spans instanceof Set) {
    spans.forEach((span) => pendingSpans.add(span));
  } else if (spans instanceof NodeList) {
    spans.forEach((span) => pendingSpans.add(span));
  } else if (spans) {
    pendingSpans.add(spans);
  } else {
    scheduleAll = true;
  }

  if (rafId === null) {
    rafId = window.requestAnimationFrame(flushPending);
  }
};

const loadPrefixesAndRun = () => {
  chrome.storage.sync.get('prefixes', (data) => {
    if (data.prefixes && Array.isArray(data.prefixes)) {
      prefixes = data.prefixes;
    } else {
      prefixes = [];
    }
    scheduleHide();
  });
};

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'updatePrefixes') {
    loadPrefixesAndRun();
  }
});

const collectChannelNameElements = (node, bucket) => {
  if (!node) {
    return;
  }

  if (node.nodeType === 1) {
    const element = node;
    if (element.matches?.(CHANNEL_NAME_SELECTOR)) {
      bucket.add(element);
    }
    element.querySelectorAll?.(CHANNEL_NAME_SELECTOR).forEach((span) => bucket.add(span));
    return;
  }

  if (node.nodeType === 11 && typeof node.querySelectorAll === 'function') {
    node.querySelectorAll(CHANNEL_NAME_SELECTOR).forEach((span) => bucket.add(span));
  }
};

const observerConfig = {
  childList: true,
  subtree: true,
  characterData: true
};

const refreshObserverTargets = (observerInstance) => {
  const sidebarRoots = document.querySelectorAll(SIDEBAR_ROOT_SELECTOR);
  if (sidebarRoots.length === 0) {
    observerInstance.disconnect();
    return false;
  }

  observerInstance.disconnect();
  sidebarRoots.forEach((root) => {
    observerInstance.observe(root, observerConfig);
  });

  return true;
};

const observer = new MutationObserver((mutations) => {
  const affectedSpans = new Set();

  mutations.forEach((mutation) => {
    if (mutation.type === 'childList') {
      mutation.addedNodes.forEach((node) => collectChannelNameElements(node, affectedSpans));
      mutation.removedNodes.forEach((node) => {
        if (node.nodeType === 1 && node.matches?.(CHANNEL_NAME_SELECTOR)) {
          originalNameMap.delete(node);
          appliedNameMap.delete(node);
        }
      });
    }

    if (mutation.type === 'characterData') {
      const parentElement = mutation.target.parentElement;
      if (parentElement?.matches?.(CHANNEL_NAME_SELECTOR)) {
        affectedSpans.add(parentElement);
      }
    }
  });

  if (affectedSpans.size > 0) {
    scheduleHide(affectedSpans);
  } else {
    scheduleHide();
  }

  refreshObserverTargets(observer);
});

const startObserver = () => {
  if (!refreshObserverTargets(observer)) {
    setTimeout(startObserver, 500);
  }
};

loadPrefixesAndRun();
startObserver();
