import { memo, useEffect, useMemo, useState } from "react";
import { ASSETS } from "../assets/svgs";

/** Avatar asset keys ↔ the emoji stored in kid profiles (keeps storage compatible). */
export const AVATAR_EMOJI: Record<string, string> = {
  fox: "🦊",
  panda: "🐼",
  lion: "🦁",
  frog: "🐸",
  tiger: "🐯",
  koala: "🐨",
  /* KayKit CC0 adventurer sprites — the stored value stays a friendly emoji
     (parent portal shows it as-is) while the kid app renders the PNG hero. */
  knight: "🛡️",
  mage: "🔮",
  rogue: "🗡️",
  barbarian: "🪓",
  ranger: "🏹",
};
export const AVATAR_KEYS = Object.keys(AVATAR_EMOJI);

/**
 * <Icon name="cat" size={40} />
 * Renders the SVG asset (data-URI <img>) with the emoji as a safe fallback.
 * Same asset keys as the Phaser game, so the shell and lessons always match.
 * Memoized — the shell renders dozens of these on every store update, and a
 * memo'd component + cached data-URI keeps those re-renders cheap.
 */
export const Icon = memo(function Icon({
  name,
  size,
  alt,
  className,
  style,
  fallbackEmoji,
}: {
  name: string;
  size: number;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  /** Emoji shown if `name` isn't a known asset (e.g. a legacy stored avatar). */
  fallbackEmoji?: string;
}) {
  const [failed, setFailed] = useState(false);
  // a reused <Icon> instance must not carry a stale error into a new name
  useEffect(() => {
    setFailed(false);
  }, [name]);

  const asset = ASSETS[name];
  const src = useMemo(() => {
    if (asset?.url) return asset.url; // static PNG sprite (precached by the SW)
    return asset?.svg ? `data:image/svg+xml;utf8,${encodeURIComponent(asset.svg)}` : "";
  }, [asset]);

  if (!asset || failed || !src) {
    return (
      <span
        className={className}
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: size, height: size, fontSize: Math.round(size * 0.82), lineHeight: 1, flex: "none", ...style }}
      >
        {asset?.emoji ?? fallbackEmoji ?? "❓"}
      </span>
    );
  }
  return (
    <span
      className={className}
      style={{ display: "inline-flex", width: size, height: size, flex: "none", ...style }}
    >
      <img
        src={src}
        alt={alt ?? name}
        draggable={false}
        onError={() => setFailed(true)}
        style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
      />
    </span>
  );
});

/** Maps a stored avatar emoji (or key) to the matching SVG sticker. */
export function AvatarIcon({
  emoji,
  size,
  className,
}: {
  emoji: string;
  size: number;
  className?: string;
}) {
  const key = AVATAR_KEYS.find((k) => AVATAR_EMOJI[k] === emoji) ?? (AVATAR_EMOJI[emoji] ? emoji : "");
  return <Icon name={key || ""} fallbackEmoji={AVATAR_EMOJI[key] ?? emoji} size={size} className={className} />;
}
