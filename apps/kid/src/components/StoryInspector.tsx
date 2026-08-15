import { useState } from "react";
import type { ErrorKind, Skill } from "@numberverse/core";
import type { KothaStory } from "../store";
import { MISCONCEPTION_LABELS, type Strings } from "../i18n";

export default function StoryInspector({ stories, skills, t, lang }: { stories: KothaStory[]; skills: Skill[]; t: Strings; lang: string }) {
  const [kind, setKind] = useState<"all" | ErrorKind>("all");
  const [outcome, setOutcome] = useState<"all" | "wrong" | "correct">("all");
  const kinds: ("all" | ErrorKind)[] = ["all", "misconception", "gap", "fatigue", "guessing", "slip"];
  const kindLabel = (k: "all" | ErrorKind) =>
    k === "all" ? t.kothaFilterAll
      : k === "misconception" ? t.kothaKindMisconception
        : k === "gap" ? t.kothaKindGap
          : k === "fatigue" ? t.kothaKindFatigue
            : k === "guessing" ? t.kothaKindGuessing
              : t.kothaKindSlip;
  const bn = lang === "bn";
  const filtered = stories
    .filter(
      (st) =>
        (kind === "all" || st.errorKind === kind) &&
        (outcome === "all" || (outcome === "wrong" ? !st.outcome : st.outcome)),
    )
    .slice(0, 50);
  return (
    <details className="parent-help kotha-inspector" open>
      <summary>{t.kothaInspector}</summary>
      <p className="kotha-inspector-sub">{t.kothaInspectorSub}</p>
      <div className="kotha-filters" role="group" aria-label={t.kothaInspector}>
        {(["all", "wrong", "correct"] as const).map((o) => (
          <button
            key={o}
            className={`kotha-chip${outcome === o ? " active" : ""}`}
            aria-pressed={outcome === o}
            onClick={() => setOutcome(o)}
          >
            {o === "all" ? t.kothaFilterAll : o === "wrong" ? t.kothaFilterWrong : t.kothaFilterCorrect}
          </button>
        ))}
        {kinds.map((k) => (
          <button
            key={k}
            className={`kotha-chip${kind === k ? " active" : ""}`}
            aria-pressed={kind === k}
            onClick={() => setKind(k)}
          >
            {kindLabel(k)}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="kotha-empty">{t.kothaEmpty}</p>
      ) : (
        <ul className="kotha-list">
          {filtered.map((st) => {
            const gs = skills.find((s) => s.id === st.skillId);
            const misLabel = st.misconceptionCode ? MISCONCEPTION_LABELS[st.misconceptionCode]?.[bn ? "bn" : "en"] : null;
            const reason = typeof st.context?.reason === "string" ? st.context.reason : "";
            return (
              <li key={st.uid} className="kotha-item">
                <span className={`kotha-dot ${st.outcome ? "ok" : "bad"}`} aria-hidden="true">
                  {st.outcome ? "✓" : "✗"}
                </span>
                <span className="kotha-meta">
                  <span className="kotha-name">
                    {gs?.title ?? st.skillId}
                    {gs?.titleBn ? <span className="skill-bn">{gs.titleBn}</span> : null}
                  </span>
                  {gs && (bn ? gs.descriptionBn ?? gs.description : gs.description) ? (
                    <span className="kotha-desc">{bn ? gs.descriptionBn ?? gs.description : gs.description}</span>
                  ) : null}
                  <span className="kotha-line">
                    {st.outcome ? t.kothaCorrect : t.kothaWrong}
                    {st.errorKind ? ` · ${kindLabel(st.errorKind)}` : ""}
                    {misLabel ? ` · ${misLabel}` : ""}
                    {st.action ? ` · ${t.kothaAction}: ${st.action}` : ""}
                  </span>
                  {reason ? <span className="kotha-reason">{reason}</span> : null}
                </span>
                <span className="kotha-ago">{t.kothaAgo(st.ts)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </details>
  );
}
