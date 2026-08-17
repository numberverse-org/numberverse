import type React from "react";
import type { Kid } from "../lib/journey";
import { type Strings } from "../i18n";
import { cancelSpeech } from "../game/speech";
import type { Screen } from "../App";
import { Icon } from "./Icon";

export interface BreakScreenProps {
  kid: Kid;
  t: Strings;
  breakPendingRef: React.MutableRefObject<boolean>;
  breakReturnRef: React.MutableRefObject<"done" | "home">;
  setScreen: (s: Screen) => void;
}

export default function BreakScreen({ kid, t, breakPendingRef, breakReturnRef, setScreen }: BreakScreenProps) {
  const takeBreak = () => {
    breakPendingRef.current = false;
    breakReturnRef.current = "done";
    cancelSpeech();
    setScreen("home");
  };
  const keepGoing = () => {
    breakPendingRef.current = false;
    // #1368 — a break taken from the goal nudge returns home; a post-session
    // break returns to the done screen so the celebration is still there.
    setScreen(breakReturnRef.current);
    breakReturnRef.current = "done";
  };
  return (
    <div className="app">
      <main className="screen break-screen">
        <div className="break-sky" aria-hidden="true">
          {["☁️", "☁️", "⭐", "🌤️", "🕊️", "☁️"].map((e, i) => (
            <span key={i} className={`break-sky-float f${i}`}>{e}</span>
          ))}
        </div>
        <div className="break-mascot" role="img" aria-label="Nova suggesting a break">
          <Icon name="nova" size={96} />
        </div>
        <h1 className="title">{t.breakTitle(kid.name)}</h1>
        <p className="break-body">{t.breakBody}</p>
        <div className="break-stretch" aria-hidden="true">🧘</div>
        <button className="big-btn break-rest-btn" onClick={takeBreak}>
          🦉 {t.breakRest}
        </button>
        <button className="ghost-btn break-go-btn" onClick={keepGoing}>
          {t.breakKeepGoing}
        </button>
      </main>
    </div>
  );
}
