import { GoogleGenAI, type GenerateContentParameters } from "@google/genai";

// Same as kilo/lib/ai.ts: newest models are often 503 "high demand", so fall back to older ones.
const TEXT_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-flash-latest"];

export class AiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// Providers a visitor can bring a key for. Other than Gemini they speak the OpenAI chat API,
// and only these fixed hosts are called: the server never fetches a URL a visitor typed.
export const PROVIDERS = {
  gemini: { label: "Google Gemini", base: "", models: TEXT_MODELS },
  // Free models, best Korean quest text first (compared on the TACZ sample, Oct 2026).
  // Gemma's free pool was rate-limited upstream on every try, so it's last.
  openrouter: {
    label: "OpenRouter",
    base: "https://openrouter.ai/api/v1",
    models: [
      "nvidia/nemotron-3-ultra-550b-a55b:free",
      "nvidia/nemotron-3.5-super-vl:free",
      "nvidia/nemotron-3-super-120b-a12b:free",
      "google/gemma-4-31b-it:free",
    ],
  },
  // GLM-4.7-Flash is in Zhipu's free model list (docs.bigmodel.cn)
  zhipu: { label: "Zhipu GLM", base: "https://open.bigmodel.cn/api/paas/v4", models: ["glm-4.7-flash"] },
} as const;
export type Provider = keyof typeof PROVIDERS;
export type Creds = { provider: Provider; key: string; model?: string };

// The visitor's own key (sent from settings) wins. The server's Gemini key only works in local dev,
// so a deployed Quill never spends the owner's quota for strangers.
export function creds(req: Request): Creds {
  const p = req.headers.get("x-ai-provider") ?? "gemini";
  const provider: Provider = p in PROVIDERS ? (p as Provider) : "gemini";
  const model = req.headers.get("x-ai-model")?.trim();
  const own = req.headers.get("x-ai-key")?.trim();
  const valid = model && /^[\w./:-]{1,120}$/.test(model) ? model : undefined;
  if (own) return { provider, key: own, model: valid };
  if (provider === "gemini" && process.env.NODE_ENV !== "production" && process.env.GEMINI_API_KEY)
    return { provider, key: process.env.GEMINI_API_KEY, model: valid };
  throw new AiError(`${PROVIDERS[provider].label} API 키가 필요해요. 3단계 설정에서 내 키를 넣어 주세요.`, 401);
}

async function gemini(key: string, models: readonly string[], req: Omit<GenerateContentParameters, "model">) {
  const ai = new GoogleGenAI({ apiKey: key });
  let last: unknown;
  for (const model of models) {
    try {
      return await ai.models.generateContent({ ...req, model });
    } catch (e) {
      last = e;
      const status = (e as { status?: number }).status;
      if (status !== 503 && status !== 429) break;
    }
  }
  const status = (last as { status?: number }).status;
  const message = String((last as { message?: string }).message ?? "");
  // The free tier's per-day cap (20 requests per model): retrying in 15s can't help, so say so and stop.
  if (status === 429 && message.includes("PerDay")) {
    const hours = message.match(/retry in (\d+)h/)?.[1];
    throw new AiError(
      `오늘 쓸 수 있는 AI 횟수를 다 썼어요${hours ? ` (약 ${hours}시간 뒤 다시 채워져요)` : ""}. 무료 키는 모델마다 하루 20번이에요. 결제를 켠 키를 쓰거나 AI 없이 만들 수 있어요.`,
      402,
    );
  }
  if (status === 429) throw new AiError("AI 사용 한도를 넘었어요. 잠시 후 다시 시도하세요.", 429);
  if (status === 503) throw new AiError("AI 서버가 붐벼요. 잠시 후 다시 시도하세요.", 503);
  if (status === 400 || status === 403) throw new AiError("Gemini API 키가 맞지 않아요. 설정에서 키를 확인하세요.", 401);
  throw last;
}

type Json = { prompt: string; schema: Record<string, unknown>; maxTokens: number; temperature?: number };

