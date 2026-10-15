// Run: node --experimental-strip-types lib/pipeline.check.ts
import assert from "node:assert";
import { applyKubejs, localKubejs } from "./pipeline.ts";

const script = `ServerEvents.recipes(event => {
  event.remove({ output: 'tacz:ak47' })
  event.remove({id: "minecraft:iron_block"})
  event.remove({ mod: \`create\` })
  event.shaped('minecraft:stick', ['A'], { A: '#minecraft:planks' })
})`;
const local = localKubejs([{ text: script }]);
assert.deepEqual(local.removed_outputs, ["tacz:ak47"]);
assert.deepEqual(local.removed_ids, ["minecraft:iron_block"]);
assert.deepEqual(local.removed_mods, ["create"]);

const r = (result: string, source: string, variant = "") => ({ result, result_variant: variant, result_count: 1, station: "x", ingredients: [], source });
const known = new Set<string>();
const out = applyKubejs(
  {
    tacz: [r("tacz:modern_kinetic_gun", "a", "tacz:ak47"), r("tacz:gun_smith_table", "b")],
    minecraft: [r("minecraft:iron_block", "data/minecraft/recipes/iron_block.json")],
  },
  { ...local, added: [{ result: "tacz:custom_gun", result_count: 1, station: "crafting_table", ingredients: [], source: "s.js" }] },
  known,
);
assert.deepEqual(out.tacz.map((x) => x.result_variant || x.result), ["tacz:gun_smith_table", "tacz:custom_gun"]);
assert.deepEqual(out.minecraft, []);
assert.ok(known.has("tacz:custom_gun"));
console.log("pipeline ok");
