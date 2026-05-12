// Injects a <style> tag into document.head, deduping by `name`.
// Safe to call from multiple modules on import — subsequent calls
// for the same `name` are no-ops.

const injected = new Set<string>();

export function injectStyle(name: string, css: string): void {
  if (injected.has(name)) return;
  const el = document.createElement('style');
  el.dataset.injectedBy = name;
  el.textContent = css;
  document.head.appendChild(el);
  injected.add(name);
}
