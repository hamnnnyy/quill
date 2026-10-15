import { Unzip, UnzipInflate, strFromU8 } from "fflate";
import { emptyExtract, merge, readJar, type Extract } from "./jar.ts";
import { parseSnbt } from "./snbt.ts";
import type { McVersion, RawRecipe } from "./types";

// A modpack zip: an instance folder, a CurseForge export (manifest.json + overrides/) or a .mrpack.
// Before generating anything we look for what the pack already has: KubeJS recipe edits and FTB Quests.

export type ExistingQuests = {
  chapters: { id: string; filename: string; title: string; quests: number }[];
  items: Set<string>; // quest task items, as tree keys (NBT variants by their id, e.g. tacz:ak47)
  version: McVersion; // 1.21 keeps text in quests/lang/
};

export type PackInfo = {
  jars: number;
  scripts: { path: string; text: string }[];
  datapackRecipes: number;
  existing?: ExistingQuests;
  mcVersion?: string;
  listedMods?: number; // mods named in manifest.json / modrinth.index.json, whose jars aren't in the zip
};

const JAR = /(^|\/)mods\/[^/]+\.jar$/;
const SCRIPT = /(^|\/)kubejs\/server_scripts\/.+\.js$/;
const DATAPACK = /(^|\/)kubejs\/data\/[^/]+\/recipes?\/.+\.json$/;
const QUESTS = /(^|\/)config\/ftbquests\/quests\/(.+\.snbt)$/;
const MANIFEST = /^(manifest\.json|modrinth\.index\.json)$/;
const VARIANT_KEYS = ["GunId", "AmmoId", "AttachmentId"]; // NBT ids that name data-driven items (TACZ)

export function readPack(bytes: Uint8Array, onJar: (name: string) => void): { extract: Extract; info: PackInfo } {
  const extract = emptyExtract();
  const info: PackInfo = { jars: 0, scripts: [], datapackRecipes: 0 };
  const datapack: RawRecipe[] = [];
  const questFiles = new Map<string, unknown>();

  // Streams entries one by one, so a pack with 2GB of jars never holds them all in memory at once.
  const uz = new Unzip((file) => {
    const name = file.name;
    if (!(JAR.test(name) || SCRIPT.test(name) || DATAPACK.test(name) || QUESTS.test(name) || MANIFEST.test(name))) return;
    const chunks: Uint8Array[] = [];
    file.ondata = (err, data, final) => {
      if (err) throw err;
      chunks.push(data);
      if (!final) return;
      const all = concat(chunks);
      if (JAR.test(name)) {
        onJar(name.split("/").pop()!);
        merge(extract, readJar(all, name.split("/").pop()!));
        info.jars++;
      } else if (SCRIPT.test(name)) {
        info.scripts.push({ path: name.replace(/^.*?kubejs\//, "kubejs/"), text: strFromU8(all) });
      } else if (DATAPACK.test(name)) {
        try {
          datapack.push({ file: name.replace(/^.*?kubejs\//, "kubejs/"), json: JSON.parse(strFromU8(all)) });
        } catch {}
      } else if (QUESTS.test(name)) {
        try {
          questFiles.set(name.match(QUESTS)![2], parseSnbt(strFromU8(all)));
        } catch {} // a broken chapter file shouldn't stop the rest
      } else {
        readManifest(JSON.parse(strFromU8(all)), info);
      }
    };
    file.start();
  });
  uz.register(UnzipInflate);
  uz.push(bytes, true);

  if (datapack.length) {
    extract.mods.push({ id: "kubejs", name: "KubeJS 데이터팩", recipes: datapack });
    info.datapackRecipes = datapack.length;
  }
  if (questFiles.size) info.existing = readExisting(questFiles);
  return { extract, info };
}

function readManifest(j: Record<string, unknown>, info: PackInfo) {
  // CurseForge: { minecraft: { version }, files: [...] }   Modrinth: { dependencies: { minecraft }, files: [...] }
  const mc = (j.minecraft as { version?: string })?.version ?? (j.dependencies as { minecraft?: string })?.minecraft;
  if (mc) info.mcVersion = mc;
  if (Array.isArray(j.files)) info.listedMods = j.files.length;
}

type Snbt = Record<string, unknown>;

export function taskKey(item: unknown): string | undefined {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object") return undefined;
  const it = item as Snbt;
  const nbt = (it.tag ?? (it.components as Snbt)?.["minecraft:custom_data"]) as Snbt | undefined;
  for (const k of VARIANT_KEYS) if (typeof nbt?.[k] === "string") return nbt[k] as string;
  return typeof it.id === "string" ? it.id : undefined;
}

function readExisting(files: Map<string, unknown>): ExistingQuests {
  const lang = (files.get("lang/en_us.snbt") ?? {}) as Snbt;
  const hasLang = [...files.keys()].some((k) => k.startsWith("lang/"));
  const out: ExistingQuests = { chapters: [], items: new Set(), version: hasLang ? "1.21.1" : "1.20.1" };
  for (const [path, data] of files) {
    if (!path.startsWith("chapters/")) continue;
    const c = data as Snbt;
    const quests = Array.isArray(c.quests) ? (c.quests as Snbt[]) : [];
    for (const q of quests)
      for (const t of (q.tasks as Snbt[]) ?? []) {
        const key = taskKey(t.item);
        if (key) out.items.add(key);
      }
    const id = String(c.id ?? "");
    out.chapters.push({
      id,
      filename: String(c.filename ?? path.replace(/^chapters\/|\.snbt$/g, "")),
      title: String(c.title ?? lang[`chapter.${id}.title`] ?? c.filename ?? path),
      quests: quests.length,
    });
  }
  return out;
}

function concat(chunks: Uint8Array[]) {
  if (chunks.length === 1) return chunks[0];
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

// "1.21.1" / "1.21.4" -> 1.21.1 output format, anything 1.20.x -> 1.20.1
export function outputVersion(mc: string | undefined): McVersion | undefined {
  if (!mc) return undefined;
  if (mc.startsWith("1.21")) return "1.21.1";
  if (mc.startsWith("1.20")) return "1.20.1";
  return undefined;
}
