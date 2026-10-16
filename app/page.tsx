"use client";

import { zipSync, strToU8 } from "fflate";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KubejsChanges } from "@/app/api/kubejs/route";
import { conditionsMet } from "@/lib/conditions";
import { sessionClear, sessionGet, sessionSet } from "@/lib/cache";
import { emptyExtract, merge, readDump, readJar, recipeIds, type Extract } from "@/lib/jar";
import { outputVersion, readPack, type PackInfo } from "@/lib/pack";
import { applyKubejs, chapterForMod, kubejsChanges, normalizeMod, rewriteQuest, type Ai } from "@/lib/pipeline";
import { questFiles } from "@/lib/snbt";
import { demo } from "@/lib/demo";
import { buildTree, layout, newId } from "@/lib/tree";
import type { Chapter, Quest, Recipe, Settings, Task } from "@/lib/types";
import { vanillaIcons, vanillaNames } from "@/lib/vanilla";
import { Activity, MapSkeleton, type ActivityState, type Job } from "./components/Activity";
import { Hotbar } from "./components/Hotbar";
import { QuestMap } from "./components/QuestMap";
import { RecipeCard } from "./components/Recipe";
import { TASKS, taskText } from "./components/tasks";
import { bare, type Lookup } from "./components/Slot";

// Mirrors PROVIDERS in lib/ai.ts (server-only, it imports the Gemini SDK).
const AI_PROVIDERS: Record<string, { label: string; placeholder: string; model: string; keyUrl: string; note: string }> = {
  gemini: {
    label: "Google Gemini",
    placeholder: "AIza…",
    model: "gemini-3.8-flash",
    keyUrl: "https://aistudio.google.com/apikey",
    note: "무료 키는 모델마다 하루 20번이에요.",
  },
  openrouter: {
    label: "OpenRouter",
    placeholder: "sk-or-…",
    model: "nvidia/nemotron-3-ultra-550b-a55b:free",
    keyUrl: "https://openrouter.ai/settings/keys",
    note: "이름이 :free로 끝나는 모델은 무료예요. 하루 50번, 10달러를 한 번 충전한 계정은 1,000번까지예요. 무료 모델은 챕터 하나에 1분쯤 걸려요.",
  },
  zhipu: {
    label: "Zhipu GLM",
    placeholder: "…",
    model: "glm-4.7-flash",
    keyUrl: "https://open.bigmodel.cn/usercenter/apikeys",
    note: "GLM-4.7-Flash는 Zhipu의 무료 모델이에요. 레시피와 아이템 이름이 중국 서버로 가요.",
  },
};

const DEFAULT_SETTINGS: Settings = { version: "1.20.1", lang: "ko", maxQuests: 25, reward: "normal", style: "mixed" };

