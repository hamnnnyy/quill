import type { KubejsChanges } from "@/app/api/kubejs/route";
import type { QuestsRequest, QuestsResponse } from "@/app/api/quests/route";
import { cacheGet, cacheSet, hashKey } from "./cache.ts";
import { convert } from "./convert.ts";
import { fallbackText } from "./flavor.ts";
import { buildChapter, fallbackPick, type Node, type QuestText } from "./tree.ts";
import type { Chapter, Mod, Recipe, Settings } from "./types";

const CHUNK = 60; // recipes per Gemini call; fewer, bigger calls stay under the free-tier requests/min limit
const PARALLEL = 2; // 4 hit Gemini's 429 rate limit on half the chunks
const RETRIES = 3;

export class FatalAiError extends Error {} // bad or missing key: retrying won't help

// Called before each wait so the UI can show "busy, retrying in 15s" instead of a frozen screen.
export type OnRetry = (waitMs: number, reason: string) => void;

async function post<T>(path: string, body: unknown, key: string, onRetry?: OnRetry): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(path, {
      method: "POST",
      headers: key ? { "x-gemini-key": key } : {},
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (res.ok) return data;
    if (res.status === 401 || res.status === 400 || res.status === 413) throw new FatalAiError(data.error);
    if (attempt > RETRIES) throw new Error(data.error);
    onRetry?.(15_000 * attempt, data.error);
    await new Promise((r) => setTimeout(r, 15_000 * attempt)); // rate limit window is per minute
  }
}

async function cached<T>(parts: unknown, fetcher: () => Promise<T>): Promise<T> {
  const key = await hashKey(parts);
  const hit = await cacheGet<T>(key);
  if (hit) return hit;
  const value = await fetcher();
  await cacheSet(key, value);
  return value;
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: size }, async () => {
    for (let x = queue.shift(); x; x = queue.shift()) await fn(x);
  }));
}

export type Progress = { done: number; total: number; failed: number; error?: string };

// Known formats are converted locally; only the rest goes to Gemini, in cached chunks.
export async function normalizeMod(mod: Mod, key: string, onProgress: (p: Progress) => void, onRetry?: OnRetry) {
  const recipes: Recipe[] = [];
  const unknown = [];
  for (const raw of mod.recipes) {
    const r = convert(raw.json, raw.file);
    if (r) recipes.push(r);
    else unknown.push(raw);
  }
  const chunks = [];
  for (let i = 0; i < unknown.length; i += CHUNK) chunks.push(unknown.slice(i, i + CHUNK));
  const p: Progress = { done: 0, total: chunks.length, failed: 0 };
  onProgress({ ...p });

  let fatal: Error | undefined;
  await pool(chunks, PARALLEL, async (chunk) => {
    if (fatal) return;
    try {
      const out = await cached(["normalize-v1", chunk], () => post<Recipe[]>("/api/normalize", chunk, key, onRetry));
      recipes.push(...out.map((r) => ({ ...r, ai: true })));
    } catch (e) {
      if (e instanceof FatalAiError) fatal = e;
      p.failed++;
      p.error = (e as Error).message;
    }
    p.done++;
    onProgress({ ...p });
  });
  return { recipes, failed: p.failed, error: p.error };
}

type Label = (id: string) => string;

export async function chapterForMod(
  mod: Mod,
  recipes: Recipe[],
  tree: Map<string, Node>,
  label: Label,
  settings: Settings,
  key: string,
  exclude: Set<string>, // items that already have a quest in the pack
  onRetry?: OnRetry,
): Promise<{ chapter: Chapter; ai: boolean; error?: string }> {
  const nodes = [...tree.values()].filter((n) => !exclude.has(n.key));
  if (!nodes.length) throw new Error(`${mod.name}의 아이템은 이미 모두 퀘스트가 있어요.`);
  const request: QuestsRequest = {
    mod: { id: mod.id, name: mod.name },
    lang: settings.lang,
    maxQuests: settings.maxQuests,
    reward: settings.reward,
    candidates: nodes.map((n) => ({
      key: n.key,
      name: label(n.key),
      depth: n.depth,
      madeFrom: n.deps.map(label),
      station: label(n.station),
    })),
    rewardPool: rewardPool(recipes, tree, label),
  };

  try {
    const out = await cached(["quests-v2", request], () => post<QuestsResponse>("/api/quests", request, key, onRetry));
    if (!out.quests.length) throw new Error("AI가 고른 퀘스트가 없어요.");
    const texts: QuestText[] = out.quests.map((q) => ({
      key: q.key,
      title: q.title,
      subtitle: q.subtitle,
      description: q.description,
      xp: q.xp,
      rewardItem: q.reward_item || undefined,
      rewardCount: q.reward_count || undefined,
    }));
    return { chapter: buildChapter(mod, tree, texts, { title: out.chapter_title, subtitle: out.chapter_subtitle }), ai: true };
  } catch (e) {
    // No AI (quota, no key): still a usable chapter, just plainer text.
    const keys = fallbackPick(new Map(nodes.map((n) => [n.key, n])), settings.maxQuests);
    const scale = settings.reward === "high" ? 3 : settings.reward === "low" ? 0.5 : 1;
    const texts: QuestText[] = fallbackText(keys, tree, label, settings.lang).map((t) => ({
      ...t,
      title: label(t.key),
      xp: 10 * tree.get(t.key)!.depth * scale,
    }));
    return {
      chapter: buildChapter(mod, tree, texts, { title: mod.name, subtitle: "" }),
      ai: false,
      error: (e as Error).message,
    };
  }
}

