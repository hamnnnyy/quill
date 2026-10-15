import { unzipSync, strFromU8 } from "fflate";
import type { Mod, RawRecipe, Recipe } from "./types";

// data/<ns>/recipes/, also nested (TACZ gun packs live in assets/tacz/custom/<pack>/data/...),
// but not data/<ns>/advancements/recipes/, which only unlock recipes
const RECIPE = /(^|\/)data\/[^/]+\/recipes?\/.*\.json$/;
const LANG = /\/lang\/(en_us|ko_kr)\.json$/;
const META = /^META-INF\/(neoforge\.)?mods\.toml$|^fabric\.mod\.json$/;
// Inventory icons: textures/item, textures/block, and data-driven "slot" icons (TACZ guns live in textures/gun/slot).
const ICON = /assets\/([a-z0-9_.-]+)\/textures\/(item|block|(?:.+\/)?slot)\/([a-z0-9_.-]+)\.png$/;
const ICON_RANK: Record<string, number> = { item: 0, block: 2 }; // anything else is a slot folder, rank 1
const ID = /\b[a-z0-9_.-]+:[a-z0-9_/.-]+\b/g;

export type Extract = {
  mods: Mod[];
  known: Set<string>; // every namespaced id seen; Gemini output is checked against it
  names: Map<string, string>;
  icons: Map<string, string>;
};

export const emptyExtract = (): Extract => ({ mods: [], known: new Set(), names: new Map(), icons: new Map() });

export function merge(into: Extract, from: Extract) {
  into.mods.push(...from.mods);
  from.known.forEach((id) => into.known.add(id));
  from.names.forEach((v, k) => into.names.set(k, v));
  from.icons.forEach((v, k) => into.icons.has(k) || into.icons.set(k, v));
}

function addLangNames(names: Map<string, string>, known: Set<string>, lang: Record<string, string>) {
  for (const [key, raw] of Object.entries(lang)) {
    const value = raw.replace(/§./g, ""); // Minecraft color codes, e.g. §9
    const item = key.match(/^(?:item|block)\.([a-z0-9_]+)\.([a-z0-9_/]+)$/);
    if (item) {
      known.add(`${item[1]}:${item[2]}`);
      names.set(`${item[1]}:${item[2]}`, value);
      continue;
    }
    // Data-driven items name themselves differently, e.g. tacz.gun.ak47.name
    const custom = key.match(/^([a-z0-9_]+)\.[a-z_]+\.([a-z0-9_/]+)\.name$/);
    if (custom && !names.has(`${custom[1]}:${custom[2]}`)) names.set(`${custom[1]}:${custom[2]}`, value);
  }
}

function modMeta(files: Record<string, Uint8Array>, fallback: string) {
  for (const [name, data] of Object.entries(files)) {
    if (!META.test(name)) continue;
    const text = strFromU8(data);
    if (name.endsWith(".json")) {
      try {
        const j = JSON.parse(text);
        return { id: String(j.id ?? fallback), name: String(j.name ?? j.id ?? fallback) };
      } catch {
        continue;
      }
    }
    // ponytail: regex over TOML, takes the first [[mods]] entry; fine for one-mod jars.
    const id = text.match(/^\s*modId\s*=\s*"([^"]+)"/m)?.[1];
    const display = text.match(/^\s*displayName\s*=\s*"([^"]+)"/m)?.[1];
    if (id) return { id, name: display ?? id };
  }
  return { id: fallback, name: fallback };
}

// Reads only recipe, lang, metadata and icon files; models, sounds and classes are never inflated.
// Data URLs, not blob: URLs: they survive being saved to IndexedDB and restored after a reload.
function pngDataUrl(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/png;base64,${btoa(s)}`;
}

export function readJar(bytes: Uint8Array, fileName: string): Extract {
  const files = unzipSync(bytes, {
    filter: (f) => RECIPE.test(f.name) || LANG.test(f.name) || ICON.test(f.name) || META.test(f.name),
  });
  const recipes: RawRecipe[] = [];
  const en: Record<string, string> = {};
  const ko: Record<string, string> = {};
  const icons = new Map<string, { url: string; rank: number }>();
  for (const [name, data] of Object.entries(files)) {
    const icon = name.match(ICON);
    if (icon) {
      const key = `${icon[1]}:${icon[3]}`;
      const rank = ICON_RANK[icon[2]] ?? 1;
      if ((icons.get(key)?.rank ?? 9) > rank)
        icons.set(key, { url: pngDataUrl(data), rank });
      continue;
    }
    if (!RECIPE.test(name) && !LANG.test(name)) continue;
    let json: unknown;
    try {
      json = JSON.parse(strFromU8(data));
    } catch {
      continue; // some mods ship JSON with comments; skip rather than fail the whole jar
    }
    if (RECIPE.test(name)) recipes.push({ file: name, json });
    else Object.assign(name.endsWith("ko_kr.json") ? ko : en, json);
  }

  // ponytail: regex over raw text, not a real registry; misses items only registered in code.
  const known = new Set(JSON.stringify(recipes).match(ID));
  const names = new Map<string, string>();
  addLangNames(names, known, { ...en, ...ko });
  const meta = modMeta(files, fileName.replace(/\.jar$/, ""));
  return {
    mods: [{ ...meta, recipes }],
    known,
    names,
    icons: new Map([...icons].map(([k, v]) => [k, v.url])),
  };
}

// Output of public/quill_export.js (KubeJS): every loaded recipe after scripts ran, grouped into mods by namespace.
export function readDump(json: unknown): Extract {
  const dump = json as { recipes?: { id: string; json: unknown }[]; items?: string[] };
  if (!Array.isArray(dump?.recipes)) throw new Error("Quill 레시피 덤프 파일이 아니에요. kubejs/exported/quill.json 을 넣어 주세요.");
  const byNs = new Map<string, RawRecipe[]>();
  for (const r of dump.recipes) {
    const ns = r.id.split(":")[0];
    byNs.set(ns, [...(byNs.get(ns) ?? []), { file: r.id, json: r.json }]);
  }
  const known = new Set([...(dump.items ?? []), ...(JSON.stringify(dump.recipes).match(ID) ?? [])]);
  return {
    mods: [...byNs].map(([id, recipes]) => ({ id, name: id, recipes })),
    known,
    names: new Map(),
    icons: new Map(),
  };
}

export const recipeIds = (r: Recipe) =>
  [r.result, r.result_variant, ...r.ingredients.map((i) => i.id.replace(/^#/, ""))].filter(Boolean);
