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
// Create processing: main output only, fluids dropped, machine as station
const crush = convert({ type: "create:crushing", ingredients: [{ tag: "forge:raw_materials/iron" }], results: [{ item: "create:crushed_raw_iron" }, { chance: 0.75, item: "create:experience_nugget" }] }, "c")!;
assert.equal(crush.result, "create:crushed_raw_iron");
assert.equal(crush.station, "create:crushing_wheel");
assert.deepEqual(crush.ingredients, [{ id: "#forge:raw_materials/iron", count: 1 }]);
const fill = convert({ type: "create:filling", ingredients: [{ item: "create:blaze_cake_base" }, { amount: 250, fluid: "minecraft:lava", nbt: {} }], results: [{ item: "create:blaze_cake" }] }, "f")!;
assert.deepEqual(fill.ingredients, [{ id: "create:blaze_cake_base", count: 1 }]);
const mix = convert({ type: "create:mixing", ingredients: [{ tag: "forge:ingots/copper" }, { tag: "forge:ingots/zinc" }], results: [{ count: 2, item: "create:brass_ingot" }] }, "m")!;
assert.equal(mix.result_count, 2);
const mc = convert({ type: "create:mechanical_crafting", key: { A: { item: "create:andesite_alloy" } }, pattern: ["AA", "AA"], result: { count: 2, item: "create:crushing_wheel" } }, "mc")!;
assert.equal(mc.station, "create:mechanical_crafter");
assert.equal(convert({ type: "create:sequenced_assembly", ingredient: { item: "x" }, results: [] }, "s"), null); // left to AI
console.log("convert ok");
