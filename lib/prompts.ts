// Prompt pieces shared by /api/quests and /api/rewrite, so one rewritten quest sounds like the rest of its chapter.
export const SUBTITLE_RULES = `- subtitle: one hook line under the title. Make it hit: a boast, a promise, a warning, a line of lore.
  It may break the polite register: a short fragment or a blunt statement works best.
  Style reference only, never reuse these lines: anti-materiel rifle "무엇이든 누구든, 한 방이면 충분해" / furnace "불을 다루는 자가 살아남는다"
  Never just restate the item name or explain the recipe here.`;
export const languageOf = (lang: string) => (lang === "en" ? "English" : "Korean (casual, friendly 해요체)");
