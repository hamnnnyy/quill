// Run: node --experimental-strip-types lib/convert.check.ts
import assert from "node:assert";
import { convert } from "./convert.ts";

const table = convert(
  {
    type: "minecraft:crafting_shaped",
    result: { item: "tacz:gun_smith_table" },
    pattern: ["LLL", "IBI", "I I"],
    key: { L: { tag: "minecraft:logs" }, I: { tag: "forge:ingots/iron" }, B: { item: "minecraft:iron_block" } },
  },
  "a",
);
assert.deepEqual(table?.ingredients, [
  { id: "#minecraft:logs", count: 3 },
  { id: "#forge:ingots/iron", count: 4 },
  { id: "minecraft:iron_block", count: 1 },
]);
assert.equal(table?.station, "crafting_table");

const powder = convert(
  {
    type: "minecraft:crafting_shapeless",
    result: { item: "minecraft:gunpowder", count: 3 },
    ingredients: [{ item: "minecraft:flint" }, { item: "minecraft:sugar" }, { item: "minecraft:sugar" }],
  },
  "b",
);
assert.equal(powder?.result_count, 3);
assert.deepEqual(powder?.ingredients, [
  { id: "minecraft:flint", count: 1 },
  { id: "minecraft:sugar", count: 2 },
]);

// 1.21 style: string ingredients and {id} results
const smelt = convert({ type: "minecraft:smelting", ingredient: "#c:raw_materials/iron", result: { id: "minecraft:iron_ingot" } }, "c");
assert.deepEqual(smelt?.ingredients, [{ id: "#c:raw_materials/iron", count: 1 }]);
assert.equal(smelt?.station, "furnace");

const gun = convert(
  {
    type: "tacz:gun_smith_table_crafting",
    materials: [{ item: { tag: "forge:ingots/iron" }, count: 38 }],
    result: { type: "gun", id: "tacz:ak47" },
  },
  "d",
);
assert.equal(gun?.result, "tacz:modern_kinetic_gun");
assert.equal(gun?.result_variant, "tacz:ak47");
assert.deepEqual(gun?.nbt, { GunId: "tacz:ak47" });

const painting = convert(
  {
    type: "tacz:gun_smith_table_crafting",
    materials: [{ item: { tag: "minecraft:wool" }, count: 1 }],
    result: { type: "custom", item: { item: "minecraft:painting", nbt: {} } },
  },
  "g",
);
assert.equal(painting?.result, "minecraft:painting");

assert.equal(convert({ type: "create:mixing", ingredients: [], results: [] }, "e"), null);
assert.equal(convert({ type: "minecraft:crafting_shapeless", ingredients: [{ type: "forge:nbt" }], result: "x" }, "f"), null);
console.log("convert ok");
