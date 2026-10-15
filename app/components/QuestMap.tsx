"use client";

import { useRef, useState } from "react";
import type { Chapter, Quest } from "@/lib/types";
import { Slot, type Lookup } from "./Slot";

const S = 64; // px per FTB quest unit
const SNAP = 0.5;

type Props = {
  chapter: Chapter;
  lookup: Lookup;
  onChange: (c: Chapter) => void;
  addable: { key: string; label: string }[];
  onAdd: (key: string) => void;
};

export function QuestMap({ chapter, lookup, onChange, addable, onAdd }: Props) {
  const [selected, setSelected] = useState<string>();
  const drag = useRef<{ id: string; px: number; py: number; x: number; y: number; moved: boolean; bounds: Bounds }>(null);
  const [frozen, setFrozen] = useState<Bounds>();

  const bounds = frozen ?? boundsOf(chapter.quests);
  const pos = (q: Quest) => ({ left: (q.x - bounds.minX + 1) * S, top: (q.y - bounds.minY + 1) * S });
  const byId = new Map(chapter.quests.map((q) => [q.id, q]));
  const quest = selected ? byId.get(selected) : undefined;

  const update = (id: string, patch: Partial<Quest>) =>
    onChange({ ...chapter, quests: chapter.quests.map((q) => (q.id === id ? { ...q, ...patch } : q)) });

  function remove(id: string) {
    setSelected(undefined);
    onChange({
      ...chapter,
      quests: chapter.quests.filter((q) => q.id !== id).map((q) => ({ ...q, deps: q.deps.filter((d) => d !== id) })),
    });
  }

  function down(e: React.PointerEvent, q: Quest) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: q.id, px: e.clientX, py: e.clientY, x: q.x, y: q.y, moved: false, bounds };
    setFrozen(bounds); // keep the origin still while dragging, or the map jumps under the cursor
  }
  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.px) / S;
    const dy = (e.clientY - d.py) / S;
    if (Math.abs(dx) + Math.abs(dy) > 0.1) d.moved = true;
    if (d.moved) update(d.id, { x: snap(d.x + dx), y: snap(d.y + dy) });
  }
  function up() {
    const d = drag.current;
    drag.current = null;
    setFrozen(undefined);
    if (d && !d.moved) setSelected(d.id === selected ? undefined : d.id);
  }
  function nudge(e: React.KeyboardEvent, q: Quest) {
    const step: Record<string, [number, number]> = { ArrowLeft: [-SNAP, 0], ArrowRight: [SNAP, 0], ArrowUp: [0, -SNAP], ArrowDown: [0, SNAP] };
    if (step[e.key]) {
      e.preventDefault();
      update(q.id, { x: q.x + step[e.key][0], y: q.y + step[e.key][1] });
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setSelected(q.id === selected ? undefined : q.id);
    }
  }

  return (
    <div className="map-wrap">
      <div className="panel map" aria-label={`${chapter.title} 퀘스트 맵`}>
        <div className="map-canvas" style={{ width: (bounds.maxX - bounds.minX + 2) * S, height: (bounds.maxY - bounds.minY + 2) * S }}>
          <svg className="map-lines" width="100%" height="100%" aria-hidden>
            {chapter.quests.flatMap((q) =>
              q.deps.map((dep) => {
                const from = byId.get(dep);
                if (!from) return null;
                const a = pos(from);
                const b = pos(q);
                const hot = selected === q.id || selected === dep;
                return <line key={`${dep}-${q.id}`} x1={a.left} y1={a.top} x2={b.left} y2={b.top} className={hot ? "hot" : ""} />;
              }),
            )}
          </svg>
          {chapter.quests.map((q) => (
            <button
              key={q.id}
              className={`node${q.id === selected ? " selected" : ""}`}
              style={pos(q)}
              onPointerDown={(e) => down(e, q)}
              onPointerMove={move}
              onPointerUp={up}
              onKeyDown={(e) => nudge(e, q)}
              aria-pressed={q.id === selected}
              aria-label={q.title}
            >
              <Slot id={q.key} lookup={lookup} />
              <span className="node-title">{q.title}</span>
            </button>
          ))}
        </div>
      </div>

      <aside className="panel editor">
        {quest ? (
          <>
            <label>
              <span className="label">제목</span>
              <input value={quest.title} onChange={(e) => update(quest.id, { title: e.target.value })} />
            </label>
            <label>
              <span className="label">설명 (줄마다 한 문단)</span>
              <textarea
                rows={4}
                value={quest.description.join("\n")}
                onChange={(e) => update(quest.id, { description: e.target.value.split("\n") })}
              />
            </label>
            <div className="row">
              <label>
                <span className="label">필요 개수</span>
                <input type="number" min={1} value={quest.count} onChange={(e) => update(quest.id, { count: Math.max(1, +e.target.value) })} />
              </label>
              <label>
                <span className="label">경험치 보상</span>
                <input type="number" min={0} value={quest.xp} onChange={(e) => update(quest.id, { xp: Math.max(0, +e.target.value) })} />
              </label>
            </div>
            {quest.rewardItem && (
              <div className="reward">
                <span className="label">아이템 보상</span>
                <Slot id={quest.rewardItem} count={quest.rewardCount} lookup={lookup} />
                <button className="link" onClick={() => update(quest.id, { rewardItem: undefined, rewardCount: undefined })}>
                  빼기
                </button>
              </div>
            )}
            <div>
              <span className="label">먼저 끝내야 하는 퀘스트</span>
              <div className="chips">
                {quest.deps.map((d) => (
                  <button key={d} className="chip" onClick={() => update(quest.id, { deps: quest.deps.filter((x) => x !== d) })}>
                    {byId.get(d)?.title} ✕
                  </button>
                ))}
                <select
                  value=""
                  aria-label="선행 퀘스트 추가"
                  onChange={(e) => e.target.value && update(quest.id, { deps: [...quest.deps, e.target.value] })}
                >
                  <option value="">+ 추가</option>
                  {chapter.quests
                    .filter((q) => q.id !== quest.id && !quest.deps.includes(q.id))
                    .map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.title}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <button className="danger" onClick={() => remove(quest.id)}>
              이 퀘스트 삭제
            </button>
          </>
        ) : (
          <>
            <p className="muted">퀘스트를 눌러서 고치세요. 끌어서 옮기거나, 선택한 뒤 방향키로 옮길 수 있어요.</p>
            <label>
              <span className="label">챕터 제목</span>
              <input value={chapter.title} onChange={(e) => onChange({ ...chapter, title: e.target.value })} />
            </label>
            <label>
              <span className="label">챕터 소개</span>
              <input value={chapter.subtitle} onChange={(e) => onChange({ ...chapter, subtitle: e.target.value })} />
            </label>
            {addable.length > 0 && (
              <label>
                <span className="label">퀘스트 추가</span>
                <select value="" onChange={(e) => e.target.value && onAdd(e.target.value)}>
                  <option value="">아이템 고르기</option>
                  {addable.map((a) => (
                    <option key={a.key} value={a.key}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}
      </aside>
    </div>
  );
}

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
function boundsOf(quests: Quest[]): Bounds {
  if (!quests.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const xs = quests.map((q) => q.x);
  const ys = quests.map((q) => q.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}
const snap = (v: number) => Math.round(v / SNAP) * SNAP;
