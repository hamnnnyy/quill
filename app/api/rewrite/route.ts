import { AiError, generateJson, handle } from "@/lib/ai";
import { languageOf, SUBTITLE_RULES } from "@/lib/prompts";

export const maxDuration = 60;

export type RewriteRequest = {
  mod: string;
  lang: "ko" | "en";
  item: { name: string; madeFrom: string[]; station: string };
  goal?: string; // set for non-item tasks: "zombie 10마리 처치"
  current: { title: string; subtitle: string; description: string[] };
  chapter: string[]; // other quest titles, for tone and to avoid repeats
  ask: string; // what the user wants changed, may be empty
};
export type RewriteResponse = { title: string; subtitle: string; description: string[] };

const schema = {
  type: "object",
  properties: {
    title: { type: "string" },
    subtitle: { type: "string" },
    description: { type: "array", items: { type: "string" }, description: "1-3 short lines" },
  },
  required: ["title", "subtitle", "description"],
};

export function POST(req: Request) {
  return handle(req, 20_000, async (body, ai) => {
    const r = body as RewriteRequest;
    if (!r?.item?.name) throw new AiError("다시 쓸 퀘스트가 없어요.", 400);
    const prompt = `Rewrite one FTB Quests quest for the Minecraft mod "${r.mod}", in ${languageOf(r.lang)}.
${r.goal ? `The quest asks the player to: ${r.goal}.` : `The quest asks the player to obtain: ${r.item.name} (made at ${r.item.station} from ${r.item.madeFrom.join(", ") || "basic materials"}).`}
Write like a game, not a manual.
- title: short, names the item or the goal
${SUBTITLE_RULES}
- description: 1-3 short lines; a scrap of story, a challenge, dry humor or a field tip. A how-to line, if any, goes last.
Make it clearly different from the current version, and don't echo lines from other quests in the chapter.
${r.ask ? `The author asks: ${r.ask.slice(0, 300)}` : ""}

current: ${JSON.stringify(r.current)}
other quests in the chapter: ${JSON.stringify(r.chapter.slice(0, 60))}`;
    const res = await generateJson(ai, { prompt, schema, maxTokens: 2048, temperature: 1.1 });
    const out = (res ?? {}) as RewriteResponse;
    return {
      title: String(out.title ?? "").slice(0, 120),
      subtitle: String(out.subtitle ?? "").slice(0, 200),
      description: (Array.isArray(out.description) ? out.description : []).slice(0, 5).map((l) => String(l).slice(0, 300)),
    };
  });
}
