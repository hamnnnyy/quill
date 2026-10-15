import type { Recipe } from "./types";

// Converts the recipe formats everyone shares without asking Gemini.
// Returns null for anything unfamiliar; those go to /api/normalize instead.

type J = Record<string, unknown>;
const isObj = (v: unknown): v is J => typeof v === "object" && v !== null && !Array.isArray(v);

// {"item":"x"} | {"tag":"y"} | "x" | "#y" (1.21) | [alternatives] -> "x" | "#y"
function ingredient(v: unknown): string | null {
  if (Array.isArray(v)) return v.length ? ingredient(v[0]) : null;
  if (typeof v === "string") return v;
  if (!isObj(v)) return null;
  if (typeof v.item === "string") return v.item;
  if (typeof v.tag === "string") return `#${v.tag}`;
  return null; // custom ingredient types (forge:nbt, etc.)
}

// "x" | {"item":"x","count":2} | {"id":"x","count":2} (1.21)
function result(v: unknown, fallbackCount = 1): { id: string; count: number } | null {
  if (typeof v === "string") return { id: v, count: fallbackCount };
  if (!isObj(v)) return null;
  const id = typeof v.item === "string" ? v.item : typeof v.id === "string" ? v.id : null;
  return id ? { id, count: typeof v.count === "number" ? v.count : fallbackCount } : null;
}

function tally(ids: (string | null)[]) {
  if (ids.some((i) => i === null)) return null;
  const counts = new Map<string, number>();
  for (const id of ids as string[]) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].map(([id, count]) => ({ id, count }));
}

const COOKING: Record<string, string> = {
  smelting: "furnace",
  blasting: "blast_furnace",
  smoking: "smoker",
  campfire_cooking: "campfire",
};

// TACZ guns, ammo and attachments are one item each, told apart by an NBT id.
// Verified against tacz-1.20.1-1.1.8 classes (ModItems, *ItemDataAccessor).
const TACZ: Record<string, { item: string; key: string }> = {
  gun: { item: "tacz:modern_kinetic_gun", key: "GunId" },
  ammo: { item: "tacz:ammo", key: "AmmoId" },
  attachment: { item: "tacz:attachment", key: "AttachmentId" },
};

// Create's processing recipes share one shape: ingredients[] in, results[] out, a machine does the work.
// Verified against create-1.20.1-6.0.8 data. Addons that reuse create:* types get the same treatment.
const CREATE: Record<string, string> = {
  milling: "create:millstone",
  crushing: "create:crushing_wheel",
  pressing: "create:mechanical_press",
  compacting: "create:mechanical_press",
  mixing: "create:mechanical_mixer",
  deploying: "create:deployer",
  item_application: "create:deployer",
  splashing: "create:encased_fan",
  haunting: "create:encased_fan",
  cutting: "create:mechanical_saw",
  filling: "create:spout",
  emptying: "create:item_drain",
  sandpaper_polishing: "create:sand_paper",
};

export function convert(json: unknown, source: string): Recipe | null {
  if (!isObj(json) || typeof json.type !== "string") return null;
  const type = json.type.replace(/^minecraft:/, "");
  const base = { result_variant: "", source };

  if (type === "crafting_shaped" && Array.isArray(json.pattern) && isObj(json.key)) {
    const key = json.key;
    const cells = (json.pattern as string[]).join("").split("").filter((c) => c !== " ");
    const ings = tally(cells.map((c) => ingredient(key[c])));
    const out = result(json.result);
    return ings && out ? { ...base, result: out.id, result_count: out.count, station: "crafting_table", ingredients: ings } : null;
  }
  if (type === "crafting_shapeless" && Array.isArray(json.ingredients)) {
    const ings = tally(json.ingredients.map(ingredient));
    const out = result(json.result);
    return ings && out ? { ...base, result: out.id, result_count: out.count, station: "crafting_table", ingredients: ings } : null;
  }
  if (type in COOKING) {
    const ing = ingredient(json.ingredient);
    const out = result(json.result);
    return ing && out ? { ...base, result: out.id, result_count: out.count, station: COOKING[type], ingredients: [{ id: ing, count: 1 }] } : null;
  }
  if (type === "stonecutting") {
    const ing = ingredient(json.ingredient);
    const out = result(json.result, typeof json.count === "number" ? json.count : 1);
    return ing && out ? { ...base, result: out.id, result_count: out.count, station: "stonecutter", ingredients: [{ id: ing, count: 1 }] } : null;
  }
  if (type === "smithing_transform") {
    const ings = tally([json.template, json.base, json.addition].map(ingredient));
    const out = result(json.result);
    return ings && out ? { ...base, result: out.id, result_count: out.count, station: "smithing_table", ingredients: ings } : null;
  }
  const create = json.type.match(/^create:(\w+)$/)?.[1];
  if (create === "mechanical_crafting" && Array.isArray(json.pattern) && isObj(json.key)) {
    const key = json.key;
    const cells = (json.pattern as string[]).join("").split("").filter((c) => c !== " ");
    const ings = tally(cells.map((c) => ingredient(key[c])));
    const out = result(json.result);
    return ings && out ? { ...base, result: out.id, result_count: out.count, station: "create:mechanical_crafter", ingredients: ings } : null;
  }
  if (create && CREATE[create] && Array.isArray(json.ingredients) && Array.isArray(json.results)) {
    const items = json.ingredients.filter((i) => !(isObj(i) && "fluid" in i)); // fluids aren't items a quest can ask for
    const ings = tally(items.map(ingredient));
    // the guaranteed output; chance < 1 extras (experience nuggets, byproducts) aren't what the recipe is for
    const main = json.results.find((r) => !isObj(r) || typeof r.chance !== "number" || r.chance >= 1);
    const out = result(main);
    return ings?.length && out ? { ...base, result: out.id, result_count: out.count, station: CREATE[create], ingredients: ings } : null;
  }
  if (json.type === "tacz:gun_smith_table_crafting" && Array.isArray(json.materials) && isObj(json.result)) {
    const r = json.result;
    const ings = json.materials.map((m: J) => ({ id: ingredient(m.item), count: typeof m.count === "number" ? m.count : 1 }));
    if (ings.some((i) => !i.id)) return null;
    // "custom" results are ordinary items, e.g. {"type":"custom","item":{"item":"minecraft:painting","nbt":{...}}}
    const custom = r.type === "custom" ? result(r.item) : null;
    if (custom)
      return { ...base, result: custom.id, result_count: custom.count, station: "tacz:gun_smith_table", ingredients: ings as { id: string; count: number }[] };
    const kind = TACZ[String(r.type)];
    if (!kind || typeof r.id !== "string") return null;
    return {
      result: kind.item,
      result_variant: r.id,
      result_count: typeof r.count === "number" ? r.count : 1,
      station: "tacz:gun_smith_table",
      ingredients: ings as { id: string; count: number }[],
      source,
      nbt: { [kind.key]: r.id },
    };
  }
  return null;
}
