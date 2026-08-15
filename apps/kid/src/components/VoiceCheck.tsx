import { useEffect, useState } from "react";
import { speak, speechStatus } from "../game/speech";
import { getNeuralSpeaker, setNeuralSpeaker, NEURAL_VOICES, neuralSpeak, retryNeuralVoice } from "../game/neuralVoice";
import type { Strings } from "../i18n";

export default function VoiceCheck({ t }: { t: Strings }) {
  const [st, setSt] = useState<ReturnType<typeof speechStatus>>(speechStatus);
  const [spk, setSpk] = useState<number>(getNeuralSpeaker());
  // Live-poll while the neural voice is downloading so a parent can watch it land.
  useEffect(() => {
    if (st.neural.ready || st.neural.state === "error") return;
    const iv = window.setInterval(() => setSt(speechStatus()), 2000);
    return () => window.clearInterval(iv);
  }, [st.neural.ready, st.neural.state]);
  const platformLabel = st.platform === "ios" ? "🍎 iOS" : st.platform === "android" ? "🤖 Android" : "💻 " + st.platform;
  const neuralLine = st.neural.supported
    ? st.neural.ready
      ? t.voiceNeuralReady
      : st.neural.state === "loading"
        ? t.voiceNeuralLoading(Math.min(100, Math.round(st.neural.progress * 100)))
        : st.neural.state === "error"
          ? `${t.voiceNeuralError}${st.neural.error ? ` (${st.neural.error})` : ""}`
          : t.voiceNeuralIdle
    : null;
  return (
    <div className="parent-card voice-check">
      <div className="parent-head">
        <span className="parent-name">{t.voiceTitle}</span>
        <span className="parent-stats">{t.voicePlatform(platformLabel)}</span>
      </div>
      {!st.available && !st.neural.supported ? (
        <p className="voice-line warn">{t.voiceNone}</p>
      ) : (
        <div className="voice-body">
          <p className="voice-line">{st.neural.supported ? (neuralLine ?? null) : null}</p>
          {st.neural.state === "error" && (
            // #1318 — retry the failed model download right here (a fresh
            // worker is created; cached files are reused, so this is cheap).
            <button
              className="ghost-btn mini voice-test-btn"
              onClick={() => {
                retryNeuralVoice();
                setSt(speechStatus());
              }}
            >
              ↻ {t.voiceRetry}
            </button>
          )}
          {st.neural.ready && st.neural.cache && st.neural.cache.hits + st.neural.cache.misses > 0 ? (
            <p className="voice-line">{t.voiceCacheHit(Math.round(st.neural.cache.hitRate * 100))}</p>
          ) : null}
          <p className="voice-line">{st.bnPick ? t.voiceBnOk(st.bnPick) : t.voiceBnMissing}</p>
          <p className="voice-line">{st.enPick ? t.voiceEnOk(st.enPick) : t.voiceNone}</p>
          <button
            className="ghost-btn mini voice-test-btn"
            onClick={() => {
              setSt(speechStatus());
              speak("এক দুই তিন — এইটা একটা পরীক্ষা।", { lang: "bn" });
              window.setTimeout(() => speak("One two three — this is a test line.", { lang: "en" }), 2600);
            }}
          >
            🔊 {t.voiceTest}
          </button>
          {st.neural.ready ? (
            <div className="voice-picker">
              <div className="voice-picker-head">
                <span>{t.voicePickTitle}</span>
                <span className="voice-picker-hint">{t.voicePickHint}</span>
              </div>
              <div className="voice-picker-rows">
                {NEURAL_VOICES.map((v) => {
                  const active = spk === v.id;
                  const label = v.key === "female" ? t.voicePickFemale : v.key === "kid" ? t.voicePickKid : v.key === "soft" ? t.voicePickSoft : t.voicePickWarm;
                  return (
                    <div key={v.id} className={`voice-pick-row${active ? " active" : ""}`}>
                      <button
                        className="voice-pick-select"
                        onClick={() => {
                          setNeuralSpeaker(v.id);
                          setSpk(v.id);
                          setSt(speechStatus());
                        }}
                        aria-pressed={active}
                      >
                        {active ? "✓ " : ""}
                        {label}
                      </button>
                      <button
                        className="voice-pick-listen"
                        aria-label={`${t.voicePickListen} · ${label}`}
                        onClick={() => {
                          void neuralSpeak("আমি তোমার বন্ধু — চলো একসাথে খেলি!", { speaker: v.id });
                        }}
                      >
                        🔈
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          {st.platform === "android" && !st.googleBn && !st.neural.ready ? (
            <p className="voice-hint">Tip: install Google বাংলা in Settings → Text-to-speech for the best Bangla voice.</p>
          ) : null}
          {!st.secureContext ? (
            <p className="voice-hint warn">Voice may be blocked over plain http — open via localhost or install the app (https).</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
