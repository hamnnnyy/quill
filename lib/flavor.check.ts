// Run: node --experimental-strip-types lib/flavor.check.ts
import assert from "node:assert";
import { fallbackText } from "./flavor.ts";
import { buildTree } from "./tree.ts";
import type { Recipe } from "./types.ts";

const r = (result: string, ings: string[], station = "crafting_table", variant = ""): Recipe => ({
  result, result_variant: variant, result_count: 1, station, ingredients: ings.map((id) => ({ id, count: 1 })), source: result,
});
const tree = buildTree([
  r("tacz:gun_smith_table", ["minecraft:iron_block"]),
  r("tacz:modern_kinetic_gun", ["minecraft:iron_ingot"], "tacz:gun_smith_table", "tacz:ak47"),
  r("tacz:ammo", ["minecraft:gunpowder"], "tacz:gun_smith_table", "tacz:762x39"),
  r("tacz:scope", ["tacz:ak47"], "tacz:gun_smith_table"),
  r("tacz:grip", ["minecraft:iron_ingot"], "tacz:gun_smith_table"),
]);
tree.get("tacz:ak47")!.nbt = { GunId: "tacz:ak47" };
const keys = ["tacz:gun_smith_table", "tacz:ak47", "tacz:762x39", "tacz:scope", "tacz:grip"];
const out = fallbackText(keys, tree, (id) => id, "ko");
assert.ok(["모든 것은 여기서 시작된다", "작업대 하나가 세상을 바꾼다", "이걸 놓는 순간, 새 장이 열린다", "장인의 자리는 비워 두지 않는 법"].includes(out[0].subtitle));
assert.ok(out[1].subtitle.length > 0);
assert.equal(new Set(out.map((t) => t.subtitle)).size, out.length, "no repeated hooks in a chapter");
assert.notDeepEqual(out[0].description, out[1].description);
assert.deepEqual(out[3].description, ["tacz:gun_smith_table에서 만들어요."]); // 4th quest is the plain tip
assert.deepEqual(fallbackText(keys, tree, (id) => id, "ko"), out, "stable across runs");
assert.match(fallbackText(keys, tree, (id) => id, "en")[0].subtitle, /^[A-Z]/);
if (process.env.SHOW) console.log(out);
console.log("flavor ok");
