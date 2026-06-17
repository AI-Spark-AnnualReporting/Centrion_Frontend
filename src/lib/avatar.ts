// Shared avatar helpers — initials + a deterministic gradient per seed. Used by
// the admin users table and the annual-report cycle list/detail PM avatars.

export function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const AVATAR_PALETTES = [
  "linear-gradient(135deg,#4040C8,#6E6EE8)",
  "linear-gradient(135deg,#0D9488,#22C3A6)",
  "linear-gradient(135deg,#7C3AED,#A06BF5)",
  "linear-gradient(135deg,#E0792B,#F2A65A)",
  "linear-gradient(135deg,#2563EB,#5B8DEF)",
];

export function gradientFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTES[h % AVATAR_PALETTES.length];
}
