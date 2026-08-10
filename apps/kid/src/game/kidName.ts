/**
 * The ACTIVE kid's name, in one place — so any scene or feedback can call the
 * child by name ("Almost, Aria! Try again") without threading a prop through
 * every scene. App.tsx sets it right before starting each game session.
 */
let currentKidName = "";

export function setCurrentKidName(name: string) {
  currentKidName = name ?? "";
}

export function getKidName(): string {
  return currentKidName;
}
