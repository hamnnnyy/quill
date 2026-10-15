// Minecraft formatting codes as FTB Library reads quest text: &6 gold, &l bold, &r reset ... (§ works too).
export const COLORS: Record<string, string> = {
  "0": "#000000", "1": "#0000aa", "2": "#00aa00", "3": "#00aaaa", "4": "#aa0000", "5": "#aa00aa", "6": "#ffaa00", "7": "#aaaaaa",
  "8": "#555555", "9": "#5555ff", a: "#55ff55", b: "#55ffff", c: "#ff5555", d: "#ff55ff", e: "#ffff55", f: "#ffffff",
};

export type Run = { text: string; color?: string; bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean };

export function parseMc(s: string): Run[] {
  const runs: Run[] = [];
  let style: Omit<Run, "text"> = {};
  for (const part of s.split(/([&§][0-9a-fk-or])/i)) {
    const code = part.match(/^[&§]([0-9a-fk-or])$/i)?.[1].toLowerCase();
    if (!code) {
      if (part) runs.push({ text: part, ...style });
    } else if (COLORS[code]) style = { color: COLORS[code] }; // a color resets bold/italic, as in game
    else if (code === "r") style = {};
    else if (code === "l") style = { ...style, bold: true };
    else if (code === "o") style = { ...style, italic: true };
    else if (code === "n") style = { ...style, underline: true };
    else if (code === "m") style = { ...style, strike: true };
    // &k (obfuscated) is shown as plain text
  }
  return runs;
}
