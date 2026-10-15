"use client";

import { useEffect, useRef, useState } from "react";

// Theme switcher drawn as the Minecraft HUD: hearts, hunger, XP bar and a 9-slot hotbar.
// Slot items pick the theme; 1-3 on the keyboard work like in game. The XP bar fills while Quill works.

export const THEMES = [
  { id: "gui", name: "마인크래프트 GUI", icon: "/theme/grass.png" },
  { id: "book", name: "책과 깃펜", icon: "/theme/book.png" },
  { id: "quest", name: "FTB 퀘스트 맵", icon: "/theme/map.png" },
] as const;

const SLOTS = 9;

export function Hotbar({ theme, onPick, progress }: { theme: string; onPick: (id: string) => void; progress: number }) {
  const [label, setLabel] = useState<string>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  function pick(id: string) {
    onPick(id);
    // Minecraft shows the held item's name above the hotbar for a moment.
    setLabel(THEMES.find((t) => t.id === id)?.name);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setLabel(undefined), 1800);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable]");
      if (e.metaKey || e.ctrlKey || e.altKey || typing) return;
      const t = THEMES[Number(e.key) - 1];
      if (t) pick(t.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <nav className="hud" aria-label="테마">
      <span className={`hud-label${label ? " show" : ""}`} aria-live="polite">
        {label}
      </span>
      <div className="hud-top" aria-hidden>
        <span className="hud-xp" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <div className="hotbar" role="radiogroup" aria-label="테마 고르기 (숫자 키 1-3)">
        {Array.from({ length: SLOTS }, (_, i) => {
          const t = THEMES[i];
          if (!t) return <span key={i} className="hotbar-slot" aria-hidden />;
          return (
            <button
              key={t.id}
              className="hotbar-slot"
              role="radio"
              aria-checked={theme === t.id}
              aria-label={`${i + 1}. ${t.name}`}
              title={t.name}
              onClick={() => pick(t.id)}
            >
              <img src={t.icon} alt="" draggable={false} />
            </button>
          );
        })}
      </div>
    </nav>
  );
}
