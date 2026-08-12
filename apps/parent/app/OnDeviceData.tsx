"use client";

/**
 * 🛡️ On-device data review for parents (#262).
 *
 * A privacy screen listing EXACTLY what the kid app stores in this browser's
 * localStorage, grouped by category, with a delete action per category. Purely
 * client-side — no network, works offline. Deleting here never touches the
 * server: server-side data lives in the parent's account (export / roster
 * delete handle that separately).
 *
 * The kid PWA and this parent portal share one origin, so this page reads the
 * same `nv_*` keys the app writes.
 */

import { useCallback, useMemo, useState } from "react";

type Category = {
  id: string;
  title: string;
  emoji: string;
  note: string;
  /** localStorage keys this category owns. */
  keys: string[];
  /** Optional per-key humanizer → a line like "2 kids · 3 queued rounds". */
  human?: (key: string, raw: unknown) => string | null;
};

const fmt = (n: number) => (n >= 1000 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`);

const CATEGORIES: Category[] = [
  {
    id: "learning",
    title: "Learning progress",
    emoji: "📈",
    note: "Mastery, skill progress, play time and the learning-story outbox recorded on this device.",
    keys: ["nv_kids", "nv_kid_settings", "nv_play_minutes", "nv_store_v"],
    human: (key, raw) => {
      if (key !== "nv_kids" || typeof raw !== "string") return null;
      try {
        const s = JSON.parse(raw) as { events?: unknown[]; pending?: unknown[]; stories?: unknown[] };
        const parts: string[] = [];
        const kids = new Set<unknown>();
        (s.events ?? []).forEach((e) => kids.add((e as { kidId?: unknown }).kidId));
        if (s.events?.length) parts.push(`${s.events.length} round${s.events.length === 1 ? "" : "s"}`);
        if (s.pending?.length) parts.push(`${s.pending.length} queued sync`);
        if (s.stories?.length) parts.push(`${s.stories.length} learning stor${s.stories.length === 1 ? "y" : "ies"}`);
        if (kids.size) parts.push(`${kids.size} kid${kids.size === 1 ? "" : "s"}`);
        return parts.length ? parts.join(" · ") : "empty";
      } catch {
        return null;
      }
    },
  },
  {
    id: "identity",
    title: "Device & kid identity",
    emoji: "🪪",
    note: "This device's identity and how local kid profiles map to your account.",
    keys: ["nv_device_id", "nv_device_secret", "nv_device_token", "nv_device_profile_id", "nv_kid_id", "nv_kid_map"],
    human: (key, raw) => {
      if (key !== "nv_kid_map" || typeof raw !== "string") return null;
      try {
        const m = JSON.parse(raw) as Record<string, unknown>;
        return `${Object.keys(m).length} kid${Object.keys(m).length === 1 ? "" : "s"} mapped`;
      } catch {
        return null;
      }
    },
  },
  {
    id: "account",
    title: "Parent account (this browser)",
    emoji: "👤",
    note: "Your sign-in session, display name and this device's parent PIN hash.",
    keys: ["nv_parent_token", "nv_parent_name", "nv_parent_pin", "nv_parent_aggregate_opt_in"],
  },
];

function readKeys(keys: string[]): { key: string; bytes: number; summary: string | null }[] {
  return keys.map((key) => {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return { key, bytes: 0, summary: null };
    const cat = CATEGORIES.find((c) => c.keys.includes(key));
    let summary: string | null = null;
    if (cat?.human) summary = cat.human(key, raw);
    return { key, bytes: raw.length, summary };
  });
}

export default function OnDeviceData() {
  const [version, setVersion] = useState(0);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deletedMsg, setDeletedMsg] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setVersion((v) => v + 1);
    setConfirming(null);
  }, []);

  const rows = useMemo(() => CATEGORIES.map((c) => ({ cat: c, entries: readKeys(c.keys) })), [version]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalBytes = useMemo(
    () => rows.reduce((acc, r) => acc + r.entries.reduce((a, e) => a + e.bytes, 0), 0),
    [rows]
  );

  const deleteCategory = (cat: Category) => {
    cat.keys.forEach((k) => window.localStorage.removeItem(k));
    setDeletedMsg(`${cat.emoji} ${cat.title} cleared from this device.`);
    refresh();
    window.setTimeout(() => setDeletedMsg(null), 4000);
  };

  const presentEntries = (entries: { key: string; bytes: number; summary: string | null }[]) =>
    entries.filter((e) => e.bytes > 0);

  return (
    <section className="card">
      <h2>🛡️ On-device data</h2>
      <p className="muted small">
        Exactly what the kid app keeps in this browser, so it can run offline. Everything here is local —
        clearing it never touches your account or server-side history. Works without a connection.
      </p>

      {rows.map(({ cat, entries }) => {
        const present = presentEntries(entries);
        const catBytes = entries.reduce((a, e) => a + e.bytes, 0);
        return (
          <div key={cat.id} className="ctrl-block">
            <div className="danger-row">
              <div>
                <h3>
                  {cat.emoji} {cat.title}
                </h3>
                <p className="muted small">{cat.note}</p>
                {present.length === 0 ? (
                  <p className="muted small">No data stored on this device.</p>
                ) : (
                  <ul className="session-list">
                    {present.map((e) => (
                      <li key={e.key} className="session-row">
                        <span className="session-meta">
                          <span className="session-device">
                            <code>{e.key}</code>
                          </span>
                          <span className="muted small">
                            {fmt(e.bytes)}
                            {e.summary ? ` · ${e.summary}` : ""}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="danger-zone-right">
                {present.length > 0 &&
                  (confirming === cat.id ? (
                    <div className="confirm-group">
                      <button className="btn danger" onClick={() => deleteCategory(cat)}>
                        Yes, clear it
                      </button>
                      <button className="btn ghost" onClick={() => setConfirming(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button className="btn danger-ghost" onClick={() => setConfirming(cat.id)}>
                      Clear {fmt(catBytes)}
                    </button>
                  ))}
              </div>
            </div>
          </div>
        );
      })}

      <hr />
      <div className="row-buttons" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <p className="muted small" style={{ margin: 0 }}>
          Total on this device: <strong>{fmt(totalBytes)}</strong> · server-side data is separate and can be{" "}
          <a href="/api/v1/export.csv" onClick={(e) => e.preventDefault()} className="muted">
            exported
          </a>{" "}
          from your account.
        </p>
        {deletedMsg && <p className="ok" style={{ margin: 0 }}>{deletedMsg}</p>}
      </div>
    </section>
  );
}
