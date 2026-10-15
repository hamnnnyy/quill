// Recipe load conditions. Mods ship recipes for other mods ("crush uranium, if any mod adds uranium"),
// and the game skips them when the condition fails; so must we, or quests ask for items that don't exist.
// Forge 1.20 "conditions", NeoForge 1.21 "neoforge:conditions", Fabric "fabric:load_conditions".

type J = Record<string, unknown>;
const isObj = (v: unknown): v is J => typeof v === "object" && v !== null && !Array.isArray(v);
const ALWAYS = new Set(["minecraft", "forge", "neoforge", "fabric", "c"]);

// ponytail: a tag counts as filled when some known item looks like its material (raw_x, x_ingot, ...);
// real tag contents need the game's tag files from every jar.
function tagFilled(tag: string, items: Set<string>) {
  const m = tag.replace(/^#/, "").split("/").pop()!;
  if (!tag.includes("/")) return true;
  const forms = [m, `raw_${m}`, `${m}_ingot`, `${m}_ore`, `${m}_gem`, `${m}_dust`, `${m}_nugget`, `${m}_plate`, `${m}_block`];
  for (const id of items) if (forms.includes(id.split(":").pop()!)) return true;
  return false;
}

function test(c: unknown, mods: Set<string>, items: Set<string>): boolean {
  if (!isObj(c)) return true;
  const type = String(c.type ?? c.condition ?? "").replace(/^(forge|neoforge|fabric):/, "");
  const all = (v: unknown) => (Array.isArray(v) ? v : []).every((x) => test(x, mods, items));
  const loaded = (id: unknown) => typeof id === "string" && (ALWAYS.has(id) || mods.has(id));
  switch (type) {
    case "mod_loaded":
      return loaded(c.modid);
    case "not":
      return !test(c.value, mods, items);
    case "and":
      return all(c.values);
    case "or":
      return (Array.isArray(c.values) ? c.values : []).some((x) => test(x, mods, items));
    case "tag_empty":
      return !tagFilled(String(c.tag), items);
    case "all_mods_loaded":
      return (Array.isArray(c.values) ? c.values : []).every(loaded);
    case "any_mod_loaded":
      return (Array.isArray(c.values) ? c.values : []).some(loaded);
    default:
      return true; // conditions we don't know (config flags, ...) are assumed on
  }
}

export function conditionsMet(json: unknown, mods: Set<string>, items: Set<string>) {
  if (!isObj(json)) return true;
  const list = json.conditions ?? json["neoforge:conditions"] ?? json["fabric:load_conditions"];
  return Array.isArray(list) ? list.every((c) => test(c, mods, items)) : true;
}
