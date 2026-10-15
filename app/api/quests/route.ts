import { AiError, generate, handle } from "@/lib/gemini";
import { languageOf, SUBTITLE_RULES } from "@/lib/prompts";

export const maxDuration = 300;

export type QuestsRequest = {
  mod: { id: string; name: string };
  lang: "ko" | "en";
  maxQuests: number;
  reward: "low" | "normal" | "high";
  candidates: { key: string; name: string; depth: number; madeFrom: string[]; station: string }[];
  rewardPool: { id: string; name: string }[];
};

export type QuestsResponse = {
  chapter_title: string;
  chapter_subtitle: string;
  quests: { key: string; title: string; subtitle: string; description: string[]; xp: number; reward_item: string; reward_count: number }[];
};

const schema = {
  type: "object",
  properties: {
    chapter_title: { type: "string" },
    chapter_subtitle: { type: "string", description: "one sentence about what this chapter covers" },
    quests: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string", description: "a candidate key, copied exactly" },
          title: { type: "string" },
          subtitle: { type: "string", description: "one punchy hook line, not an explanation" },
          description: { type: "array", items: { type: "string" }, description: "1-3 short lines" },
          xp: { type: "integer" },
          reward_item: { type: "string", description: "an id from reward_pool, or empty" },
          reward_count: { type: "integer" },
        },
        required: ["key", "title", "subtitle", "description", "xp", "reward_item", "reward_count"],
      },
    },
  },
  required: ["chapter_title", "chapter_subtitle", "quests"],
};

const XP = { low: "5-40", normal: "20-150", high: "50-400" };

export function POST(req: Request) {
  return handle(req, 400_000, async (body, key) => {
    const r = body as QuestsRequest;
    if (!Array.isArray(r?.candidates) || !r.candidates.length) throw new AiError("퀘스트로 만들 아이템이 없어요.", 400);
    const max = Math.min(Math.max(Number(r.maxQuests) || 20, 3), 80);
    const language = languageOf(r.lang);

    const prompt = `You design an FTB Quests chapter for the Minecraft mod "${r.mod.name}" in a modpack.
Pick at most ${max} candidates that make a good progression: stations and machines, key intermediate parts,
and the items players actually want. Skip trivial variants (slabs, stairs, colors, every attachment of one kind).
Always include the earliest step players need to start this mod.
Write like a game, not a manual. Players skim; the first line has to make them want the item.
For each picked quest write, in ${language}:
- title: short, names the item or the goal
${SUBTITLE_RULES}
- description: rotate the voice from quest to quest, never two in a row the same:
  story (a scrap of lore, someone who used it), direct challenge to the player, dry humor, plain field tip.
  Vary the length too: some quests get one line, some three. Not every quest needs a how-to line;
  when there is one, keep it short and last.
  Keep a thread through the chapter: early quests feel like a beginning, the deepest ones like a payoff.
- xp: ${XP[r.reward] ?? XP.normal}, more for deeper items
- reward_item/reward_count: optionally a useful material from reward_pool for the next step, else "" and 0
Also write chapter_title and chapter_subtitle in ${language}; the subtitle sets the chapter's story in one line.
Copy keys exactly. Never invent keys or reward ids.

candidates (depth = crafting steps from raw materials):
${JSON.stringify(r.candidates)}

reward_pool:
${JSON.stringify(r.rewardPool)}`;

    const res = await generate(key, {
      contents: prompt,
      config: { responseMimeType: "application/json", responseJsonSchema: schema, maxOutputTokens: 32768 },
    });
    const out = JSON.parse(res.text ?? "{}") as QuestsResponse;

    // Gemini output is untrusted: keep only real candidates and real reward ids.
    const keys = new Set(r.candidates.map((c) => c.key));
    const pool = new Set(r.rewardPool.map((p) => p.id));
    const seen = new Set<string>();
    out.quests = (out.quests ?? [])
      .filter((q) => keys.has(q.key) && !seen.has(q.key) && seen.add(q.key))
      .slice(0, max)
      .map((q) => ({
        ...q,
        xp: Math.max(0, Math.min(Number(q.xp) || 0, 10_000)),
        reward_item: pool.has(q.reward_item) ? q.reward_item : "",
        reward_count: pool.has(q.reward_item) ? Math.max(1, Math.min(Number(q.reward_count) || 1, 64)) : 0,
      }));
    return out;
  });
}
