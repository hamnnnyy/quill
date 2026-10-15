// Run: node --experimental-strip-types lib/conditions.check.ts
import assert from "node:assert";
import { conditionsMet } from "./conditions.ts";

const mods = new Set(["create"]);
const items = new Set(["create:raw_zinc", "create:crushed_raw_uranium", "minecraft:raw_iron"]);
const notEmpty = (tag: string) => ({ conditions: [{ type: "forge:not", value: { type: "forge:tag_empty", tag } }] });
assert.equal(conditionsMet({ conditions: [{ type: "forge:mod_loaded", modid: "ic2" }] }, mods, items), false);
assert.equal(conditionsMet({ conditions: [{ type: "forge:mod_loaded", modid: "create" }] }, mods, items), true);
assert.equal(conditionsMet(notEmpty("forge:raw_materials/uranium"), mods, items), false, "crushed_raw_uranium alone isn't uranium");
assert.equal(conditionsMet(notEmpty("forge:raw_materials/zinc"), mods, items), true);
assert.equal(conditionsMet(notEmpty("forge:raw_materials/iron"), mods, items), true);
assert.equal(conditionsMet({ "neoforge:conditions": [{ type: "neoforge:mod_loaded", modid: "mekanism" }] }, mods, items), false);
assert.equal(conditionsMet({ "fabric:load_conditions": [{ condition: "fabric:all_mods_loaded", values: ["create"] }] }, mods, items), true);
assert.equal(conditionsMet({ type: "x" }, mods, items), true);
console.log("conditions ok");