// Plain items this mod's recipes start from: good rewards that push players to the next step.
function rewardPool(recipes: Recipe[], tree: Map<string, Node>, label: Label) {
  const ids = new Set<string>();
  for (const r of recipes)
    for (const i of r.ingredients)
      if (!i.id.startsWith("#") && (tree.get(i.id)?.depth ?? 0) <= 1) ids.add(i.id);
  return [...ids].slice(0, 150).map((id) => ({ id, name: label(id) }));
}

// KubeJS edits. Removals by output/id/mod are read locally (they're one-liners); additions need Gemini.
const REMOVE = /\.remove\(\s*\{([^}]*)\}\s*\)/g;
const FIELD = (name: string) => new RegExp(`${name}\\s*:\\s*['"\`]([^'"\`]+)['"\`]`);

export function localKubejs(scripts: { text: string }[]): KubejsChanges {
  const out: KubejsChanges = { removed_outputs: [], removed_ids: [], removed_mods: [], added: [] };
  for (const { text } of scripts)
    for (const m of text.matchAll(REMOVE)) {
      const body = m[1];
      const output = body.match(FIELD("output"))?.[1];
      const id = body.match(FIELD("id"))?.[1];
      const mod = body.match(FIELD("mod"))?.[1];
      if (output) out.removed_outputs.push(output);
      if (id) out.removed_ids.push(id);
      if (mod) out.removed_mods.push(mod);
    }
  return out;
}

export async function kubejsChanges(scripts: { path: string; text: string }[], key: string, onRetry?: OnRetry) {
  const local = localKubejs(scripts);
  try {
    const ai = await cached(["kubejs-v1", scripts], () => post<KubejsChanges>("/api/kubejs", scripts, key, onRetry));
    return {
      changes: {
        removed_outputs: [...new Set([...local.removed_outputs, ...ai.removed_outputs])],
        removed_ids: [...new Set([...local.removed_ids, ...ai.removed_ids])],
        removed_mods: [...new Set([...local.removed_mods, ...ai.removed_mods])],
        added: ai.added,
      },
      ai: true,
    };
  } catch (e) {
    return { changes: local, ai: false, error: (e as Error).message };
  }
}

// Returns a copy of recipes-by-mod with the pack's KubeJS edits applied. Added recipes join the mod
// that owns the result item, or a "kubejs" group.
export function applyKubejs(byMod: Record<string, Recipe[]>, c: KubejsChanges, known: Set<string>) {
  const outputs = new Set(c.removed_outputs);
  const ids = new Set(c.removed_ids);
  const mods = new Set(c.removed_mods);
  const out: Record<string, Recipe[]> = {};
  for (const [mod, list] of Object.entries(byMod))
    out[mod] = list.filter((r) => {
      const recipeId = r.source.replace(/^data\/([^/]+)\/recipes?\/(.+)\.json$/, "$1:$2");
      return !outputs.has(r.result) && !outputs.has(r.result_variant) && !ids.has(recipeId) && !mods.has(r.result.split(":")[0]);
    });
  for (const a of c.added) {
    const ns = a.result.split(":")[0];
    const target = out[ns] ? ns : "kubejs";
    (out[target] ??= []).push({ ...a, result_variant: "", ai: true });
    known.add(a.result); // the script itself is the source of truth for items it adds
  }
  return out;
}
