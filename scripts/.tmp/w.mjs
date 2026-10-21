import { chromium } from "@playwright/test";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const width of [360, 390]) {
const ctx = await b.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 2, colorScheme: "dark" });
const p = await ctx.newPage();
await p.goto("http://localhost:5199/score");
await p.waitForTimeout(2500);
const fr = p.getByRole("dialog", { name: "Set up Headpin" });
await fr.getByRole("button", { name: "Start fresh" }).click();
await fr.getByRole("button", { name: "right-handed" }).click();
await p.waitForTimeout(1000);
await p.evaluate(async () => {
  const { db } = await import("/src/db/bowlingDb.ts");
  const { calculateGameScore, isStrike } = await import("/src/lib/scoring.ts");
  const ids = [];
  for (const n of ["Transform Pearl", "Zen Master"]) ids.push(await db.balls.add({ name: n, is_spare_ball: false, weight: 15 }));
  const ORDER = [10, 7, 4, 6, 2, 8, 3, 9, 5, 1], ALL = [1,2,3,4,5,6,7,8,9,10];
  const shotsOf = (token, ball_id) => { const shots = []; let standing = ALL;
    for (const ch of token) { if (ch === "X" || ch === "/") standing = []; else if (ch !== "-") { const n = Number(ch);
      const from = standing.length === 10 ? ORDER.filter((q) => standing.includes(q)) : standing; standing = from.slice(0, from.length - n).sort((a, b) => a - b); }
      shots.push({ pins_standing: standing, ball_id }); if (standing.length === 0) standing = ALL; } return shots; };
  const sid = await db.sessions.add({ date: "2026-10-14", alley_name: "Sea Bowl" });
  for (const [k, card] of ["X 9/ X X 81 9/ X 7/ X X9/", "8/ X 9- X X 7/ 9/ X 81 X8/"].entries()) {
    const gid = await db.games.add({ session_id: sid, game_number: k + 1 });
    const frames = card.split(" ").map((t, f) => { const shots = shotsOf(t, ids[k]); const x = { game_id: gid, frame_number: f + 1, shots };
      return { ...x, is_strike: isStrike(x), is_spare: !isStrike(x) && shots.length > 1 && shots[1].pins_standing.length === 0 }; });
    await db.frames.bulkAdd(frames);
    await db.games.update(gid, { final_score: calculateGameScore(frames).total });
  }
});
await p.reload(); await p.waitForTimeout(2000);
await p.getByRole("button", { name: "Stats" }).last().click(); await p.waitForTimeout(2000);
console.log(width, await p.evaluate(() => { const r = document.querySelector('[aria-label="Ball columns"]'); return r ? `scrollWidth ${r.scrollWidth} clientWidth ${r.clientWidth}` : "no table"; }));
await ctx.close();
}
await b.close();
