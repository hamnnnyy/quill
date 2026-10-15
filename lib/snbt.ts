import type { Chapter, McVersion, Quest, Task } from "./types";
import { newId } from "./tree.ts";

// Writes FTB Quests files. Layout and field names checked against FTBTeam/FTB-Quests source:
//   1.20.1/main: BaseQuestFile.writeDataFull, Quest/Chapter/ItemTask/ItemReward/XPReward.writeData
//   1.21.1/main: same, but titles and descriptions live in lang/<locale>.snbt (TranslationManager)

// Typed SNBT numbers: 1.5d, 38L, 1b. Plain JS numbers are written as ints.
class Num {
  v: number;
  suffix: "d" | "L" | "b";
  constructor(v: number, suffix: "d" | "L" | "b") {
    this.v = v;
    this.suffix = suffix;
  }
}
const d = (v: number) => new Num(v, "d");
const L = (v: number) => new Num(v, "L");
const b = (v: number) => new Num(v, "b");

type V = string | number | boolean | Num | V[] | { [k: string]: V | undefined };

const quote = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const keyOf = (k: string) => (/^[A-Za-z0-9._+-]+$/.test(k) ? k : quote(k));

export function snbt(v: V, indent = ""): string {
  if (v instanceof Num) return `${Number.isInteger(v.v) && v.suffix === "d" ? v.v.toFixed(1) : v.v}${v.suffix}`;
  if (typeof v === "string") return quote(v);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  const inner = indent + "\t";
  if (Array.isArray(v)) {
    if (!v.length) return "[ ]";
    return `[\n${v.map((x) => inner + snbt(x, inner)).join("\n")}\n${indent}]`;
  }
  const entries = Object.entries(v).filter(([, x]) => x !== undefined) as [string, V][];
  entries.sort(([a], [b]) => a.localeCompare(b)); // FTB sorts keys on write too
  return `{\n${entries.map(([k, x]) => `${inner}${keyOf(k)}: ${snbt(x, inner)}`).join("\n")}\n${indent}}`;
}

// namespace:path; a hand-typed reward that isn't one is left out instead of breaking the quest file
export const ITEM_ID = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;

