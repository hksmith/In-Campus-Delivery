/**
 * In-app text prompt (window.prompt is blocked in some Telegram clients).
 * Rendered by <PromptHost /> in components/ui.jsx.
 */
const listeners = new Set();

export function promptDialog(message, defaultValue = '') {
  return new Promise((resolve) => {
    if (!listeners.size) {
      resolve(window.prompt(message, defaultValue));
      return;
    }
    listeners.forEach((l) => l({ message, defaultValue, resolve }));
  });
}

export function subscribePrompt(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