// "minecraft:iron_ingot" -> "iron ingot", "#forge:ingots/iron" -> "iron"
const fallbackName = (id: string) => bare(id).split(/[:/]/).pop()!.replaceAll("_", " ");
const withNs = (id: string) => (bare(id).includes(":") ? bare(id) : `minecraft:${bare(id)}`); // stations like "furnace"

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? { ...fallback, ...JSON.parse(v) } : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export default function Home() {
  const [theme, setTheme] = useState("gui");
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [ai, setAi] = useState<Ai>({ provider: "gemini", key: "", model: "" });

  const [extract, setExtract] = useState<Extract>(emptyExtract);
  const [baseRecipes, setBaseRecipes] = useState<Record<string, Recipe[]>>({}); // before KubeJS edits
  const [kubejs, setKubejs] = useState<{ changes: KubejsChanges; ai: boolean; error?: string }>();
  const [pack, setPack] = useState<PackInfo>();
  const [activity, setActivity] = useState<ActivityState | null>(null);
  const [notice, setNotice] = useState("");
  const [canRetry, setCanRetry] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string>();

  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [active, setActive] = useState(0);
  const [newBook, setNewBook] = useState(false);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme || "gui");
    setSettings(load("settings", DEFAULT_SETTINGS));
    setAi(load("ai", { provider: "gemini", key: load("apiKey", { key: "" }).key, model: "" })); // apiKey: before other providers
  }, []);

  // Autosave: what was read (big, changes rarely) and the edits (small, change often) are stored apart.
  type Input = { extract: Extract; baseRecipes: Record<string, Recipe[]>; kubejs?: typeof kubejs; pack?: PackInfo; picked: Set<string> };
  type Work = { chapters: Chapter[]; active: number; newBook: boolean; savedAt: number };
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    (async () => {
      const input = await sessionGet<Input>("input");
      const work = await sessionGet<Work>("work");
      const stale = input && [...input.extract.icons.values()].some((u) => u.startsWith("blob:")); // saved before icons were data URLs
      if (input?.extract.mods.length && !stale) {
        setExtract(input.extract);
        setBaseRecipes(input.baseRecipes);
        setKubejs(input.kubejs);
        setPack(input.pack);
        setPicked(input.picked);
        if (work?.chapters.length) {
          setChapters(work.chapters);
          setActive(Math.min(work.active, work.chapters.length - 1));
          setNewBook(work.newBook);
        }
        setNotice(`지난 작업을 불러왔어요 (${new Date(work?.savedAt ?? Date.now()).toLocaleString()}).`);
        setCanReset(true);
      }
      setRestored(true);
    })();
  }, []);
  useEffect(() => {
    if (restored && !activity) sessionSet("input", { extract, baseRecipes, kubejs, pack, picked } satisfies Input);
  }, [restored, activity, extract, baseRecipes, kubejs, pack, picked]);
  useEffect(() => {
    if (!restored) return;
    const t = setTimeout(() => sessionSet("work", { chapters, active, newBook, savedAt: Date.now() } satisfies Work), 400);
    return () => clearTimeout(t);
  }, [restored, chapters, active, newBook]);
  const [canReset, setCanReset] = useState(false);
  async function startOver() {
    await sessionClear();
    location.reload();
  }
  const changeAi = (patch: Partial<Ai>) => {
    const next = { ...ai, ...patch };
    setAi(next);
    save("ai", next);
  };
  const changeSettings = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    save("settings", next);
  };
  function pickTheme(id: string) {
    setTheme(id);
    document.documentElement.dataset.theme = id;
    try {
      localStorage.setItem("theme", id);
    } catch {}
  }

  const recipes = useMemo(
    () => (kubejs ? applyKubejs(baseRecipes, kubejs.changes, extract.known) : baseRecipes),
    [baseRecipes, kubejs, extract],
  );
  const invented = useMemo(() => {
    const fromAi = Object.values(recipes).flat().filter((r) => r.ai); // local conversions are trusted
    return new Set(fromAi.flatMap(recipeIds).filter((id) => !extract.known.has(id) && !id.startsWith("minecraft:")));
  }, [recipes, extract]);
  const lookup: Lookup = useMemo(
    () => ({ label: (id) => extract.names.get(withNs(id)) ?? fallbackName(id), icons: extract.icons, invented }),
    [extract, invented],
  );
  // Every item Quill knows a name for (mods + vanilla): what a hand-picked reward can be.
  const items = useMemo(() => [...extract.names].map(([id, name]) => ({ id, name })), [extract]);
  // Recipes by what they make, across all mods: the editor's "how do I craft this" view.
  const recipesFor = useMemo(() => {
    const by = new Map<string, Recipe[]>();
    for (const r of Object.values(recipes).flat()) {
      const k = r.result_variant || r.result;
      by.set(k, [...(by.get(k) ?? []), r]);
    }
    return (id: string) => by.get(id) ?? [];
  }, [recipes]);
  const trees = useMemo(() => Object.fromEntries(Object.entries(recipes).map(([m, r]) => [m, buildTree(r)])), [recipes]);
  const mods = useMemo(() => {
    const list = [...extract.mods];
    if (recipes.kubejs?.length && !list.some((m) => m.id === "kubejs")) list.push({ id: "kubejs", name: "KubeJS", recipes: [] });
    return list.filter((m) => recipes[m.id]?.length);
  }, [extract, recipes]);
  const busy = activity !== null;

  // Activity panel helpers: one row per file / mod, updated as work moves along.
  const begin = (title: string, hint: string, jobs: { id: string; name: string }[]) =>
    setActivity({ title, hint, startedAt: Date.now(), jobs: jobs.map((j) => ({ ...j, state: "wait" })) });
  const job = (id: string, patch: Partial<Job>) =>
    setActivity((a) => a && { ...a, jobs: a.jobs.map((j) => (j.id === id ? { ...j, retryUntil: undefined, ...patch } : j)) });
  const retrying = (id: string) => (waitMs: number, reason: string) =>
    job(id, { detail: reason.replace(/ 잠시 후 다시 시도하세요\.$/, ""), retryUntil: Date.now() + waitMs });

  async function readFiles(list: FileList | null) {
    const files = Array.from(list ?? []).filter((f) => /\.(jar|json|zip|mrpack)$/i.test(f.name));
    if (!files.length) return setNotice("jar, 모드팩 zip, 또는 Quill 덤프(.json)를 넣어 주세요.");
    setNotice("");
    setCanRetry(false);
    setCanReset(false);
    setBaseRecipes({});
    setKubejs(undefined);
    setPack(undefined);
    setChapters([]);
    begin("파일을 여는 중이에요", "jar는 이 브라우저 안에서만 열어요.", files.map((f) => ({ id: f.name, name: f.name })));

    const icons = vanillaIcons(); // downloads while jars are read
    const names = vanillaNames();
    const all = emptyExtract();
    const info: PackInfo = { jars: 0, scripts: [], datapackRecipes: 0 };
    try {
      for (const f of files) {
        job(f.name, { state: "run" });
        await new Promise((r) => setTimeout(r, 0)); // let the row repaint before a long synchronous unzip
        const bytes = new Uint8Array(await f.arrayBuffer()); // one file in memory at a time
        if (/\.(zip|mrpack)$/i.test(f.name)) {
          const res = readPack(bytes, () => {});
          merge(all, res.extract);
          info.jars += res.info.jars;
          info.scripts.push(...res.info.scripts);
          info.datapackRecipes += res.info.datapackRecipes;
          info.existing ??= res.info.existing;
          info.mcVersion ??= res.info.mcVersion;
          info.listedMods ??= res.info.listedMods;
          job(f.name, { state: "done", detail: `모드 ${res.info.jars}개, KubeJS 스크립트 ${res.info.scripts.length}개` });
        } else if (f.name.endsWith(".json")) {
          merge(all, readDump(JSON.parse(new TextDecoder().decode(bytes))));
          job(f.name, { state: "done", detail: "KubeJS 덤프" });
        } else {
          merge(all, readJar(bytes, f.name));
          info.jars++;
          job(f.name, { state: "done" });
        }
      }
    } catch (e) {
      setActivity(null);
      return setNotice((e as Error).message);
    }
    (await icons).forEach((v, k) => all.icons.has(k) || all.icons.set(k, v)); // mod textures win over vanilla
    (await names).forEach((v, k) => all.names.has(k) || all.names.set(k, v));
    // Drop recipes for mods that aren't here (Create's uranium crushing needs IC2 or Mekanism, ...).
    const loaded = new Set(all.mods.map((m) => m.id)); // from mods.toml; lang files name other mods' items too
    const itemIds = new Set([...all.known, ...all.names.keys()]);
    all.mods = all.mods
      .map((m) => ({ ...m, recipes: m.recipes.filter((r) => conditionsMet(r.json, loaded, itemIds)) }))
      .filter((m) => m.recipes.length);

    // What the pack already has decides the defaults: its Minecraft version, and adding to its quest book.
    const version = info.existing?.version ?? outputVersion(info.mcVersion);
    if (version) changeSettings({ version });
    setNewBook(!info.existing);
    setPack(info);
    setExtract(all);
    setPicked(new Set(all.mods.map((m) => m.id)));
    if (!all.mods.length && !info.scripts.length) {
      setActivity(null);
      return setNotice(
        info.listedMods
          ? "이 zip에는 모드 jar가 없어요. CurseForge나 Modrinth에서 내보낸 팩은 모드 목록만 담고 있어요. 설치한 인스턴스의 mods 폴더를 같이 넣어 주세요."
          : "레시피 파일이 없어요. 다른 모드 jar를 넣어 보세요.",
      );
    }
    await normalizeAll(all, info);
  }

  async function loadDemo() {
    setNotice("");
    setCanRetry(false);
    setCanReset(false);
    const [icons, names] = await Promise.all([vanillaIcons(), vanillaNames()]);
    const { recipes: demoRecipes, chapter: demoChapter } = demo();
    setExtract({ ...emptyExtract(), mods: [{ id: "minecraft", name: "바닐라 생존 (예시)", recipes: [] }], icons, names });
    setBaseRecipes({ minecraft: demoRecipes });
    setKubejs(undefined);
    setPack(undefined);
    setPicked(new Set(["minecraft"]));
    history.current = { past: [], future: [], last: 0 };
    setChapters([demoChapter]);
    setActive(0);
    setNewBook(true);
    setNotice("예시 챕터를 불러왔어요. 4단계 맵에서 퀘스트를 눌러 고쳐 보고, 5단계에서 zip으로 받아 볼 수 있어요. 내 모드로 하려면 위에 jar를 넣으세요.");
    setCanReset(true);
    requestAnimationFrame(() => document.getElementById("s4")?.scrollIntoView({ behavior: "smooth" }));
  }

  async function normalizeAll(all = extract, info = pack) {
    const scripts = info?.scripts ?? [];
    begin(
      "레시피를 정리하는 중이에요",
      "아는 형식은 바로 바꾸고, 처음 보는 형식만 AI에게 보내요. 한 번 정리한 모드는 이 브라우저에 저장해 두고 다시 쓰지 않아요.",
      [...all.mods.map((m) => ({ id: m.id, name: m.name })), ...(scripts.length ? [{ id: "kubejs-scripts", name: `KubeJS 스크립트 ${scripts.length}개` }] : [])],
    );
    const out: Record<string, Recipe[]> = {};
    let failed = 0;
    let error = "";
    for (const mod of all.mods) {
      job(mod.id, { state: "run", detail: `레시피 ${mod.recipes.length}개` });
      const res = await normalizeMod(mod, ai, (p) => p.total && job(mod.id, { detail: `AI 묶음 ${p.done}/${p.total}` }), retrying(mod.id));
      out[mod.id] = res.recipes;
      failed += res.failed;
      error = res.error ?? error;
      job(mod.id, res.failed ? { state: "fail", detail: `${res.failed}묶음 실패` } : { state: "done", detail: `레시피 ${res.recipes.length}개` });
      setBaseRecipes({ ...out });
    }
    if (scripts.length) {
      job("kubejs-scripts", { state: "run", detail: "레시피를 바꾸는 부분을 찾는 중" });
      const res = await kubejsChanges(scripts, ai, retrying("kubejs-scripts"));
      setKubejs(res);
      const c = res.changes;
      const summary = `제거 ${c.removed_outputs.length + c.removed_ids.length + c.removed_mods.length}건, 추가 ${c.added.length}건`;
      job("kubejs-scripts", res.ai ? { state: "done", detail: summary } : { state: "plain", detail: `${summary} (제거만 반영)` });
    }
    setActivity(null);
    setCanRetry(failed > 0);
    setNotice(failed ? `${failed}묶음을 정리하지 못했어요: ${error} 다시 시도하면 이미 끝난 부분은 건너뛰어요.` : "");
  }

  async function makeQuests() {
    const chosen = mods.filter((m) => picked.has(m.id));
    const exclude = pack?.existing?.items ?? new Set<string>();
    const taken = new Set(pack?.existing?.chapters.map((c) => c.filename));
    begin(
      "퀘스트를 쓰는 중이에요",
      ai.key || process.env.NODE_ENV !== "production"
        ? "AI가 모드마다 중요한 아이템을 골라 제목과 설명을 써요. 챕터 하나에 보통 20초에서 1분쯤 걸려요."
        : "API 키가 없어서 AI 없이 기본 문구로 만들어요.",
      chosen.map((m) => ({ id: m.id, name: m.name })),
    );
    setChapters([]);
    history.current = { past: [], future: [], last: 0 };
    const made: Chapter[] = [];
    const plain: string[] = [];
    let error = "";
    for (const mod of chosen) {
      job(mod.id, { state: "run", detail: "AI가 퀘스트를 고르고 쓰는 중" });
      try {
        const res = await chapterForMod(mod, recipes[mod.id], trees[mod.id], lookup.label, settings, ai, exclude, retrying(mod.id));
        let filename = res.chapter.filename;
        for (let n = 2; taken.has(filename); n++) filename = `${res.chapter.filename}_${n}`; // never overwrite the pack's chapters
        taken.add(filename);
        made.push({ ...res.chapter, filename });
        if (!res.ai) {
          plain.push(mod.name);
          error = res.error ?? error;
        }
        job(mod.id, { state: res.ai ? "done" : "plain", detail: `퀘스트 ${res.chapter.quests.length}개` });
      } catch (e) {
        job(mod.id, { state: "fail", detail: (e as Error).message });
      }
      setChapters([...made]);
    }
    setActive(0);
    setActivity(null);
    setCanRetry(false);
    setNotice(
      plain.length
        ? `${plain.join(", ")} 챕터는 AI 없이 기본 문구로 만들었어요(${error.replace(/\.$/, "")}). 맵에서 직접 고치거나 나중에 다시 만들어 보세요.`
        : "",
    );
  }

  const modOfChapter = (c: Chapter) => mods.find((m) => c.filename.startsWith(`quill_${m.id.replace(/[^a-z0-9_]/g, "_")}`));

  function addQuest(chapterIndex: number, key: string, task?: Task) {
    const c = chapters[chapterIndex];
    const mod = modOfChapter(c);
    const node = mod && trees[mod.id]?.get(key);
    if (!node && !task) return;
    const maxX = Math.max(0, ...c.quests.map((q) => q.x));
    const quest: Quest = {
      id: newId(),
      key,
      item: node?.item ?? key,
      nbt: node?.nbt,
      count: 1,
      title: task ? TASKS.find((t) => t.type === task.type)!.label.replace(/ \(.*\)$/, "") : lookup.label(key),
      description: [],
      x: maxX + 2,
      y: 0,
      deps: [],
      xp: node ? 10 * node.depth : 20,
      task,
    };
    updateChapter(chapterIndex, { ...c, quests: [...c.quests, quest] });
  }
  // Undo history for edits. Edits less than 600ms apart (a drag, typing) count as one step.
  const history = useRef({ past: [] as Chapter[][], future: [] as Chapter[][], last: 0 });
  const [, setHistoryTick] = useState(0);
  function edit(fn: (all: Chapter[]) => Chapter[]) {
    const h = history.current;
    const now = Date.now();
    if (now - h.last > 600) {
      h.past = [...h.past.slice(-99), chapters];
      h.future = [];
    }
    h.last = now;
    setChapters(fn);
    setHistoryTick((n) => n + 1);
  }
  function undo(redo = false) {
    const h = history.current;
    const [from, to] = redo ? [h.future, h.past] : [h.past, h.future];
    const prev = from.pop();
    if (!prev) return;
    to.push(chapters);
    h.last = 0;
    setChapters(prev);
    setHistoryTick((n) => n + 1);
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable]");
      if (typing || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      undo(e.shiftKey);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  function rewrite(c: Chapter, q: Quest, ask: string) {
    const mod = modOfChapter(c);
    const node = mod && trees[mod.id]?.get(q.key);
    return rewriteQuest(
      {
        mod: mod?.name ?? c.title,
        lang: settings.lang,
        item: { name: lookup.label(q.key), madeFrom: node?.deps.map(lookup.label) ?? [], station: lookup.label(node?.station ?? "crafting_table") },
        goal: q.task && taskText(q.task, lookup.label),
        current: { title: q.title, subtitle: q.subtitle ?? "", description: q.description },
        chapter: c.quests.filter((x) => x.id !== q.id).map((x) => [x.title, x.subtitle].filter(Boolean).join(": ")),
        ask,
        style: settings.style,
      },
      ai,
    );
  }
  // Tab order is the order in the quest book (order_index on export).
  function moveChapter(dir: -1 | 1) {
    const to = active + dir;
    edit((all) => {
      const next = [...all];
      [next[active], next[to]] = [next[to], next[active]];
      return next;
    });
    setActive(to);
  }
  const updateChapter = (i: number, c: Chapter) => edit((all) => all.map((x, j) => (j === i ? c : x)));

  function download() {
    const files = questFiles(chapters, settings.version, { newBook, locale: settings.lang === "ko" ? "ko_kr" : "en_us" });
    const zip = zipSync(Object.fromEntries(Object.entries(files).map(([p, s]) => [p, strToU8(s)])));
    const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: "application/zip" }));
    Object.assign(document.createElement("a"), { href: url, download: "quill-quests.zip" }).click();
    URL.revokeObjectURL(url);
  }

  const recipeCount = Object.values(recipes).reduce((n, r) => n + r.length, 0);
  const xp = activity?.jobs.length
    ? activity.jobs.filter((j) => j.state !== "wait" && j.state !== "run").length / activity.jobs.length
    : 0;
  const chapter = chapters[active];
  const chapterMod = chapter && modOfChapter(chapter);
  const addable = chapter && chapterMod
    ? [...(trees[chapterMod.id]?.keys() ?? [])]
        .filter((k) => !chapter.quests.some((q) => q.key === k))
        .map((k) => ({ key: k, label: lookup.label(k) }))
        .sort((a, b) => a.label.localeCompare(b.label))
    : [];

  return (
    <>
    <main>
      <header>
        <div>
          <h1>Quill</h1>
          <p className="lede">모드 jar를 넣으면 레시피를 읽어서 FTB 퀘스트 챕터를 만들어 줘요.</p>
        </div>
      </header>

      <section aria-labelledby="s1">
        <h2 id="s1" className="step">1. 모드 넣기</h2>
        <label className={`panel drop${busy ? " busy" : ""}`}>
          <input type="file" accept=".jar,.zip,.mrpack,.json" multiple disabled={busy} onChange={(e) => readFiles(e.target.files)} />
          <span className="slot big drop-slot" aria-hidden>jar</span>
          <span>
            <b>모드 jar나 모드팩 zip을 끌어다 놓거나 눌러서 고르세요</b>
            <span className="muted">
              zip이면 안에 있는 KubeJS 스크립트와 기존 FTB 퀘스트를 먼저 읽어요. 파일은 이 브라우저에서만 열고, 처음 보는 형식의 레시피만 AI에게 보내요.
            </span>
          </span>
        </label>
        <div className="alt-inputs">
          <label className="button-like">
            <input
              type="file"
              {...{ webkitdirectory: "" } /* folder picker; supported everywhere but missing from React's types */}
              disabled={busy}
              onChange={(e) => readFiles(e.target.files)}
            />
            mods 폴더 통째로 고르기
          </label>
          <button className="button-like" disabled={busy} onClick={loadDemo}>
            jar 없이 예시로 먼저 보기
          </button>
          <details className="kubejs">
            <summary>KubeJS로 더 정확하게 읽기</summary>
            <p className="muted">
              팩이 KubeJS로 레시피를 바꿨거나, 모드가 레시피를 코드로 등록하면 jar만으로는 빠지는 레시피가 생겨요. 이 스크립트를 팩의{" "}
              <code>kubejs/server_scripts/</code>에 넣고 월드에 들어간 다음, 생긴 <code>kubejs/exported/quill.json</code>을 위 칸에 넣으세요.
              아이콘과 이름은 jar를 같이 넣으면 나와요. KubeJS 6(1.20.1)용이고, 아직 게임에서 직접 확인하지 못한 실험 기능이에요.
            </p>
            <a className="button-like" href="/quill_export.js" download>
              quill_export.js 받기
            </a>
          </details>
        </div>
      </section>

      {activity && <Activity {...activity} />}

      {!busy && notice && (
        <section className="panel status" aria-live="polite">
          <p>{notice}</p>
          {canRetry && <button onClick={() => normalizeAll()}>실패한 부분 다시 시도</button>}
          {canReset && <button onClick={startOver}>지우고 새로 시작</button>}
        </section>
      )}

      {!busy && pack && (pack.scripts.length > 0 || pack.existing || pack.datapackRecipes > 0) && (
        <section className="panel found" aria-label="팩에서 찾은 것">
          <b>팩에서 먼저 확인한 것</b>
          <ul>
            {pack.scripts.length > 0 && (
              <li>
                KubeJS 스크립트 {pack.scripts.length}개.{" "}
                {kubejs?.ai &&
                  `레시피 제거 ${kubejs.changes.removed_outputs.length + kubejs.changes.removed_ids.length + kubejs.changes.removed_mods.length}건, 추가 ${kubejs.changes.added.length}건을 반영했어요.`}
                {kubejs &&
                  !kubejs.ai &&
                  `레시피 제거 ${kubejs.changes.removed_outputs.length + kubejs.changes.removed_ids.length + kubejs.changes.removed_mods.length}건만 반영했어요. 스크립트가 추가하는 레시피는 AI가 있어야 읽을 수 있어요(${kubejs.error?.replace(/\.$/, "")}). 더 정확하게 하려면 위의 "KubeJS로 더 정확하게 읽기"를 써 보세요.`}
              </li>
            )}
            {pack.datapackRecipes > 0 && <li>KubeJS 데이터팩 레시피 {pack.datapackRecipes}개를 같이 읽었어요.</li>}
            {pack.existing && (
              <li>
                기존 FTB 퀘스트 챕터 {pack.existing.chapters.length}개(퀘스트 {pack.existing.chapters.reduce((n, c) => n + c.quests, 0)}개)가 있어요.
                이미 퀘스트가 있는 아이템 {pack.existing.items.size}개는 빼고 만들고, 내보낼 때 기존 퀘스트북에 챕터만 더해요. 버전은 {pack.existing.version}에 맞췄어요.
              </li>
            )}
            {!pack.existing && pack.mcVersion && <li>마인크래프트 {pack.mcVersion} 팩이에요. 버전을 {outputVersion(pack.mcVersion) ?? "직접"} 맞춰 주세요.</li>}
          </ul>
        </section>
      )}

      {recipeCount > 0 && (
        <section aria-labelledby="s2">
          <h2 id="s2" className="step">2. 레시피 확인</h2>
          <p className="muted">
            레시피 {recipeCount}개를 정리했어요.
            {invented.size > 0 && ` 모드 안에서 찾지 못한 아이템 ${invented.size}개는 빨간 칸으로 표시했어요.`}
          </p>
          {mods.map((mod) =>
            recipes[mod.id]?.length ? (
              <details key={mod.id} className="mod" open={open === mod.id} onToggle={(e) => e.currentTarget.open && setOpen(mod.id)}>
                <summary className="panel">
                  <b>{mod.name}</b> <span className="muted">레시피 {recipes[mod.id].length}개</span>
                </summary>
                {open === mod.id && (
                  <div className="recipes">
                    {recipes[mod.id].map((r, i) => (
                      <RecipeCard key={i} r={r} lookup={lookup} />
                    ))}
                  </div>
                )}
              </details>
            ) : null,
          )}
        </section>
      )}

      {recipeCount > 0 && (
        <section aria-labelledby="s3">
          <h2 id="s3" className="step">3. 퀘스트 만들기</h2>
          <div className="panel form">
            <fieldset>
              <legend className="label">챕터로 만들 모드</legend>
              <div className="chips">
                {mods.map((m) => (
                    <label key={m.id} className="check">
                      <input
                        type="checkbox"
                        checked={picked.has(m.id)}
                        onChange={(e) => {
                          const next = new Set(picked);
                          if (e.target.checked) next.add(m.id);
                          else next.delete(m.id);
                          setPicked(next);
                        }}
                      />
                      {m.name}
                    </label>
                  ))}
              </div>
            </fieldset>
            <div className="row">
              <label>
                <span className="label">마인크래프트 버전</span>
                <select value={settings.version} onChange={(e) => changeSettings({ version: e.target.value as Settings["version"] })}>
                  <option value="1.20.1">1.20.1 (Forge, Fabric)</option>
                  <option value="1.21.1">1.21.1 (NeoForge, Fabric)</option>
                </select>
              </label>
              <label>
                <span className="label">퀘스트 언어</span>
                <select value={settings.lang} onChange={(e) => changeSettings({ lang: e.target.value as Settings["lang"] })}>
                  <option value="ko">한국어</option>
                  <option value="en">English</option>
                </select>
              </label>
              <label>
                <span className="label">챕터당 퀘스트 최대 {settings.maxQuests}개</span>
                <input
                  type="range"
                  min={5}
                  max={60}
                  step={5}
                  value={settings.maxQuests}
                  onChange={(e) => changeSettings({ maxQuests: +e.target.value })}
                />
              </label>
              <label>
                <span className="label">보상</span>
                <select value={settings.reward} onChange={(e) => changeSettings({ reward: e.target.value as Settings["reward"] })}>
                  <option value="low">적게</option>
                  <option value="normal">보통</option>
                  <option value="high">넉넉하게</option>
                </select>
              </label>
              <label>
                <span className="label">설명 스타일</span>
                <select value={settings.style} onChange={(e) => changeSettings({ style: e.target.value as Settings["style"] })}>
                  <option value="mixed">섞어서 (이야기, 도전, 농담, 팁)</option>
                  <option value="story">서사적 (챕터 하나가 한 이야기)</option>
                  <option value="guide">설명 (용도와 만드는 법)</option>
                  <option value="humor">유머</option>
                </select>
              </label>
            </div>
            <div className="row">
              <label>
                <span className="label">AI</span>
                <select value={ai.provider} onChange={(e) => changeAi({ provider: e.target.value, key: "", model: "" })}>
                  {Object.entries(AI_PROVIDERS).map(([id, p]) => (
                    <option key={id} value={id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="label">내 {AI_PROVIDERS[ai.provider]?.label} API 키</span>
                <input
                  type="password"
                  autoComplete="off"
                  placeholder={AI_PROVIDERS[ai.provider]?.placeholder}
                  value={ai.key}
                  onChange={(e) => changeAi({ key: e.target.value.trim() })}
                />
              </label>
              <label>
                <span className="label">모델 (비우면 기본)</span>
                <input value={ai.model} placeholder={AI_PROVIDERS[ai.provider]?.model} onChange={(e) => changeAi({ model: e.target.value.trim() })} />
              </label>
            </div>
            <p className="muted hint">
              {AI_PROVIDERS[ai.provider]?.note} 키는{" "}
              <a href={AI_PROVIDERS[ai.provider]?.keyUrl} target="_blank" rel="noreferrer">
                여기
              </a>
              에서 받아요. 키는 이 브라우저에만 저장하고, AI를 부를 때만 서버를 거쳐 그 회사로 보내요. 비워 두면 AI 없이 만들어요.
            </p>
            <button className="primary" disabled={busy || !picked.size} onClick={makeQuests}>
              {chapters.length ? "퀘스트 다시 만들기" : "퀘스트 만들기"}
            </button>
          </div>
        </section>
      )}

      {!chapter && activity?.title.startsWith("퀘스트") && (
        <section aria-labelledby="s4">
          <h2 id="s4" className="step">4. 다듬기</h2>
          <MapSkeleton />
        </section>
      )}

      {chapter && (
        <section aria-labelledby="s4">
          <h2 id="s4" className="step">4. 다듬기</h2>
          <div className="toolbar">
            <button onClick={() => undo()} disabled={!history.current.past.length} title="Ctrl+Z">
              되돌리기
            </button>
            <button onClick={() => undo(true)} disabled={!history.current.future.length} title="Ctrl+Shift+Z">
              다시 하기
            </button>
            <button
              onClick={() => {
                const quests = chapter.quests.map((q) => ({ ...q }));
                layout(quests);
                updateChapter(active, { ...chapter, quests });
              }}
            >
              자동 정렬
            </button>
            {chapters.length > 1 && (
              <>
                <button disabled={active === 0} onClick={() => moveChapter(-1)}>
                  챕터 앞으로
                </button>
                <button disabled={active === chapters.length - 1} onClick={() => moveChapter(1)}>
                  챕터 뒤로
                </button>
              </>
            )}
          </div>
          {chapters.length > 1 && (
            <div className="tabs" role="tablist">
              {chapters.map((c, i) => (
                <button key={c.id} role="tab" aria-selected={i === active} onClick={() => setActive(i)}>
                  {c.title} <span className="muted">{c.quests.length}</span>
                </button>
              ))}
            </div>
          )}
          <QuestMap
            key={chapter.id}
            chapter={chapter}
            lookup={lookup}
            onChange={(c) => updateChapter(active, c)}
            addable={addable}
            items={items}
            recipesFor={recipesFor}
            others={chapters.filter((_, i) => i !== active)}
            onRewrite={(q, ask) => rewrite(chapter, q, ask)}
            onAdd={(k, t) => addQuest(active, k, t)}
          />
        </section>
      )}

      {chapters.length > 0 && (
        <section aria-labelledby="s5">
          <h2 id="s5" className="step">5. 내보내기</h2>
          <div className="panel form">
            <fieldset>
              <legend className="label">팩에 퀘스트가 이미 있나요?</legend>
              <label className="check">
                <input type="radio" name="book" checked={!newBook} onChange={() => setNewBook(false)} />
                있어요. 기존 퀘스트에 챕터만 추가할게요
              </label>
              <label className="check">
                <input type="radio" name="book" checked={newBook} onChange={() => setNewBook(true)} />
                없어요. 퀘스트북을 새로 만들게요
              </label>
            </fieldset>
            <button className="primary" onClick={download}>
              퀘스트 zip 받기
            </button>
            <p className="muted">
              zip을 인스턴스 폴더(<code>mods</code> 폴더가 있는 곳)에 풀면 <code>config/ftbquests/quests/</code> 안에 들어가요. 기존 챕터는
              건드리지 않아요. 게임을 다시 켜거나 월드에 다시 들어가면 퀘스트북에 보여요.
            </p>
          </div>
        </section>
      )}
    </main>
    {/* outside <main>: the book theme's drop-shadow filter would otherwise trap position: fixed */}
    <Hotbar theme={theme} onPick={pickTheme} progress={xp} />
    </>
  );
}
