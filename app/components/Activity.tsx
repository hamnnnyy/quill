"use client";

import { useEffect, useState } from "react";

export type Job = {
  id: string;
  name: string;
  state: "wait" | "run" | "done" | "plain" | "fail";
  detail?: string;
  retryUntil?: number; // epoch ms; shows a countdown while waiting out a rate limit
};

export type ActivityState = { title: string; hint: string; jobs: Job[]; startedAt: number };

const GLYPH: Record<Job["state"], string> = { wait: "·", run: "", done: "✓", plain: "!", fail: "✕" };
const STATE_LABEL: Record<Job["state"], string> = { wait: "대기", run: "진행 중", done: "완료", plain: "기본 문구", fail: "실패" };

const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// Shown while Quill works: which mod it's on, how long it's taken, and why it's waiting when it is.
export function Activity({ title, hint, jobs, startedAt }: ActivityState) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const finished = jobs.filter((j) => j.state !== "wait" && j.state !== "run").length;
  return (
    <section className="panel activity" aria-live="polite" aria-busy="true">
      <div className="activity-head">
        <span className="quill-mark" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        <b>{title}</b>
        <span className="muted activity-time">{clock(now - startedAt)}</span>
      </div>
      <div className="xp" role="progressbar" aria-valuemin={0} aria-valuemax={jobs.length} aria-valuenow={finished}>
        <span style={{ width: `${jobs.length ? (finished / jobs.length) * 100 : 0}%` }} />
      </div>
      <ol className="jobs">
        {jobs.map((j) => (
          <li key={j.id} className={`job ${j.state}`}>
            <span className="job-glyph" aria-label={STATE_LABEL[j.state]}>
              {j.state === "run" ? <span className="spinner" /> : GLYPH[j.state]}
            </span>
            <span className="job-name">{j.name}</span>
            <span className="muted job-detail">
              {j.retryUntil && j.retryUntil > now ? `${j.detail ?? ""} ${clock(j.retryUntil - now)} 뒤 다시 시도해요` : j.detail}
            </span>
          </li>
        ))}
      </ol>
      {hint && <p className="muted">{hint}</p>}
    </section>
  );
}

// Placeholder map while the first chapter is being written, so step 4 doesn't appear out of nowhere.
export function MapSkeleton() {
  const nodes = [
    [0, 1], [1, 0], [1, 2], [2, 0], [2, 1], [2, 2], [3, 1], [4, 0], [4, 2],
  ];
  return (
    <div className="panel map skeleton" aria-hidden>
      <div className="map-canvas" style={{ width: 5 * 128 + 64, height: 3 * 96 + 64 }}>
        {nodes.map(([x, y], i) => (
          <span key={i} className="slot ghost" style={{ left: 64 + x * 128, top: 48 + y * 96, animationDelay: `${i * 0.12}s` }} />
        ))}
      </div>
    </div>
  );
}
