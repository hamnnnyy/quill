// Quest text without AI: a hook line picked by what the item is, and a description whose voice
// rotates (story, challenge, humor, tip) so a chapter doesn't read like one long manual.
import type { Node } from "./tree.ts";

type Lang = "ko" | "en";
type Kind = "station" | "gun" | "weapon" | "ammo" | "tool" | "armor" | "food" | "late" | "other";

const KIND_RULES: [Kind, RegExp][] = [
  ["ammo", /ammo|bullet|cartridge|shell|_round|magazine/],
  ["gun", /gun|rifle|pistol|revolver|shotgun|sniper|smg|carbine|launcher/],
  ["weapon", /sword|bow|crossbow|spear|dagger|katana|mace|trident|blade/],
  ["tool", /pickaxe|shovel|_hoe|_axe|drill|wrench|hammer|saw|shears|knife/],
  ["armor", /helmet|chestplate|leggings|boots|armor|shield/],
  ["food", /food|pie|soup|stew|bread|cake|juice|salad|meal|sandwich|cookie|rice|noodle|burger|tea/],
];

const HOOKS: Record<Kind, Record<Lang, string[]>> = {
  station: {
    ko: ["모든 것은 여기서 시작된다", "작업대 하나가 세상을 바꾼다", "이걸 놓는 순간, 새 장이 열린다", "장인의 자리는 비워 두지 않는 법"],
    en: ["Everything starts here", "One bench changes the world", "Place it, and a new chapter opens", "A master's seat never stays empty"],
  },
  gun: {
    ko: ["먼저 쏘는 쪽이 살아남는다", "말은 짧게, 방아쇠는 가볍게", "적에게는 악몽, 너에게는 자장가", "밤이 더는 두렵지 않다"],
    en: ["Whoever shoots first goes home", "Talk less, pull lighter", "A nightmare for them, a lullaby for you", "The night isn't scary anymore"],
  },
  weapon: {
    ko: ["날이 선 만큼 마음도 든든하다", "휘두르는 순간 길이 열린다", "가까이 오면 후회하게 될 거다"],
    en: ["A sharp edge, a steady heart", "Swing once, and the path clears", "Get close and regret it"],
  },
  ammo: {
    ko: ["총은 탄이 있어야 총이다", "넉넉하게. 언제나 넉넉하게.", "빈 탄창만큼 외로운 건 없다", "한 발 한 발이 목숨값이다"],
    en: ["A gun is only a gun with rounds", "Plenty. Always plenty.", "Nothing is lonelier than an empty mag", "Every round is a life saved"],
  },
  tool: {
    ko: ["더 빨리, 더 깊이", "땀 대신 기술로", "좋은 도구는 시간을 번다"],
    en: ["Faster, deeper", "Skill instead of sweat", "Good tools buy time"],
  },
  armor: {
    ko: ["맞아도 쓰러지지 않는 법", "크리퍼 앞에서도 당당하게", "단단함은 배신하지 않는다"],
    en: ["How to take a hit and stay up", "Stand tall, even before a creeper", "Toughness never betrays you"],
  },
  food: {
    ko: ["배가 불러야 모험도 한다", "허기는 가장 무서운 몬스터", "오늘 저녁 메뉴는 정해졌다"],
    en: ["No adventure on an empty stomach", "Hunger is the scariest mob", "Tonight's dinner is decided"],
  },
  late: {
    ko: ["여기까지 왔다면 진짜다", "정점에 선 자만 손에 넣는다", "긴 여정의 끝에서 기다리던 것"],
    en: ["Made it this far? You're the real deal", "Only those at the top hold this", "What waited at the end of the road"],
  },
  other: {
    ko: ["작은 부품이 큰 기계를 만든다", "다음 단계로 가는 열쇠", "모아 두면 언젠가 쓴다", "여기서 멈추면 아쉽다", "평범해 보여도 없으면 안 된다"],
    en: ["Small parts build big machines", "The key to the next step", "Stockpile it. You'll need it.", "Stopping here would be a shame", "Plain-looking, but you can't do without it"],
  },
};

const VOICES: Record<Lang, string[][]> = {
  ko: [
    // story
    ["어느 떠돌이 기술자는 이것 하나로 마을을 지켰다는 이야기가 있어요.", "설계도는 오래된 상자 바닥에서 발견됐다고 해요.", "처음 만든 사람은 사흘 밤을 새웠대요."],
    // challenge
    ["재료는 다 모았나요? 그럼 지금이에요.", "아직 없다고요? 서둘러요.", "만들 수 있겠어요? 한번 보여 주세요."],
    // humor
    ["만들고 나면 왜 이제야 만들었나 싶을 거예요.", "친구에게 자랑해도 돼요. 아마 부러워할 거예요.", "만들면 기분이 좋아져요. 과학적으로 증명된 건 아니지만요."],
  ],
  en: [
    ["They say a wandering tinkerer saved a village with just one of these.", "The blueprint turned up at the bottom of an old chest.", "Whoever made the first one didn't sleep for three nights."],
    ["Got the materials? Then it's time.", "Still don't have one? Hurry up.", "Think you can make it? Show me."],
    ["Once you have it, you'll wonder why you waited.", "Go ahead and show it off. They'll be jealous.", "Making one improves your mood. Not scientifically proven."],
  ],
};

function kindOf(n: Node, stations: Set<string>, maxDepth: number): Kind {
  if (stations.has(n.key)) return "station";
  if (n.nbt?.GunId) return "gun";
  if (n.nbt?.AmmoId) return "ammo";
  const path = n.key.split(":").pop()!;
  const hit = KIND_RULES.find(([, re]) => re.test(path));
  if (hit) return hit[0];
  return maxDepth > 2 && n.depth >= maxDepth ? "late" : "other";
}

// Stable per item, but skips lines this chapter already used while unused ones remain.
function pick(pool: string[], seed: string, used: Set<string>) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) | 0;
  const start = Math.abs(h) % pool.length;
  for (let i = 0; i < pool.length; i++) {
    const line = pool[(start + i) % pool.length];
    if (!used.has(line)) return used.add(line), line;
  }
  return pool[start];
}

export function fallbackText(keys: string[], tree: Map<string, Node>, label: (id: string) => string, lang: Lang) {
  const maxDepth = Math.max(0, ...keys.map((k) => tree.get(k)!.depth));
  const stations = new Set([...tree.values()].map((o) => o.station));
  const used = new Set<string>();
  return keys.map((key, i) => {
    const n = tree.get(key)!;
    const kind = kindOf(n, stations, maxDepth);
    const tip = lang === "en" ? `Made at: ${label(n.station)}.` : `${label(n.station)}에서 만들어요.`;
    // voice rotates by position: story, challenge, humor, plain tip; the tip line rides along every other quest
    const v = i % 4;
    const description = v === 3 ? [tip] : [pick(VOICES[lang][v], key, used), ...(i % 2 ? [] : [tip])];
    return { key, subtitle: pick(HOOKS[kind][lang], key, used), description };
  });
}
