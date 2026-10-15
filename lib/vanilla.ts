// Vanilla icons and Korean names, fetched at runtime from public mirrors pinned to one commit each.
// Never bundled: the textures and translations are Mojang's.
const ICONS =
  "https://raw.githubusercontent.com/PrismarineJS/minecraft-assets/6c571b0825ee27b81f01127c2bd0d4ba2c89abb9/data/1.20.2/texture_content.json";
const KO_LANG =
  "https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/af628ec0e7977ec2f07c917d51413b4618a8cfcc/assets/minecraft/lang/ko_kr.json";

let icons: Promise<Map<string, string>> | undefined;
export function vanillaIcons() {
  icons ??= fetch(ICONS)
    .then((r) => r.json() as Promise<{ name: string; texture: string | null }[]>)
    .then((list) => new Map(list.filter((x) => x.texture).map((x) => [`minecraft:${x.name}`, x.texture!])))
    .catch(() => new Map<string, string>()); // offline: slots fall back to text labels
  return icons;
}

let names: Promise<Map<string, string>> | undefined;
export function vanillaNames() {
  names ??= fetch(KO_LANG)
    .then((r) => r.json() as Promise<Record<string, string>>)
    .then((lang) => {
      const out = new Map<string, string>();
      for (const [k, v] of Object.entries(lang)) {
        const m = k.match(/^(?:item|block)\.minecraft\.([a-z0-9_]+)$/);
        if (m) out.set(`minecraft:${m[1]}`, v);
      }
      return out;
    })
    .catch(() => new Map<string, string>());
  return names;
}
