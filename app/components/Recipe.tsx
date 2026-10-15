import type { Recipe } from "@/lib/types";
import { Slot, type Lookup } from "./Slot";

// One recipe as a crafting grid. With onPick, ingredients are buttons that open their own recipe.
export function RecipeCard({ r, lookup, onPick }: { r: Recipe; lookup: Lookup; onPick?: (id: string) => void }) {
  const result = r.result_variant || r.result;
  return (
    <article className="panel recipe" title={r.source}>
      <h3>
        {lookup.label(result)}
        {r.result_count > 1 && <span className="muted"> ×{r.result_count}</span>}
      </h3>
      <div className="craft">
        <div className="grid">
          {r.ingredients.map((g, j) =>
            onPick ? (
              <button key={j} className="slot-button" onClick={() => onPick(g.id)} aria-label={`${lookup.label(g.id)} 조합법 보기`}>
                <Slot id={g.id} count={g.count} lookup={lookup} />
              </button>
            ) : (
              <Slot key={j} id={g.id} count={g.count} lookup={lookup} />
            ),
          )}
        </div>
        <span className="arrow" aria-hidden />
        <Slot id={result} count={r.result_count} big lookup={lookup} />
      </div>
      <p className="muted">{lookup.label(r.station)}에서 만들어요.</p>
    </article>
  );
}
