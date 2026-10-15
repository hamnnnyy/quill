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
      count: 1, title: "AKM", subtitle: "한 방이면 충분해", description: ["첫 소총"], x: 2, y: -0.75, deps: ["3333333333333333"], xp: 50,
      rewardItem: "minecraft:iron_ingot", rewardCount: 4,
    },
  ],
};

const old = questFiles([chapter], "1.20.1", { newBook: true, locale: "ko_kr" });
const ch = old["config/ftbquests/quests/chapters/quill_tacz.snbt"];
assert.ok(old["config/ftbquests/quests/data.snbt"].includes("version: 13"));
assert.ok(ch.includes('title: "AKM"'));
assert.ok(ch.includes('subtitle: "한 방이면 충분해"'));
assert.ok(ch.includes('item: {\n\t\t\t\t\t\tCount: 1b\n\t\t\t\t\t\tid: "tacz:modern_kinetic_gun"\n\t\t\t\t\t\ttag: {\n\t\t\t\t\t\t\tGunId: "tacz:ak47"'));
assert.ok(ch.includes("match_nbt: true"));
assert.ok(ch.includes("x: 2.0d") && ch.includes("y: -0.75d"));
assert.ok(ch.includes('item: "minecraft:iron_ingot"') && ch.includes("count: 4"));
assert.ok(!Object.keys(old).some((k) => k.includes("/lang/")));

const neu = questFiles([chapter], "1.21.1", { newBook: false, locale: "ko_kr" });
assert.equal(neu["config/ftbquests/quests/data.snbt"], undefined);
const ch2 = neu["config/ftbquests/quests/chapters/quill_tacz.snbt"];
assert.ok(!ch2.includes("AKM"), "1.21 keeps text out of chapter files");
assert.ok(ch2.includes('"minecraft:custom_data": {') && ch2.includes('match_components: "strict"'));
const lang = neu["config/ftbquests/quests/lang/ko_kr.snbt"];
assert.ok(lang.includes('quest.2222222222222222.title: "AKM"'));
assert.ok(lang.includes('quest.2222222222222222.quest_subtitle: "한 방이면 충분해"'));
assert.ok(lang.includes('quest.2222222222222222.quest_desc: [\n\t\t"첫 소총"'));
assert.equal(neu["config/ftbquests/quests/lang/en_us.snbt"], lang);
// a hand-typed reward that isn't an item id is dropped, the xp reward stays
const typo = questFiles([{ ...chapter, quests: [{ ...chapter.quests[0], rewardItem: "다이아몬드" }] }], "1.20.1", { newBook: false, locale: "ko_kr" });
const typoCh = typo["config/ftbquests/quests/chapters/quill_tacz.snbt"];
assert.ok(!typoCh.includes("다이아몬드") && typoCh.includes('type: "xp"'));
// other task types: FTB field names, value as a long
const kill = questFiles([{ ...chapter, quests: [{ ...chapter.quests[0], task: { type: "kill", entity: "minecraft:zombie", value: 10 } }] }], "1.20.1", { newBook: false, locale: "ko_kr" });
const killCh = kill["config/ftbquests/quests/chapters/quill_tacz.snbt"];
assert.ok(killCh.includes('type: "kill"') && killCh.includes('entity: "minecraft:zombie"') && killCh.includes("value: 10L"));
assert.ok(!killCh.includes("match_nbt"), "no item task left behind");
const dim = questFiles([{ ...chapter, quests: [{ ...chapter.quests[0], task: { type: "dimension", dimension: "minecraft:the_nether" } }] }], "1.21.1", { newBook: false, locale: "ko_kr" });
assert.ok(dim["config/ftbquests/quests/chapters/quill_tacz.snbt"].includes('dimension: "minecraft:the_nether"'));
const bad = questFiles([{ ...chapter, quests: [{ ...chapter.quests[0], task: { type: "kill", entity: "좀비", value: 3 } }] }], "1.20.1", { newBook: false, locale: "ko_kr" });
assert.ok(bad["config/ftbquests/quests/chapters/quill_tacz.snbt"].includes("match_nbt"), "bad kill task falls back to the item task");
// deps across chapters survive, deps on deleted quests don't
const other: Chapter = { ...chapter, id: "4444444444444444", filename: "quill_other", quests: [{ ...chapter.quests[0], id: "3333333333333333", deps: [] }] };
const cross = questFiles([chapter, other], "1.20.1", { newBook: false, locale: "ko_kr" });
assert.ok(cross["config/ftbquests/quests/chapters/quill_tacz.snbt"].includes('dependencies: [\n\t\t\t\t"3333333333333333"'));
const orphan = questFiles([{ ...chapter, quests: [{ ...chapter.quests[0], deps: ["9999999999999999"] }] }], "1.20.1", { newBook: false, locale: "ko_kr" });
assert.ok(!orphan["config/ftbquests/quests/chapters/quill_tacz.snbt"].includes("dependencies"));
// round trip: what we write, we can read back
const back = parseSnbt(ch) as { quests: { x: number; tasks: { item: { id: string; Count: number; tag: { GunId: string } } }[] }[] };
assert.equal(back.quests[0].x, 2);
assert.equal(back.quests[0].tasks[0].item.tag.GunId, "tacz:ak47");
assert.equal(back.quests[0].tasks[0].item.Count, 1);
// FTB's own style: commas, typed arrays, single quotes
assert.deepEqual(parseSnbt("{a: [I; 1, 2], 'b c': 1.5d, d: true, e: stone}"), { a: [1, 2], "b c": 1.5, d: true, e: "stone" });
console.log("snbt ok");
