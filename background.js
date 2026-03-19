// Open side panel when clicking the extension icon
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// Enable side panel for all pages
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
