export const LEADERBOARD_LIMIT = 10;
export const LEADERBOARD_NAME_PATTERN = /^[A-Za-z0-9_]{3,12}$/;

export function isValidLeaderboardEntry(entry) {
  return Boolean(
    entry &&
    typeof entry === 'object' &&
    LEADERBOARD_NAME_PATTERN.test(entry.name) &&
    Number.isFinite(entry.score) &&
    entry.score >= 0 &&
    Number.isInteger(entry.nights_won) &&
    entry.nights_won >= 0 &&
    entry.nights_won <= 3 &&
    typeof entry.achieved_at === 'string' &&
    Number.isFinite(Date.parse(entry.achieved_at)) &&
    Number.isInteger(entry.seed)
  );
}

export function normalizeLeaderboard(entries = []) {
  if (!Array.isArray(entries)) return [];
  const seen = new Set();
  return entries
    .filter(isValidLeaderboardEntry)
    .map((entry) => ({
      name: entry.name,
      score: Math.floor(entry.score),
      nights_won: entry.nights_won,
      achieved_at: entry.achieved_at,
      seed: entry.seed,
    }))
    .filter((entry) => {
      const key = `${entry.name}\u0000${entry.score}\u0000${entry.nights_won}\u0000${entry.achieved_at}\u0000${entry.seed}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.score - a.score || Date.parse(a.achieved_at) - Date.parse(b.achieved_at))
    .slice(0, LEADERBOARD_LIMIT);
}

export function addLeaderboardEntry(entries, entry) {
  if (!isValidLeaderboardEntry(entry)) throw new Error('invalid leaderboard entry');
  return normalizeLeaderboard([...entries, entry]);
}
