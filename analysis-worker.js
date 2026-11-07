/* Detection stays local; the Worker never reads files or uses the network. */
importScripts("core.js?v=20261107-1");

self.onmessage = ({ data }) => {
  try {
    self.postMessage({ id: data.id, ...analyzeText(data.text) });
  } catch (error) {
    self.postMessage({ id: data.id, error: error.message });
  }
};
