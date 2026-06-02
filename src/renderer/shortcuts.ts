function matchesSingle(e: KeyboardEvent, single: string): boolean {
  const parts = single.toLowerCase().split('+');
  const key = parts[parts.length - 1];
  const mods = new Set(parts.slice(0, -1));

  if (e.ctrlKey !== mods.has('ctrl')) return false;
  if (e.shiftKey !== mods.has('shift')) return false;
  if (e.altKey !== mods.has('alt')) return false;
  if (e.metaKey !== mods.has('meta')) return false;

  return e.key.toLowerCase() === key;
}

function splitShortcutAlternatives(shortcut: string): string[] {
  const alternatives: string[] = [];
  let start = 0;

  for (let i = 0; i < shortcut.length; i++) {
    if (shortcut[i] === '|' && i > start && i < shortcut.length - 1 && shortcut[i - 1] !== '+') {
      alternatives.push(shortcut.slice(start, i));
      start = i + 1;
    }
  }

  alternatives.push(shortcut.slice(start));
  return alternatives;
}

/** Check if a KeyboardEvent matches a shortcut string. Supports `|` for alternatives (e.g. "j|arrowdown") and as a key (e.g. "ctrl+shift+|"). */
export function matchesShortcut(e: KeyboardEvent, shortcut: string): boolean {
  return splitShortcutAlternatives(shortcut).some((alt) => matchesSingle(e, alt.trim()));
}

export function formatShortcut(shortcut: string): string {
  return splitShortcutAlternatives(shortcut)
    .map((alt) =>
      alt
        .trim()
        .split('+')
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join('+'),
    )
    .join(' / ');
}
