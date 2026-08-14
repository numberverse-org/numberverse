import { BinSortScene, type BinSortConfig } from "./binSort";

/** i18n name keys — double-quoted camelCase literals the audit scanner sees. */
const NAME_KEY: Record<string, string> = {
  KeepPassword: "osKeepPassword", AskAdult: "osAskAdult", Logout: "osLogout",
  PrivateInfo: "osPrivateInfo", StrongPassword: "osStrongPassword", ScreenBreak: "osScreenBreak",
  TrustedSites: "osTrustedSites", ReportMessage: "osReportMessage",
  SharePassword: "osSharePassword", StrangerChat: "osStrangerChat", MeetStranger: "osMeetStranger",
  UnknownLink: "osUnknownLink", PostAddress: "osPostAddress", AllNight: "osAllNight",
};

const CFG: BinSortConfig = {
  gameId: "game-onlinesafety",
  titleKey: "osTitle",
  promptKey: "osQ",
  greatKey: "osGreat",
  doneKey: "osDone",
  speakWrongKey: "osWrong",
  background: "sky",
  grid: 2,
  rounds: 3,
  bins: [
    { value: "safe", key: "osBinSafe", icon: "✅", verdictKey: "osVerdictSafe" },
    { value: "unsafe", key: "osBinUnsafe", icon: "⚠️", verdictKey: "osVerdictUnsafe" },
  ],
  items: [
    { id: "KeepPassword", emoji: "🔒", value: "safe", tier: 1 },
    { id: "AskAdult", emoji: "🧑", value: "safe", tier: 1 },
    { id: "Logout", emoji: "🚪", value: "safe", tier: 1 },
    { id: "PrivateInfo", emoji: "🙈", value: "safe", tier: 2 },
    { id: "StrongPassword", emoji: "🔑", value: "safe", tier: 2 },
    { id: "ScreenBreak", emoji: "⏰", value: "safe", tier: 2 },
    { id: "TrustedSites", emoji: "✅", value: "safe", tier: 3 },
    { id: "ReportMessage", emoji: "💬", value: "safe", tier: 3 },
    { id: "SharePassword", emoji: "🤫", value: "unsafe", tier: 1 },
    { id: "StrangerChat", emoji: "👤", value: "unsafe", tier: 1 },
    { id: "MeetStranger", emoji: "🤝", value: "unsafe", tier: 2 },
    { id: "UnknownLink", emoji: "📧", value: "unsafe", tier: 2 },
    { id: "PostAddress", emoji: "📄", value: "unsafe", tier: 3 },
    { id: "AllNight", emoji: "🌙", value: "unsafe", tier: 3 },
  ],
  nameKeys: NAME_KEY,
};

/**
 * Online safety (#761). A band-5 ICT skill: the kid drags online actions into
 * ✅ safe-online or ⚠️ not-safe bins. Builds on the band-3 computer-safety
 * offline habits with internet-specific ones — passwords, strangers, links.
 */
export class OnlineSafetyScene extends BinSortScene {
  constructor() {
    super("OnlineSafety");
  }
  protected cfg(): BinSortConfig {
    return CFG;
  }
}
