// Prompt pieces shared by /api/quests and /api/rewrite, so one rewritten quest sounds like the rest of its chapter.
export const SUBTITLE_RULES = `- subtitle: one hook line under the title. Make it hit: a boast, a promise, a warning, a line of lore.
  It may break the polite register: a short fragment or a blunt statement works best.
  Style reference only, never reuse these lines: anti-materiel rifle "무엇이든 누구든, 한 방이면 충분해" / furnace "불을 다루는 자가 살아남는다"
  Never just restate the item name or explain the recipe here.`;
export const languageOf = (lang: string) =>
  lang === "en"
    ? "English"
    : "Korean. Description lines use polite 해요체 endings (-해요, -예요, -세요), never 반말 (-다, -해, -자, -야). Titles stay short noun phrases; the subtitle hook may break the register";

// Description rules per style the author picked. Every style keeps the how-to hint short and last.
export const DESCRIPTION_RULES: Record<string, string> = {
  mixed: `- description: rotate the voice from quest to quest, never two in a row the same:
  story (a scrap of lore, someone who used it), direct challenge to the player, dry humor, plain field tip.
  Vary the length too: some quests get one line, some three. Not every quest needs a how-to line;
  when there is one, keep it short and last.`,
  story: `- description: narrative. 2-3 lines of lore told as one story across the chapter: who built it, what happened,
  why the player needs it now. Early quests set the scene, the deepest ones are the climax.
  End with one short line on how to make it.`,
  guide: `- description: a clear guide, no lore. 2-3 lines: what it does, why the player wants it at this point,
  and how to make it (station, key materials) or what it unlocks next.`,
  humor: `- description: funny. 1-3 lines of dry, self-aware humor about the item or the grind to get it;
  jokes a Minecraft player gets. End with one short line on how to make it.`,
};
export const descriptionRules = (style: string) => DESCRIPTION_RULES[style] ?? DESCRIPTION_RULES.mixed;
