import type { Task } from "@/lib/types";

// Kinds of quests the editor can add or switch to besides "get this item". icon: what the map shows.
export const TASKS: { type: Task["type"]; label: string; icon: string; make: () => Task }[] = [
  { type: "kill", label: "몹 처치", icon: "minecraft:iron_sword", make: () => ({ type: "kill", entity: "minecraft:zombie", value: 10 }) },
  { type: "dimension", label: "차원 가기", icon: "minecraft:obsidian", make: () => ({ type: "dimension", dimension: "minecraft:the_nether" }) },
  { type: "structure", label: "구조물 찾기", icon: "minecraft:compass", make: () => ({ type: "structure", structure: "#minecraft:village" }) },
  { type: "biome", label: "바이옴 찾기", icon: "minecraft:grass_block", make: () => ({ type: "biome", biome: "minecraft:desert" }) },
  { type: "checkmark", label: "체크 표시 (직접 눌러 끝내기)", icon: "minecraft:writable_book", make: () => ({ type: "checkmark" }) },
];

// Suggestions only: modded ids can be typed in.
export const SUGGEST = {
  entity: ["zombie", "skeleton", "creeper", "spider", "enderman", "witch", "slime", "pillager", "ravager", "blaze", "ghast", "piglin_brute", "wither_skeleton", "elder_guardian", "warden", "wither", "ender_dragon"].map((x) => `minecraft:${x}`),
  dimension: ["overworld", "the_nether", "the_end"].map((x) => `minecraft:${x}`),
  structure: ["#minecraft:village", "minecraft:stronghold", "minecraft:fortress", "minecraft:bastion_remnant", "minecraft:end_city", "minecraft:monument", "minecraft:mansion", "minecraft:ancient_city", "minecraft:trial_chambers"],
  biome: ["desert", "jungle", "badlands", "mushroom_fields", "deep_dark", "cherry_grove", "ice_spikes", "nether_wastes", "soul_sand_valley"].map((x) => `minecraft:${x}`),
};

export function taskText(t: Task, label: (id: string) => string) {
  if (t.type === "kill") return `${label(t.entity)} ${t.value}마리 처치`;
  if (t.type === "dimension") return `${label(t.dimension)} 차원에 가기`;
  if (t.type === "structure") return `${label(t.structure)} 찾기`;
  if (t.type === "biome") return `${label(t.biome)} 바이옴 찾기`;
  return "직접 눌러서 끝내기";
}