// One JSON answer from whichever provider the visitor picked.
export async function generateJson(c: Creds, { prompt, schema, maxTokens, temperature }: Json): Promise<unknown> {
  if (c.provider === "gemini") {
    const res = await gemini(c.key, c.model ? [c.model] : TEXT_MODELS, {
      contents: prompt,
      config: { responseMimeType: "application/json", responseJsonSchema: schema, maxOutputTokens: maxTokens, temperature },
    });
    return JSON.parse(res.text ?? "null");
  }
  return openaiCompatible(c, prompt, schema, maxTokens, temperature);
}

// JSON mode needs an object at the top, so an array schema rides inside { items: [...] }.
async function openaiCompatible(c: Creds, prompt: string, schema: Record<string, unknown>, maxTokens: number, temperature?: number) {
  const wrapped = schema.type === "array";
  const root = wrapped ? { type: "object", properties: { items: schema }, required: ["items"] } : schema;
  const text = `${prompt}\n\nReply with JSON only, no prose, matching this JSON schema:\n${JSON.stringify(root)}`;
  // Free models differ in what they accept: try strict schema, then plain JSON mode, then nothing.
  const formats = [{ type: "json_schema", json_schema: { name: "answer", schema: root } }, { type: "json_object" }, undefined];
  const { base, models } = PROVIDERS[c.provider];
  let last = new AiError("AI가 답하지 않았어요. 잠시 후 다시 시도하세요.", 503);
  for (const model of c.model ? [c.model] : models) {
    for (const response_format of formats) {
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${c.key}`, "x-title": "Quill" },
        body: JSON.stringify({ model, messages: [{ role: "user", content: text }], max_tokens: Math.min(maxTokens, 16384), temperature, response_format }),
      });
      const body = await res.text();
      if (res.ok) {
        const content = JSON.parse(body).choices?.[0]?.message?.content ?? "";
        const parsed = parseLoose(content);
        if (parsed !== undefined) return wrapped ? (parsed as { items?: unknown }).items ?? [] : parsed;
        last = new AiError("AI 답을 읽지 못했어요. 다른 모델로 해 보세요.", 502);
        break; // the model answered but not in JSON: next model
      }
      if (res.status === 401) throw new AiError(`${PROVIDERS[c.provider].label} API 키가 맞지 않아요. 키를 확인하세요.`, 401);
      if (res.status === 402) throw new AiError(`${PROVIDERS[c.provider].label} 크레딧이 없어요. 무료 모델을 쓰거나 크레딧을 충전하세요.`, 402);
      if (res.status === 429 && /per-day|per day|daily/i.test(body))
        throw new AiError(`오늘 쓸 수 있는 ${PROVIDERS[c.provider].label} 무료 횟수를 다 썼어요. 내일 다시 하거나 AI 없이 만들 수 있어요.`, 402);
      if (res.status === 400 && response_format) continue; // likely response_format unsupported
      last =
        res.status === 429
          ? new AiError("AI 사용 한도를 넘었어요. 잠시 후 다시 시도하세요.", 429)
          : new AiError(`AI가 답하지 않았어요 (${model}, ${res.status}). 다른 모델로 해 보세요.`, 503); // 403: model closed to plain API use
      break; // busy, gone or failing: next model
    }
  }
  throw last;
}

// Free models sometimes wrap JSON in ```json fences or add a sentence around it.
function parseLoose(s: string): unknown {
  const t = s.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "");
  try {
    return JSON.parse(t);
  } catch {
    const m = t.match(/[\[{][\s\S]*[\]}]/);
    try {
      return m ? JSON.parse(m[0]) : undefined;
    } catch {
      return undefined;
    }
  }
}

// Shared by the routes: size cap, JSON body, AI errors mapped to readable JSON.
export async function handle(req: Request, maxBytes: number, fn: (body: unknown, c: Creds) => Promise<unknown>) {
  try {
    const text = await req.text();
    if (text.length > maxBytes) return Response.json({ error: "요청이 너무 커요." }, { status: 413 });
    return Response.json(await fn(JSON.parse(text), creds(req)));
  } catch (e) {
    if (e instanceof AiError) return Response.json({ error: e.message }, { status: e.status });
    console.error(e);
    return Response.json({ error: "요청을 처리하지 못했어요." }, { status: 500 });
  }
}
