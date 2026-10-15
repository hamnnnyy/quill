// Run: node --experimental-strip-types lib/snbt.check.ts
import assert from "node:assert";
import { parseSnbt, questFiles, snbt } from "./snbt.ts";
import type { Chapter } from "./types.ts";

assert.equal(snbt({ b: "x\"y", a: [] }), '{\n\ta: [ ]\n\tb: "x\\"y"\n}');

const chapter: Chapter = {
  id: "1111111111111111",
  filename: "quill_tacz",
  title: "총기",
  subtitle: "총을 만들어요",
  icon: "tacz:ak47",
  quests: [
    {
      id: "2222222222222222", key: "tacz:ak47", item: "tacz:modern_kinetic_gun", nbt: { GunId: "tacz:ak47" },
      count: 1, title: "AKM", description: ["첫 소총"], x: 2, y: -0.75, deps: ["3333333333333333"], xp: 50,
      rewardItem: "minecraft:iron_ingot", rewardCount: 4,
    },
  ],
};

const old = questFiles([chapter], "1.20.1", { newBook: true, locale: "ko_kr" });
const ch = old["config/ftbquests/quests/chapters/quill_tacz.snbt"];
assert.ok(old["config/ftbquests/quests/data.snbt"].includes("version: 13"));
assert.ok(ch.includes('title: "AKM"'));
assert.ok(ch.includes('item: {\n\t\t\t\t\t\tCount: 1b\n\t\t\t\t\t\tid: "tacz:modern_kinetic_gun"\n\t\t\t\t\t\ttag: {\n\t\t\t\t\t\t\tGunId: "tacz:ak47"'));
assert.ok(ch.includes("match_nbt: true"));
assert.ok(ch.includes("x: 2.0d") && ch.includes("y: -0.75d"));
assert.ok(ch.includes('item: "minecraft:iron_ingot"') && ch.includes("count: 4"));
assert.ok(ch.includes('dependencies: [\n\t\t\t\t"3333333333333333"'));
assert.ok(!Object.keys(old).some((k) => k.includes("/lang/")));

const neu = questFiles([chapter], "1.21.1", { newBook: false, locale: "ko_kr" });
assert.equal(neu["config/ftbquests/quests/data.snbt"], undefined);
const ch2 = neu["config/ftbquests/quests/chapters/quill_tacz.snbt"];
assert.ok(!ch2.includes("AKM"), "1.21 keeps text out of chapter files");
assert.ok(ch2.includes('"minecraft:custom_data": {') && ch2.includes('match_components: "strict"'));
const lang = neu["config/ftbquests/quests/lang/ko_kr.snbt"];
assert.ok(lang.includes('quest.2222222222222222.title: "AKM"'));
assert.ok(lang.includes('quest.2222222222222222.quest_desc: [\n\t\t"첫 소총"'));
assert.equal(neu["config/ftbquests/quests/lang/en_us.snbt"], lang);
// round trip: what we write, we can read back
const back = parseSnbt(ch) as { quests: { x: number; tasks: { item: { id: string; Count: number; tag: { GunId: string } } }[] }[] };
assert.equal(back.quests[0].x, 2);
assert.equal(back.quests[0].tasks[0].item.tag.GunId, "tacz:ak47");
assert.equal(back.quests[0].tasks[0].item.Count, 1);
// FTB's own style: commas, typed arrays, single quotes
assert.deepEqual(parseSnbt("{a: [I; 1, 2], 'b c': 1.5d, d: true, e: stone}"), { a: [1, 2], "b c": 1.5, d: true, e: "stone" });
console.log("snbt ok");
