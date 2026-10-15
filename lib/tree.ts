import type { Chapter, Quest, Recipe } from "./types";

export type Node = {
  key: string; // result_variant || result
  item: string;
  nbt?: Record<string, string>;
  count: number;
  station: string;
  deps: string[]; // node keys or tags this is made from, station included
  depth: number; // 0 = made only from things outside the tree
};

const BASIC_STATIONS = new Set(["crafting_table", "furnace", "blast_furnace", "smoker", "campfire", "stonecutter", "smithing_table"]);
export const nodeKey = (r: Recipe) => r.result_variant || r.result;

// One node per craftable item. Depth = longest chain of crafting steps below it.
export function buildTree(recipes: Recipe[]): Map<string, Node> {
  const byKey = new Map<string, Recipe[]>();
  for (const r of recipes) byKey.set(nodeKey(r), [...(byKey.get(nodeKey(r)) ?? []), r]);

  const depsOf = (r: Recipe) => {
    const deps = r.ingredients.map((i) => i.id);
    if (r.station && !BASIC_STATIONS.has(r.station.replace(/^minecraft:/, ""))) deps.push(r.station);
    return [...new Set(deps)].filter((d) => d !== nodeKey(r));
  };

  const nodes = new Map<string, Node>();
  const visiting = new Set<string>();
  const depth = (key: string): number => {
    const done = nodes.get(key);
    if (done) return done.depth;
    const options = byKey.get(key);
    if (!options || visiting.has(key)) return 0; // raw material, or a cycle (ingot <-> block): cut it
    visiting.add(key);
    // Several recipes for one item: keep the shallowest, that's the one players will find first.
    let best: { r: Recipe; deps: string[]; d: number } | undefined;
    for (const r of options) {
      const deps = depsOf(r);
      const d = deps.length ? 1 + Math.max(...deps.map(depth)) : 1;
      if (!best || d < best.d) best = { r, deps, d };
    }
    visiting.delete(key);
    const { r, deps, d } = best!;
    nodes.set(key, { key, item: r.result, nbt: r.nbt, count: r.result_count, station: r.station, deps, depth: d });
    return d;
  };
  for (const key of byKey.keys()) depth(key);
  return nodes;
}

// For each picked key, the nearest picked ancestors: those become quest dependencies.
export function pickedDeps(tree: Map<string, Node>, picked: Set<string>, key: string): string[] {
  const out = new Set<string>();
  const seen = new Set<string>([key]);
  const stack = [...(tree.get(key)?.deps ?? [])];
  while (stack.length) {
    const k = stack.pop()!;
    if (seen.has(k)) continue;
    seen.add(k);
    if (picked.has(k)) out.add(k);
    else stack.push(...(tree.get(k)?.deps ?? []));
  }
  return [...out];
}

// Without AI: stations and items many others need, then the deepest ones.
// Round-robin over base items so 25 picks aren't all ammo when guns, ammo and attachments tie.
export function fallbackPick(tree: Map<string, Node>, max: number): string[] {
  const usedBy = new Map<string, number>();
  for (const n of tree.values()) for (const d of n.deps) usedBy.set(d, (usedBy.get(d) ?? 0) + 1);
  const ranked = [...tree.values()].sort((a, b) => (usedBy.get(b.key) ?? 0) - (usedBy.get(a.key) ?? 0) || b.depth - a.depth);
  const groups = new Map<string, Node[]>();
  for (const n of ranked) groups.set(n.item, [...(groups.get(n.item) ?? []), n]);
  const singles = [...groups.values()].filter((g) => g.length === 1).flat();
  const variants = [...groups.values()].filter((g) => g.length > 1);
  const out = singles.filter((n) => (usedBy.get(n.key) ?? 0) > 0); // stations and shared parts first
  for (let i = 0; out.length < max && variants.some((g) => g[i]); i++) for (const g of variants) if (g[i]) out.push(g[i]);
  for (const n of ranked) if (out.length < max && !out.includes(n)) out.push(n);
  return out.slice(0, max).map((n) => n.key);
}

export function newId() {
  const b = crypto.getRandomValues(new Uint8Array(8));
  b[0] |= 0x10; // never all zeros
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
}

const GAP_X = 2;
const GAP_Y = 1.5;
const PER_COLUMN = 6;

// Columns by depth (left to right), rows centered on y = 0. Big depth groups wrap into extra columns.
export function layout(quests: Quest[], tree: Map<string, Node>) {
  const depths = [...new Set(quests.map((q) => tree.get(q.key)?.depth ?? 0))].sort((a, b) => a - b);
  let col = 0;
  for (const d of depths) {
    const group = quests.filter((q) => (tree.get(q.key)?.depth ?? 0) === d);
    for (let start = 0; start < group.length; start += PER_COLUMN, col++) {
      const column = group.slice(start, start + PER_COLUMN);
      column.forEach((q, i) => {
        q.x = col * GAP_X;
        q.y = (i - (column.length - 1) / 2) * GAP_Y;
      });
    }
  }
}

export type QuestText = { key: string; title: string; subtitle?: string; description: string[]; xp: number; rewardItem?: string; rewardCount?: number };

export function buildChapter(
  mod: { id: string; name: string },
  tree: Map<string, Node>,
  texts: QuestText[],
  chapterText: { title: string; subtitle: string },
): Chapter {
  const picked = new Set(texts.map((t) => t.key));
  const idOf = new Map(texts.map((t) => [t.key, newId()]));
  const quests: Quest[] = texts.map((t) => {
    const n = tree.get(t.key)!;
    return {
      id: idOf.get(t.key)!,
      key: t.key,
      item: n.item,
      nbt: n.nbt,
      count: 1,
      title: t.title,
      subtitle: t.subtitle,
      description: t.description,
      x: 0,
      y: 0,
      deps: pickedDeps(tree, picked, t.key).map((k) => idOf.get(k)!),
      xp: t.xp,
      rewardItem: t.rewardItem,
      rewardCount: t.rewardCount,
    };
  });
  layout(quests, tree);
  const first = [...quests].sort((a, b) => a.x - b.x)[0];
  return {
    id: newId(),
    filename: `quill_${mod.id.replace(/[^a-z0-9_]/g, "_")}`,
    title: chapterText.title || mod.name,
    subtitle: chapterText.subtitle,
    icon: first?.key ?? "minecraft:book",
    quests,
  };
}
