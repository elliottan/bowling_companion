// History with some weeks behind it, for every piece of creative that shows
// the bowler's past nights: the feature reel and the App Store screenshots.
//
// The saved bowler (SHOTS_STATE, from npm run shots) bowled five nights in one
// sitting, one game most nights; a league bowler's list reads as weeks apart,
// three or four games a night, each on a pattern. Game 1 of each night stays as
// bowled; the games after it are written straight to the database from these
// cards.
const MORE_GAMES = [
  ["X 9/ X X 81 9/ X 7/ X X9/", "8/ X 9- X X 7/ 9/ X 81 X8/"],
  ["X X 9/ 8/ X 9- X X 7/ 9/X", "9/ 81 X X X 9/ 7/ X 9- XXX", "X 7/ 9- X 8/ X X 9/ 81 X9/"],
  ["9- X 8/ X 7/ X 9/ X X 9/8", "X X X 9/ X 81 X 9/ X XX8"],
  ["7/ 9/ X 81 X X 9- 8/ X 9/X", "X 9/ 9/ X 8- X X 7/ X 81", "8/ X X 9/ 81 X 9/ X X X9/"],
  ["X 9/ X 9- X 8/ X X 9/ X81", "9/ X X 8/ X 9- X 7/ X 9/9"]
];
const NIGHTS = [
  { date: "2026-09-16", lanes: ["3", "4"], pattern: /PBA Bear/ },
  { date: "2026-09-23", lanes: ["15", "16"], pattern: /PBA Chameleon/ },
  { date: "2026-09-30", lanes: ["23", "24"], pattern: /Mercury/ },
  { date: "2026-10-07", lanes: ["7", "8"], pattern: /PBA Cheetah/ },
  { date: "2026-10-14", lanes: ["11", "12"], pattern: /PBA Shark/ }
];

/** Writes the history into the app's database. `target` is the app's page or
 *  frame; reload it afterwards, so every screen reads the new rows. */
export async function seedHistory(target) {
  await target.evaluate(
    async ({ more, nights }) => {
      const { db } = await import("/src/db/bowlingDb.ts");
      const { calculateGameScore, isStrike } = await import("/src/lib/scoring.ts");
      const { syncPatternCatalog } = await import("/src/services/patternCatalog.ts");
      await syncPatternCatalog().catch(() => {});
      const patterns = await db.oil_patterns.toArray();
      // Pins left by a count, in the order a right-hander's leaves fall.
      const ORDER = [10, 7, 4, 6, 2, 8, 3, 9, 5, 1];
      const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const shotsOf = (token, ballId) => {
        const shots = [];
        let standing = ALL;
        for (const ch of token) {
          if (ch === "X" || ch === "/") standing = [];
          else if (ch !== "-") {
            const n = Number(ch);
            const from = standing.length === 10 ? ORDER.slice(0, 10).filter((p) => standing.includes(p)) : standing;
            standing = from.slice(0, from.length - n).sort((a, b) => a - b);
          }
          shots.push({ pins_standing: standing, ball_id: ballId });
          if (standing.length === 0) standing = ALL;
        }
        return shots;
      };
      const sessions = (await db.sessions.toArray()).sort((a, b) => a.id - b.id);
      for (const [i, s] of sessions.entries()) {
        const night = nights[i];
        if (!night) break;
        const games = (await db.games.where("session_id").equals(s.id).toArray()).sort((a, b) => a.game_number - b.game_number);
        const firstFrames = await db.frames.where("game_id").equals(games[0].id).toArray();
        const ballId = firstFrames[0]?.shots[0]?.ball_id;
        for (const g of games.slice(1)) {
          await db.frames.where("game_id").equals(g.id).delete();
          await db.games.delete(g.id);
        }
        for (const [k, card] of more[i].entries()) {
          const gameId = await db.games.add({ session_id: s.id, game_number: k + 2, lanes: night.lanes, start_lane: night.lanes[0] });
          const frames = card.split(" ").map((token, f) => {
            const shots = shotsOf(token, ballId);
            const fr = { game_id: gameId, frame_number: f + 1, shots };
            return { ...fr, is_strike: isStrike(fr), is_spare: !isStrike(fr) && shots.length > 1 && shots[1].pins_standing.length === 0 };
          });
          await db.frames.bulkAdd(frames);
          await db.games.update(gameId, { final_score: calculateGameScore(frames).total });
        }
        await db.games.update(games[0].id, { lanes: night.lanes, start_lane: night.lanes[0] });
        const pattern = patterns.find((p) => new RegExp(night.pattern).test(p.name));
        const date = s.date.length > 10 ? night.date + s.date.slice(10) : night.date;
        await db.sessions.update(s.id, { date, oil_pattern_id: pattern?.id });
      }
    },
    { more: MORE_GAMES, nights: NIGHTS.map((n) => ({ ...n, pattern: n.pattern.source })) }
  );
}
