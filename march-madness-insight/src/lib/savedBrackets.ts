export const SAVED_BRACKETS_KEY = "mm2026_saved_brackets";

export type SavedBracket = {
  id: string;
  name: string;
  picks: Record<string, number>;
  savedAt: string;
  score: number | null;
  gender?: "M" | "W";
};

function genId(): string {
  return `sb_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function loadSavedBrackets(): SavedBracket[] {
  try {
    const raw = localStorage.getItem(SAVED_BRACKETS_KEY);
    if (!raw) return [];
    const j = JSON.parse(raw) as unknown;
    if (!Array.isArray(j)) return [];
    return j.filter(
      (x): x is SavedBracket =>
        x != null &&
        typeof x === "object" &&
        typeof (x as SavedBracket).name === "string" &&
        typeof (x as SavedBracket).picks === "object",
    );
  } catch {
    return [];
  }
}

export function saveBracketList(list: SavedBracket[]): void {
  try {
    localStorage.setItem(SAVED_BRACKETS_KEY, JSON.stringify(list));
  } catch {
    // quota
  }
}

export function addSavedBracket(
  name: string,
  picks: Record<string, number>,
  gender: "M" | "W" = "M",
): SavedBracket {
  const list = loadSavedBrackets();
  const entry: SavedBracket = {
    id: genId(),
    name,
    picks: { ...picks },
    savedAt: new Date().toISOString(),
    score: null,
    gender,
  };
  list.unshift(entry);
  saveBracketList(list);
  return entry;
}

export function updateSavedBracket(id: string, patch: Partial<SavedBracket>): void {
  const list = loadSavedBrackets();
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return;
  list[i] = { ...list[i], ...patch };
  saveBracketList(list);
}

export function deleteSavedBracket(id: string): void {
  saveBracketList(loadSavedBrackets().filter((x) => x.id !== id));
}
