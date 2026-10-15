import { AiError, generateJson, handle } from "@/lib/ai";

export const maxDuration = 300;

export type KubejsChanges = {
  removed_outputs: string[]; // event.remove({ output: ... })
  removed_ids: string[]; // event.remove({ id: ... })
  removed_mods: string[]; // event.remove({ mod: ... })
  added: { result: string; result_count: number; station: string; ingredients: { id: string; count: number }[]; source: string }[];
};

const recipe = {
  type: "object",
  properties: {
    result: { type: "string", description: "namespaced item id" },
    result_count: { type: "integer" },
    station: { type: "string", description: "crafting_table, furnace, or the machine block id" },
    ingredients: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string", description: "item id, or tag prefixed with #" }, count: { type: "integer" } },
        required: ["id", "count"],
      },
    },
    source: { type: "string", description: "script file path" },
  },
  required: ["result", "result_count", "station", "ingredients", "source"],
};

const schema = {
  type: "object",
  properties: {
    removed_outputs: { type: "array", items: { type: "string" } },
    removed_ids: { type: "array", items: { type: "string" } },
    removed_mods: { type: "array", items: { type: "string" } },
    added: { type: "array", items: recipe },
  },
  required: ["removed_outputs", "removed_ids", "removed_mods", "added"],
};

const PROMPT = `These are KubeJS server scripts from a Minecraft modpack. List how they change recipes:
- removed_outputs: item ids whose recipes are removed by output (event.remove({output: ...}))
- removed_ids: recipe ids removed by id (event.remove({id: ...}))
- removed_mods: mod ids whose recipes are all removed (event.remove({mod: ...}))
- added: every recipe the scripts add (event.shaped, event.shapeless, event.smelting, event.recipes.<mod>.<type>, event.custom, ...).
  Count ingredients by how often they appear in the pattern. Tags start with #. Replaced recipes = removed + added.
Ignore scripts that don't touch recipes. Resolve simple variables and loops when you can; skip what you can't resolve.
Use only ids that appear in the scripts. Never invent ids.

`;

export function POST(req: Request) {
  return handle(req, 300_000, async (body, ai) => {
    const scripts = body as { path: string; text: string }[];
    if (!Array.isArray(scripts) || !scripts.length) throw new AiError("스크립트가 없어요.", 400);
    const res = await generateJson(ai, { prompt: PROMPT + scripts.map((s) => `// ==== ${s.path}\n${s.text}`).join("\n\n"), schema, maxTokens: 65536 });
    return (res ?? {}) as KubejsChanges;
  });
}
