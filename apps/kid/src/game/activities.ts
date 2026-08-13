/**
 * Nova's 41 play activities (tap me + the Fun panel).
 * The first block is pet-care — bath, brush, hug… Nova is the kid's pet.
 * The scene turns each id into its own animation + sound + reaction bubble.
 */

export interface ActivityDef {
  id: string;
  emoji: string;
  name: string;
  nameBn: string;
  /**
   * Full Phaser mini-game scene key (docs/plans/104-pet-minigames.md).
   * When set, the Fun-panel card LAUNCHES that scene (with kidId + onBack)
   * instead of playing a quick animation via runActivity().
   */
  scene?: string;
}

export const ACTIVITIES: ActivityDef[] = [
  /* ── pet mini-games (#104): full scenes launched over NovaScene ── */
  { id: "game-feed", scene: "PetFeed", emoji: "🍽️", name: "Feed", nameBn: "খাওয়াও" },
  { id: "game-catch", scene: "CatchFruit", emoji: "🍎", name: "Catch Fruit", nameBn: "ফল ধরো" },
  { id: "game-bubble", scene: "BubblePop", emoji: "🫧", name: "Bubble Pop", nameBn: "বুদবুদ ফুটাও" },
  { id: "game-bath", scene: "BathNova", emoji: "🛁", name: "Bath Time", nameBn: "গোসল" },
  { id: "game-stroke", scene: "PetStroke", emoji: "💛", name: "Pet Nova", nameBn: "আদর" },
  { id: "game-sort", scene: "TreatSort", emoji: "🧺", name: "Sort Treats", nameBn: "খাবার সাজাও" },
  { id: "game-fetch", scene: "Fetch", emoji: "🎾", name: "Fetch", nameBn: "বল আনো" },

  /* ── pet-care: Nova is the kid's pet — bath, brush, cuddle, the works ── */
  { id: "bath", emoji: "🛁", name: "Bath", nameBn: "স্নান" },
  { id: "brush", emoji: "🪮", name: "Brush", nameBn: "চিরুনি" },
  { id: "hug", emoji: "🤗", name: "Hug", nameBn: "আলিঙ্গন" },
  { id: "kiss", emoji: "😘", name: "Kiss", nameBn: "চুমু" },
  { id: "scritch", emoji: "🫳", name: "Scritches", nameBn: "আদর" },
  { id: "nap", emoji: "🛏️", name: "Nap", nameBn: "ঝিম" },
  { id: "fly", emoji: "🪶", name: "Fly", nameBn: "ওড়া" },
  { id: "read", emoji: "📖", name: "Read", nameBn: "পড়া" },
  { id: "slap", emoji: "💢", name: "Slap", nameBn: "চড়" },
  { id: "laugh", emoji: "😂", name: "Laugh", nameBn: "হাসি" },
  { id: "yawn", emoji: "🥱", name: "Yawn", nameBn: "হাই তোলা" },
  { id: "sneeze", emoji: "🤧", name: "Sneeze", nameBn: "হাঁচি" },
  { id: "dance", emoji: "🕺", name: "Dance", nameBn: "নাচ" },
  { id: "spin", emoji: "🌀", name: "Spin", nameBn: "ঘোরা" },
  { id: "wave", emoji: "👋", name: "Wave", nameBn: "হাত নাড়া" },
  { id: "jump", emoji: "🦘", name: "Jump", nameBn: "লাফ" },
  { id: "twirl", emoji: "✨", name: "Twirl", nameBn: "পাক খাওয়া" },
  { id: "wink", emoji: "😉", name: "Wink", nameBn: "চোখ মারা" },
  { id: "blink", emoji: "😴", name: "Blink", nameBn: "চোখ পিটপিট" },
  { id: "grumpy", emoji: "😤", name: "Grumpy", nameBn: "বিরক্তি" },
  { id: "happy", emoji: "😄", name: "Happy", nameBn: "খুশি" },
  { id: "sad", emoji: "😢", name: "Sad", nameBn: "দুঃখ" },
  { id: "scared", emoji: "😨", name: "Scared", nameBn: "ভয়" },
  { id: "shocked", emoji: "😲", name: "Shocked", nameBn: "আশ্চর্য" },
  { id: "excited", emoji: "🤩", name: "Excited", nameBn: "উত্তেজনা" },
  { id: "sleepy", emoji: "😪", name: "Sleepy", nameBn: "তন্দ্রা" },
  { id: "snore", emoji: "💤", name: "Snore", nameBn: "নাক ডাকা" },
  { id: "whistle", emoji: "🎶", name: "Whistle", nameBn: "শিস" },
  { id: "sing", emoji: "🎤", name: "Sing", nameBn: "গান" },
  { id: "heart", emoji: "💛", name: "Heart", nameBn: "ভালোবাসা" },
  { id: "dizzy", emoji: "😵", name: "Dizzy", nameBn: "মাথা ঘোরা" },
  { id: "stretch", emoji: "🙆", name: "Stretch", nameBn: "টান" },
  { id: "hide", emoji: "🙈", name: "Hide", nameBn: "লুকানো" },
  { id: "peek", emoji: "👀", name: "Peek", nameBn: "উঁকি" },
  { id: "cheer", emoji: "🎉", name: "Cheer", nameBn: "উল্লাস" },
  { id: "hmm", emoji: "🤔", name: "Hmm", nameBn: "ভাবা" },
  { id: "highfive", emoji: "✋", name: "High-five", nameBn: "হাই-ফাইভ" },
  { id: "gobble", emoji: "😋", name: "Gobble", nameBn: "খাওয়া" },
  { id: "glow", emoji: "✨", name: "Glow", nameBn: "দীপ্তি" },
  { id: "zoom", emoji: "💨", name: "Zoomies", nameBn: "ছুট" },
  { id: "disco", emoji: "🪩", name: "Disco", nameBn: "ডিস্কো" },
];
