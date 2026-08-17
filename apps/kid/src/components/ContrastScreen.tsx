import type React from "react";
import { useKidStore } from "../store";
import { kidBand, type Kid, type ContrastTemplate } from "../lib/journey";
import { type Lang, type Strings } from "../i18n";
import { tada, click } from "../game/audio";
import { speak } from "../game/speech";
import type { Screen } from "../App";
import { Icon } from "./Icon";

export interface ContrastScreenProps {
  template: ContrastTemplate;
  skillId: string;
  kid: Kid;
  t: Strings;
  lang: Lang;
  contrastIdx: number;
  setContrastIdx: React.Dispatch<React.SetStateAction<number>>;
  setContrastJob: (v: { template: ContrastTemplate; skillId: string } | null) => void;
  setScreen: (s: Screen) => void;
}

export default function ContrastScreen({
  template, skillId, kid, t, lang, contrastIdx, setContrastIdx, setContrastJob, setScreen,
}: ContrastScreenProps) {
  const round = template.rounds[Math.min(contrastIdx, template.rounds.length - 1)];
  const done = contrastIdx >= template.rounds.length;
  const [optA, optB] = Math.random() < 0.5 ? [round.correct, round.trap] : [round.trap, round.correct];
  const answer = (picked: string) => {
    if (picked === round.correct) {
      tada();
      speak(t.contrastRight);
      setContrastIdx((i) => i + 1);
    } else {
      // Wrong pick — a soft nudge and the same round re-asks (never advances).
      click();
      speak(t.contrastOops(round.correct));
    }
  };
  const finishDrill = () => {
    useKidStore.getState().moniResolveMisconception(kid.id, skillId, template.code);
    setContrastJob(null);
    setContrastIdx(0);
    tada();
    setScreen("home");
  };
  return (
    <div className="app">
      <main className="screen contrast-screen">
        <div className="contrast-mascot" role="img" aria-label="Nova helping with the pattern">
          <Icon name="nova" size={kidBand(kid) >= 5 ? 56 : 72} />
        </div>
        {done ? (
          <>
            <h1 className="title">{t.contrastDoneTitle}</h1>
            <p className="contrast-done-body">{t.contrastDoneBody}</p>
            <button className="big-btn contrast-done-btn" onClick={finishDrill}>
              🌟 {t.contrastDoneBtn}
            </button>
          </>
        ) : (
          <>
            <p className="contrast-kicker">{template.intro[lang === "bn" ? "bn" : "en"]}</p>
            <div className="contrast-round" key={contrastIdx}>
              <p className="contrast-prompt">{round.prompt[lang === "bn" ? "bn" : "en"]}</p>
              <div className="contrast-options">
                <button className="contrast-opt" onClick={() => answer(optA)}>{optA}</button>
                <button className="contrast-opt" onClick={() => answer(optB)}>{optB}</button>
              </div>
              <p className="contrast-tip">{round.tip[lang === "bn" ? "bn" : "en"]}</p>
            </div>
            <span className="contrast-progress">{t.contrastProgress(Math.min(contrastIdx + 1, template.rounds.length), template.rounds.length)}</span>
          </>
        )}
        <button className="ghost-btn" onClick={() => { setContrastJob(null); setContrastIdx(0); setScreen("home"); }}>
          {t.homeBtn}
        </button>
      </main>
    </div>
  );
}
