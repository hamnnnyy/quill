const ALIAS: Record<string, string> = { lapis: "lapis_lazuli", wooden: "stick" };
const forms = (n: string) => [...new Set([n, n.replace(/es$/, ""), n.replace(/s$/, "")])];

// Icon keys to try for an id, best first. Items: "<ns>:<last path segment>".
// Tags have no icon, so guess a representative vanilla item:
//   #forge:ingots/iron -> iron_ingot, #forge:gems/diamond -> diamond, #minecraft:logs -> oak_log
// ponytail: naming heuristic, misses odd tags; a real tag→item index needs the game's tag JSON.
export function iconKeys(id: string): string[] {
  const [ns, path = ""] = id.replace(/^#/, "").split(":");
  const parts = path.split("/");
  const last = parts.at(-1)!;
  if (!id.startsWith("#")) return [`${ns}:${last}`];
  if (parts.length > 1) {
    const mat = ALIAS[last] ?? last;
    return [...forms(parts[0]).map((c) => `minecraft:${mat}_${c}`), `minecraft:${mat}`, `minecraft:${mat}_block`];
  }
  return forms(last).flatMap((c) => [`minecraft:oak_${c}`, `minecraft:white_${c}`, `minecraft:${c}`, `${ns}:${c}`]);
}

export const iconFor = (id: string, icons: Map<string, string>) =>
  iconKeys(id).map((k) => icons.get(k)).find(Boolean);
