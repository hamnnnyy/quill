// "Try it without a jar": a small vanilla progression and a hand-written chapter for it,
// so a first visit shows the map, editor and export before anyone hunts for a mod jar or an API key.
import { buildChapter, buildTree, layout, type QuestText } from "./tree.ts";
import type { Recipe } from "./types.ts";

const r = (result: string, ings: [string, number][], station = "crafting_table", count = 1): Recipe => ({
  result,
  result_variant: "",
  result_count: count,
  station,
  ingredients: ings.map(([id, n]) => ({ id: id.startsWith("#") ? id : `minecraft:${id}`, count: n })),
  source: "demo",
});

export const DEMO_RECIPES: Recipe[] = [
  r("minecraft:oak_planks", [["oak_log", 1]], "crafting_table", 4),
  r("minecraft:stick", [["oak_planks", 2]], "crafting_table", 4),
  r("minecraft:crafting_table", [["oak_planks", 4]]),
  r("minecraft:wooden_pickaxe", [["oak_planks", 3], ["stick", 2]]),
  r("minecraft:stone_pickaxe", [["cobblestone", 3], ["stick", 2]]),
  r("minecraft:furnace", [["cobblestone", 8]]),
  r("minecraft:iron_ingot", [["raw_iron", 1]], "furnace"),
  r("minecraft:iron_pickaxe", [["iron_ingot", 3], ["stick", 2]]),
  r("minecraft:bucket", [["iron_ingot", 3]]),
  r("minecraft:shield", [["oak_planks", 6], ["iron_ingot", 1]]),
  r("minecraft:iron_chestplate", [["iron_ingot", 8]]),
  r("minecraft:iron_block", [["iron_ingot", 9]]),
  r("minecraft:anvil", [["iron_block", 3], ["iron_ingot", 4]]),
  r("minecraft:diamond_pickaxe", [["diamond", 3], ["stick", 2]]),
  r("minecraft:paper", [["sugar_cane", 3]], "crafting_table", 3),
  r("minecraft:book", [["paper", 3], ["leather", 1]]),
  r("minecraft:enchanting_table", [["book", 1], ["diamond", 2], ["obsidian", 4]]),
  r("minecraft:stone", [["cobblestone", 1]], "furnace"),
  r("minecraft:smooth_stone", [["stone", 1]], "furnace"),
  r("minecraft:blast_furnace", [["furnace", 1], ["iron_ingot", 5], ["smooth_stone", 3]]),
  r("minecraft:blaze_powder", [["blaze_rod", 1]], "crafting_table", 2),
  r("minecraft:brewing_stand", [["blaze_rod", 1], ["cobblestone", 3]]),
  r("minecraft:ender_eye", [["ender_pearl", 1], ["blaze_powder", 1]]),
  r("minecraft:netherite_ingot", [["netherite_scrap", 4], ["gold_ingot", 4]]),
  r("minecraft:netherite_pickaxe", [["diamond_pickaxe", 1], ["netherite_ingot", 1], ["netherite_upgrade_smithing_template", 1]], "smithing_table"),
];

const q = (key: string, title: string, subtitle: string, description: string[], xp: number, rewardItem?: string, rewardCount?: number): QuestText => ({
  key: `minecraft:${key}`,
  title,
  subtitle,
  description,
  xp,
  rewardItem: rewardItem && `minecraft:${rewardItem}`,
  rewardCount,
});

