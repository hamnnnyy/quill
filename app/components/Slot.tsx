import { iconFor } from "@/lib/icons";

export type Lookup = {
  label: (id: string) => string;
  icons: Map<string, string>;
  invented: Set<string>;
};

export const bare = (id: string) => id.replace(/^#/, "");

export function Slot({ id, count, big, lookup }: { id: string; count?: number; big?: boolean; lookup: Lookup }) {
  const name = lookup.label(id);
  const icon = iconFor(id, lookup.icons);
  const cls = ["slot", big && "big", id.startsWith("#") && "tag", lookup.invented.has(bare(id)) && "bad"].filter(Boolean).join(" ");
  return (
    <span className={cls} title={`${name}\n${id}`}>
      {icon ? <img src={icon} alt={name} draggable={false} /> : <span className="slot-text">{name}</span>}
      {count && count > 1 ? <b className="count">{count}</b> : null}
    </span>
  );
}
