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
  { id: "game-feed", scene: "PetFeed", emoji: "🍽️", name: "Feed Nova", nameBn: "নোভাকে খাওয়াও" },
  { id: "game-catch", scene: "CatchFruit", emoji: "🍎", name: "Catch Fruit", nameBn: "ফল ধরো" },
  { id: "game-bubble", scene: "BubblePop", emoji: "🫧", name: "Bubble Pop", nameBn: "বুদবুদ ফুটাও" },
  { id: "game-bath", scene: "BathNova", emoji: "🛁", name: "Bath Time", nameBn: "গোসল" },
  { id: "game-stroke", scene: "PetStroke", emoji: "💛", name: "Pet Nova", nameBn: "আদর" },
  { id: "game-sort", scene: "TreatSort", emoji: "🧺", name: "Sort Treats", nameBn: "খাবার সাজাও" },
  { id: "game-fetch", scene: "Fetch", emoji: "🎾", name: "Fetch", nameBn: "বল আনো" },
  { id: "game-hide", scene: "HideSeek", emoji: "🙈", name: "Hide & Seek", nameBn: "লুকোচুরি" },
  { id: "game-memory", scene: "PetMemory", emoji: "🃏", name: "Pet Memory", nameBn: "মনে রাখো" },
  { id: "game-tuckin", scene: "TuckIn", emoji: "🌙", name: "Tuck-in", nameBn: "ঘুম পাড়াও" },
  { id: "game-dance", scene: "PetDance", emoji: "🪩", name: "Dance Party", nameBn: "ডান্স পার্টি" },
  { id: "game-says", scene: "NovaSays", emoji: "🗣️", name: "Nova Says", nameBn: "নোভা বলে" },
  { id: "game-walk", scene: "PetWalk", emoji: "🚶", name: "Pet Walk", nameBn: "পোষা ভ্রমণ" },
  { id: "game-hatch", scene: "EggHatch", emoji: "🥚", name: "Egg Hatch", nameBn: "ডিম ফুটাও" },
  { id: "game-gallery", scene: "SpeciesGallery", emoji: "🐣", name: "Species Gallery", nameBn: "প্রজাতির গ্যালারি" },
  { id: "game-dressup", scene: "DressUp", emoji: "🎩", name: "Dress-up", nameBn: "সাজাও" },
  { id: "game-birthday", scene: "PetBirthday", emoji: "🎂", name: "Pet Birthday", nameBn: "জন্মদিন" },
  { id: "game-photobooth", scene: "PhotoBooth", emoji: "📸", name: "Photo Booth", nameBn: "ফটো বুথ" },
  { id: "game-sleepwake", scene: "SleepWake", emoji: "🌙", name: "Sleep & Wake", nameBn: "ঘুম ও জাগরণ" },

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