const TEXTS: QuestText[] = [
  q("crafting_table", "첫 작업대", "모든 것은 나무 한 그루에서 시작된다", ["맨손으로 할 수 있는 건 여기까지예요.", "원목을 판자로 바꾸고, 판자 네 개로 만들어요."], 10, "oak_log", 8),
  q("wooden_pickaxe", "나무 곡괭이", "허접해 보여도 첫 번째 열쇠", ["돌을 캐려면 이게 있어야 해요."], 15),
  q("stone_pickaxe", "돌 곡괭이", "이제 좀 단단해졌다", ["철광석은 나무로는 안 캐져요. 돌로 바꿔 쥘 시간이에요."], 20, "torch", 16),
  q("furnace", "화로", "불을 다루는 자가 살아남는다", ["&6조약돌 여덟 개&r면 충분해요.", "광석을 녹이고, 고기를 굽고, 밤을 버텨요."], 25, "coal", 8),
  q("iron_pickaxe", "철 곡괭이", "진짜 모험은 여기서부터", ["다이아몬드는 철 곡괭이부터 캐져요. 동굴 깊은 곳으로 가 봐요."], 40, "bread", 8),
  q("bucket", "양동이", "물 한 바가지가 목숨을 구한다", ["용암 위로 떨어질 때 기억나면 좋겠네요."], 30),
  q("shield", "방패", "스켈레톤 화살? 이제 웃긴다", ["우클릭으로 막아요. 크리퍼 폭발도 막아 줘요."], 30),
  q("iron_chestplate", "철 흉갑", "맞아도 쓰러지지 않는 법", ["철 주괴 여덟 개. 아깝다는 생각이 들면 아직 덜 맞아 본 거예요."], 40),
  q("blast_furnace", "용광로", "두 배 빠르게, 두 배 뜨겁게", ["광석만큼은 화로보다 두 배 빨리 녹여요."], 45),
  q("anvil", "모루", "부서진 곡괭이는 버리지 않는다", ["수리하고, 합치고, 이름도 붙여요."], 50),
  q("diamond_pickaxe", "다이아몬드 곡괭이", "흑요석이 길을 비킨다", ["&b다이아몬드 세 개&r. 손이 떨려도 괜찮아요."], 80, "obsidian", 4),
  q("enchanting_table", "마법 부여대", "책 한 권, 무한한 가능성", ["경험치를 힘으로 바꾸는 곳이에요.", "주변에 책장을 두면 더 강한 마법이 나와요."], 100, "lapis_lazuli", 16),
  q("brewing_stand", "양조기", "네더에서 가져온 불꽃", ["블레이즈 막대는 네더 요새에서만 구해요. 화염 저항 물약부터 챙겨요."], 90),
  q("ender_eye", "엔더의 눈", "던지면 길을 알려 준다", ["열두 개쯤 모아 두면 엔드 차원으로 가는 문을 찾을 수 있어요."], 120, "ender_pearl", 4),
  q("netherite_pickaxe", "네더라이트 곡괭이", "용암도 태우지 못한다", ["고대 잔해를 녹여 다이아몬드 곡괭이를 한 번 더 단련해요.", "&l여기까지 왔다면 진짜예요.&r"], 200),
];

// Vanilla stations (furnace, smithing table) aren't quest dependencies in the recipe tree, so the
// demo's story order is drawn by hand on top of what the recipes give.
const EXTRA_DEPS: Record<string, string[]> = {
  wooden_pickaxe: ["crafting_table"],
  stone_pickaxe: ["wooden_pickaxe"],
  furnace: ["wooden_pickaxe"],
  iron_pickaxe: ["furnace", "stone_pickaxe"],
  bucket: ["furnace"],
  shield: ["furnace"],
  iron_chestplate: ["furnace"],
  blast_furnace: ["furnace"],
  anvil: ["iron_pickaxe"],
  diamond_pickaxe: ["iron_pickaxe"],
  enchanting_table: ["diamond_pickaxe"],
  brewing_stand: ["diamond_pickaxe"],
  ender_eye: ["brewing_stand"],
};

export function demo() {
  const tree = buildTree(DEMO_RECIPES);
  const chapter = buildChapter({ id: "minecraft", name: "바닐라 생존 (예시)" }, tree, TEXTS, {
    title: "바닐라 생존 (예시)",
    subtitle: "나무 한 그루에서 엔드 차원 문턱까지",
  });
  const idOf = new Map(chapter.quests.map((q) => [q.key, q.id]));
  for (const q of chapter.quests) {
    const extra = (EXTRA_DEPS[q.key.replace("minecraft:", "")] ?? []).map((k) => idOf.get(`minecraft:${k}`)!);
    q.deps = [...new Set([...q.deps, ...extra])];
  }
  layout(chapter.quests);
  return { recipes: DEMO_RECIPES, chapter };
}
