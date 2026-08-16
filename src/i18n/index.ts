import en from "./en.json";
import es from "./es.json";

export type Lang = "en" | "es";

const DICTIONARIES: Record<Lang, unknown> = { en, es };
export const LANGS: Lang[] = ["en", "es"];

export const LANG_STORAGE_KEY = "subduction-state:lang";

/** Resolve a dot-path against a nested dictionary. */
function resolve(dict: unknown, path: string): unknown {
  let node: unknown = dict;
  for (const part of path.split(".")) {
    if (node == null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

export function translate(
  lang: Lang,
  path: string,
  params?: Record<string, string | number>,
): string {
  const raw = resolve(DICTIONARIES[lang], path);
  let text: string;
  if (typeof raw === "string") {
    text = raw;
  } else {
    const fallback = resolve(DICTIONARIES.en, path);
    text = typeof fallback === "string" ? fallback : path;
  }
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      text = text.replaceAll(`{${key}}`, String(value));
    }
  }
  return text;
}

/** list helper: tList("path.to.list") → array of strings */
export function translateList(lang: Lang, path: string): string[] {
  const raw = resolve(DICTIONARIES[lang], path);
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === "string");
  const fb = resolve(DICTIONARIES.en, path);
  return Array.isArray(fb) ? fb.filter((x): x is string => typeof x === "string") : [];
}
