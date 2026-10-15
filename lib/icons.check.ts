// Run: node --experimental-strip-types lib/icons.check.ts
import assert from "node:assert";
import { iconFor } from "./icons.ts";

const icons = new Map(
  ["iron_ingot", "diamond", "iron_block", "oak_log", "oak_planks", "white_wool", "lapis_lazuli", "redstone"].map(
    (n) => [`minecraft:${n}`, n] as [string, string],
  ),
);
icons.set("tacz:ak47", "ak47");

assert.equal(iconFor("minecraft:redstone", icons), "redstone");
assert.equal(iconFor("tacz:ak47", icons), "ak47");
assert.equal(iconFor("#forge:ingots/iron", icons), "iron_ingot");
assert.equal(iconFor("#forge:gems/diamond", icons), "diamond");
assert.equal(iconFor("#forge:gems/lapis", icons), "lapis_lazuli");
assert.equal(iconFor("#forge:storage_blocks/iron", icons), "iron_block");
assert.equal(iconFor("#minecraft:logs", icons), "oak_log");
assert.equal(iconFor("#minecraft:planks", icons), "oak_planks");
assert.equal(iconFor("#minecraft:wool", icons), "white_wool");
assert.equal(iconFor("#forge:dusts/glowstone", icons), undefined);
console.log("icons ok");
