// Run: node --experimental-strip-types lib/tree.check.ts
import assert from "node:assert";
import { buildChapter, buildTree, fallbackPick } from "./tree.ts";
import type { Recipe } from "./types.ts";

const r = (result: string, ings: string[], station = "crafting_table", variant = ""): Recipe => ({
  result,
  result_variant: variant,
  result_count: 1,
  station,
  ingredients: ings.map((id) => ({ id, count: 1 })),
  source: result,
});

const recipes = [
  r("tacz:gun_smith_table", ["#minecraft:logs", "minecraft:iron_block"]),
  r("tacz:modern_kinetic_gun", ["#forge:ingots/iron"], "tacz:gun_smith_table", "tacz:ak47"),
  r("tacz:scope", ["tacz:ak47"], "tacz:gun_smith_table"),
  // cycle: block <-> ingot
  r("minecraft:iron_block", ["minecraft:iron_ingot"]),
  r("minecraft:iron_ingot", ["minecraft:iron_block"]),
];
const tree = buildTree(recipes);
assert.equal(tree.get("tacz:gun_smith_table")!.depth, 3); // logs/raw -> ingot -> block -> table
assert.equal(tree.get("tacz:ak47")!.depth, 4); // station dependency counts
assert.equal(tree.get("tacz:scope")!.depth, 5);
assert.deepEqual(tree.get("tacz:ak47")!.deps, ["#forge:ingots/iron", "tacz:gun_smith_table"]);

// scope skips over unpicked ak47 to reach the table
const ch = buildChapter(
  { id: "tacz", name: "TACZ" },
  tree,
  ["tacz:gun_smith_table", "tacz:scope"].map((key) => ({ key, title: key, description: [], xp: 10 })),
  { title: "", subtitle: "" },
);
const [table, scope] = ch.quests;
assert.deepEqual(scope.deps, [table.id]);
assert.ok(scope.x > table.x);
assert.match(table.id, /^[0-9A-F]{16}$/);
assert.equal(ch.title, "TACZ");
assert.equal(ch.filename, "quill_tacz");

assert.equal(fallbackPick(tree, 1)[0], "tacz:gun_smith_table"); // most depended on
console.log("tree ok");
