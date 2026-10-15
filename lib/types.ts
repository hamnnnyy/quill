export type RawRecipe = { file: string; json: unknown };

export type Recipe = {
  result: string; // real item id, e.g. tacz:modern_kinetic_gun
  result_variant: string; // id that tells NBT variants apart, e.g. tacz:ak47; empty for plain items
  result_count: number;
  station: string;
  ingredients: { id: string; count: number }[]; // tags start with #
  source: string;
  nbt?: Record<string, string>; // NBT that makes result into result_variant
  ai?: boolean; // came from Gemini, so its ids need checking
};

export type Mod = {
  id: string; // mod id or file name, also the chapter file name
  name: string;
  recipes: RawRecipe[];
};

export type Quest = {
  id: string; // 16 hex chars, FTB Quests object id
  key: string; // tree node key: result_variant || result
  item: string;
  nbt?: Record<string, string>;
  count: number;
  title: string;
  subtitle?: string; // one-line hook under the title
  description: string[];
  x: number;
  y: number;
  deps: string[]; // quest ids
  xp: number;
  rewardItem?: string;
  rewardCount?: number;
};

export type Chapter = {
  id: string;
  filename: string;
  title: string;
  subtitle: string;
  icon: string;
  quests: Quest[];
};

export type McVersion = "1.20.1" | "1.21.1";

export type Settings = {
  version: McVersion;
  lang: "ko" | "en";
  maxQuests: number;
  reward: "low" | "normal" | "high";
};
