import type React from "react";
import { type Band } from "@numberverse/core";
import { filterSkills, masteryThresholdFor, cardDate, type Kid, type SkillMap } from "../lib/journey";
import { type Lang, type Strings } from "../i18n";

export interface CertScreenProps {
  certWorld: Band;
  kid: Kid;
  skillsMap: SkillMap;
  t: Strings;
  lang: Lang;
  shareMsg: string | null;
  onBack: () => void;
  shareCert: () => void;
}

export default function CertScreen({ certWorld, kid, skillsMap, t, lang, shareMsg, onBack, shareCert }: CertScreenProps) {
  const cSkills = filterSkills.filter((sk) => sk.band === certWorld.id && sk.game && (skillsMap[`${kid.id}:${sk.id}`]?.pMastered ?? 0) >= masteryThresholdFor(sk.id));
  return (
    <div className="cert-screen" role="document" aria-label={t.certTitle}>
      <div className="cert-toolbar no-print">
        <button className="icon-btn" onClick={onBack} aria-label={t.certBack}>‹</button>
        <span className="cert-toolbar-title">{t.certTitle}</span>
        <button className="cert-share-btn" onClick={() => void shareCert()}>{t.certShare}</button>
        <button className="cert-print-btn" onClick={() => window.print()}>{t.certPrint}</button>
        {shareMsg && <span className="cert-share-feedback" role="status">{shareMsg}</span>}
      </div>
      <div className="cert-sheet">
        <div className="cert-border" />
        <div className="cert-top">
          <span className="cert-nova" role="img" aria-label={t.certSigned}>🦉</span>
          <span className="cert-title">{t.certTitle}</span>
          <span className="cert-nova" role="img" aria-hidden="true">🦉</span>
        </div>
        <p className="cert-line">{t.certThisCertifies}</p>
        <p className="cert-name">{kid.name}</p>
        <p className="cert-line">{t.certHasMastered}</p>
        <p className="cert-world">{lang === "bn" ? certWorld.titleBn ?? certWorld.title : certWorld.title}</p>
        <p className="cert-skills">{t.certSkillCount(cSkills.length)}</p>
        <ul className="cert-list">
          {cSkills.slice(0, 6).map((sk) => (
            <li key={sk.id}>{sk.title}{sk.titleBn ? <span className="cert-bn"> {sk.titleBn}</span> : null}</li>
          ))}
        </ul>
        <p className="cert-nova-line">{t.certWithNova}</p>
        <div className="cert-foot">
          <div className="cert-date">
            <span className="cert-foot-label">{t.certDate}</span>
            <span className="cert-foot-value">{cardDate(Date.now(), lang)}</span>
          </div>
          <div className="cert-sign">
            <span className="cert-sign-emoji" role="img" aria-hidden="true">🦉</span>
            <span className="cert-foot-value">{t.certSigned}</span>
          </div>
        </div>
      </div>
    </div>
  );
}