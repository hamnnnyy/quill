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

// The visitor's own key (sent from settings) wins. The server's key only works in local dev,
// so a deployed Quill never spends the owner's quota for strangers.
export function apiKey(req: Request) {
  const own = req.headers.get("x-gemini-key")?.trim();
  if (own) return own;
  if (process.env.NODE_ENV !== "production" && process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  throw new AiError("Gemini API 키가 필요해요. 설정에서 내 키를 넣어 주세요.", 401);
}

export async function generate(key: string, req: Omit<GenerateContentParameters, "model">) {
  const ai = new GoogleGenAI({ apiKey: key });
  let last: unknown;
  for (const model of TEXT_MODELS) {
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

// Shared by both routes: size cap, JSON body, AI errors mapped to readable JSON.
export async function handle(req: Request, maxBytes: number, fn: (body: unknown, key: string) => Promise<unknown>) {
  try {
    const text = await req.text();
    if (text.length > maxBytes) return Response.json({ error: "요청이 너무 커요." }, { status: 413 });
    return Response.json(await fn(JSON.parse(text), apiKey(req)));
  } catch (e) {
    if (e instanceof AiError) return Response.json({ error: e.message }, { status: e.status });
    console.error(e);
    return Response.json({ error: "요청을 처리하지 못했어요." }, { status: 500 });
  }
}