// A hand-typed id FTB can't parse would break the whole chapter file, so a bad task falls back to the item task.
export function validTask(t: Task) {
  const id = (s: string, tag = false) => ITEM_ID.test(tag ? s.replace(/^#/, "") : s);
  if (t.type === "kill") return id(t.entity) && t.value >= 1;
  if (t.type === "dimension") return id(t.dimension);
  if (t.type === "structure") return id(t.structure, true);
  if (t.type === "biome") return id(t.biome, true);
  return true;
}

function item(id: string, nbt: Record<string, string> | undefined, version: McVersion): V {
  if (version === "1.21.1") return nbt ? { id, count: 1, components: { "minecraft:custom_data": nbt } } : { id, count: 1 };
  return nbt ? { id, Count: b(1), tag: nbt } : id; // ftbquests NBTUtils.write: plain count-1 items become a bare id string
}

function quest(q: Quest, version: McVersion): V {
  const legacyText = version === "1.20.1";
  const rewards: V[] = [];
  if (q.xp > 0) rewards.push({ id: newId(), type: "xp", xp: Math.round(q.xp) });
  if (q.rewardItem && ITEM_ID.test(q.rewardItem))
    rewards.push({ id: newId(), type: "item", item: item(q.rewardItem, undefined, version), count: q.rewardCount && q.rewardCount > 1 ? q.rewardCount : undefined });
  return {
    id: q.id,
    x: d(q.x),
    y: d(q.y),
    title: legacyText ? q.title : undefined,
    subtitle: legacyText && q.subtitle ? q.subtitle : undefined,
    description: legacyText && q.description.length ? q.description : undefined,
    dependencies: q.deps.length ? q.deps : undefined,
    tasks: [
      q.task && validTask(q.task)
        ? { id: newId(), ...q.task, ...(q.task.type === "kill" ? { value: L(Math.max(1, q.task.value)) } : {}) }
        : {
            id: newId(),
            type: "item",
            item: item(q.item, q.nbt, version),
            count: q.count > 1 ? L(q.count) : undefined,
            // 1.20.1 only compares NBT when told to; without this every gun would complete the AK quest
            match_nbt: q.nbt && legacyText ? true : undefined,
            match_components: q.nbt && !legacyText ? "strict" : undefined,
          },
    ],
    rewards: rewards.length ? rewards : undefined,
  };
}

export type QuestFiles = Record<string, string>;

// Paths are relative to the instance folder.
export function questFiles(chapters: Chapter[], version: McVersion, opts: { newBook: boolean; locale: string }): QuestFiles {
  const root = "config/ftbquests/quests/";
  const files: QuestFiles = {};
  const legacyText = version === "1.20.1";
  const lang: Record<string, V> = {};

  // A fresh book needs data.snbt; adding to an existing pack must not overwrite theirs.
  if (opts.newBook) files[root + "data.snbt"] = snbt({ version: 13, default_quest_shape: "", default_reward_team: false }) + "\n";

  chapters.forEach((c, i) => {
    files[`${root}chapters/${c.filename}.snbt`] =
      snbt({
        id: c.id,
        filename: c.filename,
        group: "",
        order_index: 1000 + i, // after the pack's own chapters
        icon: item(iconItem(c), iconNbt(c), version),
        title: legacyText ? c.title : undefined,
        subtitle: legacyText && c.subtitle ? [c.subtitle] : undefined,
        default_quest_shape: "",
        default_hide_dependency_lines: false,
        quest_links: [],
        quests: c.quests.map((q) => quest(q, version)),
      }) + "\n";
    if (!legacyText) {
      lang[`chapter.${c.id}.title`] = c.title;
      if (c.subtitle) lang[`chapter.${c.id}.chapter_subtitle`] = [c.subtitle];
      for (const q of c.quests) {
        lang[`quest.${q.id}.title`] = q.title;
        if (q.subtitle) lang[`quest.${q.id}.quest_subtitle`] = q.subtitle;
        if (q.description.length) lang[`quest.${q.id}.quest_desc`] = q.description;
      }
    }
  });

  if (!legacyText) {
    const table = snbt(lang) + "\n";
    // en_us is FTB's fallback locale, so players in any language see the text.
    files[`${root}lang/en_us.snbt`] = table;
    if (opts.locale !== "en_us") files[`${root}lang/${opts.locale}.snbt`] = table;
  }
  return files;
}

const iconQuest = (c: Chapter) => c.quests.find((q) => q.key === c.icon);
const iconItem = (c: Chapter) => iconQuest(c)?.item ?? c.icon;
const iconNbt = (c: Chapter) => iconQuest(c)?.nbt;

// Tolerant SNBT reader for existing FTB Quests files: commas optional, keys bare or quoted,
// numbers with type suffixes (1.5d, 38L, 1b), typed arrays ([I; 1, 2]).
export function parseSnbt(text: string): unknown {
  let i = 0;
  const ws = () => {
    while (i < text.length && /[\s,]/.test(text[i])) i++;
  };
  const str = () => {
    const q = text[i++];
    let out = "";
    while (i < text.length && text[i] !== q) {
      if (text[i] === "\\") i++;
      out += text[i++];
    }
    i++;
    return out;
  };
  const bare = () => {
    const start = i;
    while (i < text.length && /[A-Za-z0-9._+\-]/.test(text[i])) i++;
    if (start === i) throw new Error(`SNBT: unexpected "${text[i]}" at ${i}`);
    return text.slice(start, i);
  };
  const value = (): unknown => {
    ws();
    const c = text[i];
    if (c === "{") {
      i++;
      const obj: Record<string, unknown> = {};
      for (ws(); text[i] !== "}"; ws()) {
        const key = text[i] === '"' || text[i] === "'" ? str() : bare();
        ws();
        if (text[i++] !== ":") throw new Error(`SNBT: expected ":" after ${key}`);
        obj[key] = value();
      }
      i++;
      return obj;
    }
    if (c === "[") {
      i++;
      if (/^[BIL];/.test(text.slice(i, i + 2))) i += 2;
      const arr: unknown[] = [];
      for (ws(); text[i] !== "]"; ws()) arr.push(value());
      i++;
      return arr;
    }
    if (c === '"' || c === "'") return str();
    const token = bare();
    if (token === "true" || token === "false") return token === "true";
    const num = token.match(/^(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)[bBsSlLfFdD]?$/);
    return num ? Number(num[1]) : token;
  };
  return value();
}
