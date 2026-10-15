// Run: node --experimental-strip-types lib/demo.check.ts
import assert from "node:assert";
import { demo } from "./demo.ts";

const { chapter } = demo();
assert.equal(chapter.quests.length, 15, "every demo quest has a recipe node");
const byKey = new Map(chapter.quests.map((q) => [q.key, q]));
const ids = (key: string) => byKey.get(key)!.deps.map((d) => chapter.quests.find((q) => q.id === d)!.key);
assert.ok(ids("minecraft:iron_pickaxe").length > 0);
assert.ok(ids("minecraft:netherite_pickaxe").includes("minecraft:diamond_pickaxe"));
assert.equal(byKey.get("minecraft:crafting_table")!.deps.length, 0);
console.log("demo ok");
