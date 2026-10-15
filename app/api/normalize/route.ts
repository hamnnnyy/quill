import { AiError, generate, handle } from "@/lib/gemini";

export const maxDuration = 300;

const schema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      result: { type: "string", description: "namespaced item id, e.g. create:andesite_alloy" },
      result_variant: { type: "string", description: "id that tells data-driven variants apart (e.g. an id stored in NBT), else empty" },
      result_count: { type: "integer" },
      station: { type: "string", description: "where it is crafted, e.g. crafting_table, furnace, create:mechanical_press" },
      ingredients: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "item id, or tag id prefixed with #" },
            count: { type: "integer" },
          },
          required: ["id", "count"],
        },
      },
      source: { type: "string", description: "the recipe file path" },
    },
    required: ["result", "result_variant", "result_count", "station", "ingredients", "source"],
  },
};

const PROMPT = `You get recipe JSON files from one Minecraft mod. Formats differ between mods.
Convert each recipe into the schema. Rules:
- Use only IDs that appear in the input. Never invent IDs.
- Shaped/shapeless recipes: count each ingredient by how often its key appears in the pattern.
- Machine recipes: station is the machine block that runs the recipe type (e.g. create:mixing -> create:mechanical_mixer).
- If a recipe has several outputs, use the main one.
- If the result is a data-driven variant (e.g. {"type":"gun","id":"tacz:ak47"}), put the variant id in result_variant
  and the real base item in result if the input reveals it, else repeat the variant id in result.
- Skip files that are not recipes.

`;

export function POST(req: Request) {
  return handle(req, 300_000, async (recipes, key) => {
    if (!Array.isArray(recipes)) throw new AiError("레시피 배열이 필요해요.", 400);
    const res = await generate(key, {
      contents: PROMPT + JSON.stringify(recipes),
      config: { responseMimeType: "application/json", responseJsonSchema: schema, maxOutputTokens: 65536 },
    });
    return JSON.parse(res.text ?? "[]");
  });
}
