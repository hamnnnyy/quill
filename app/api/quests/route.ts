import { AiError, generate, handle } from "@/lib/gemini";

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
  quests: { key: string; title: string; description: string[]; xp: number; reward_item: string; reward_count: number }[];
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
          description: { type: "array", items: { type: "string" }, description: "1-3 short lines" },
          xp: { type: "integer" },
          reward_item: { type: "string", description: "an id from reward_pool, or empty" },
          reward_count: { type: "integer" },
        },
        required: ["key", "title", "description", "xp", "reward_item", "reward_count"],
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
    const language = r.lang === "en" ? "English" : "Korean (casual, friendly 해요체)";

    const prompt = `You design an FTB Quests chapter for the Minecraft mod "${r.mod.name}" in a modpack.
Pick at most ${max} candidates that make a good progression: stations and machines, key intermediate parts,
and the items players actually want. Skip trivial variants (slabs, stairs, colors, every attachment of one kind).
Always include the earliest step players need to start this mod.
For each picked quest write, in ${language}:
- title: short, names the item or the goal
- description: 1-3 short lines on what it is for and how to make it (mention the station when it matters)
- xp: ${XP[r.reward] ?? XP.normal}, more for deeper items
- reward_item/reward_count: optionally a useful material from reward_pool for the next step, else "" and 0
Also write chapter_title and chapter_subtitle in ${language}.
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
