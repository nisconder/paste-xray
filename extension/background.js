const SELECTION_MENU_ID = "paste-xray-scan-selection";
const MAX_SELECTION_CHARACTERS = 1_000_000;

function createScanKey() {
  const randomPart = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `paste_xray_${randomPart}`;
}

function scannerUrl(scanKey = "") {
  const base = chrome.runtime.getURL("index.html");
  return scanKey ? `${base}?scan=${encodeURIComponent(scanKey)}#top` : `${base}#top`;
}

async function openScanner(scanKey = "") {
  await chrome.tabs.create({ url: scannerUrl(scanKey) });
}

async function installSelectionMenu() {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: SELECTION_MENU_ID,
    title: "使用 Paste X-Ray 检查选中文字",
    contexts: ["selection"],
  });
}

chrome.runtime.onInstalled.addListener(() => {
  void installSelectionMenu();
});

chrome.action.onClicked.addListener(() => {
  void openScanner();
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== SELECTION_MENU_ID || typeof info.selectionText !== "string") return;

  const scanKey = createScanKey();
  const truncated = info.selectionText.length > MAX_SELECTION_CHARACTERS;
  const text = truncated
    ? info.selectionText.slice(0, MAX_SELECTION_CHARACTERS)
    : info.selectionText;

  void chrome.storage.session.set({
    [scanKey]: {
      text,
      truncated,
      createdAt: Date.now(),
    },
  }).then(() => openScanner(scanKey));
});
