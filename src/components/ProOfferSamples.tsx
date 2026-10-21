import { PALETTES } from "../lib/palette";

/**
 * Small drawings of what Pro opens, for the Pro page (ADR-164). They are
 * pictures of the idea with made-up numbers, built from the app's own colors,
 * so they follow the theme and never go stale the way a screenshot would.
 * Every one is decoration: the card around it says the same thing in words.
 */

const FRAME = "flex h-28 items-center justify-center overflow-hidden rounded-lg bg-surface-sunken p-3";

/** A stat charted over time: dots on a line, and the average dashed across. */
export function StatsSample() {
  const points = [34, 44, 30, 40, 24, 32, 18, 22, 12];
  const x = (i: number) => 10 + i * 25;
  const line = points.map((y, i) => `${x(i)},${y + 8}`).join(" ");
  return (
    <div className={FRAME} aria-hidden="true">
      <svg viewBox="0 0 220 70" className="h-full w-full max-w-[280px]">
        <line x1="4" x2="216" y1="36" y2="36" className="stroke-ink-tertiary" strokeDasharray="3 4" />
        <polyline points={line} fill="none" className="stroke-accent" strokeWidth="2.5" strokeLinejoin="round" />
        {points.map((y, i) => (
          <circle key={i} cx={x(i)} cy={y + 8} r="3.5" className="fill-accent" />
        ))}
      </svg>
    </div>
  );
}

/** Pocket, carry and strike, side by side. */
export function FirstBallSample() {
  const items = [
    { value: "73%", label: "Pocket" },
    { value: "64%", label: "Carry" },
    { value: "47%", label: "Strike" }
  ];
  return (
    <div className={`${FRAME} gap-5`} aria-hidden="true">
      {items.map((item) => (
        <div key={item.label} className="text-center">
          <div className="text-2xl font-bold tabular-nums text-ink">{item.value}</div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

// The pin deck as rows from the back: 7 8 9 10, 4 5 6, 2 3, 1.
const DECK: number[][] = [[7, 8, 9, 10], [4, 5, 6], [2, 3], [1]];

function MiniDeck({ standing, label, made }: { standing: number[]; label: string; made: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex flex-col items-center gap-[3px]">
        {DECK.map((row) => (
          <div key={row[0]} className="flex gap-[3px]">
            {row.map((pin) => (
              <span
                key={pin}
                className={`h-2.5 w-2.5 rounded-full ${standing.includes(pin) ? "bg-accent" : "bg-edge"}`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="text-center">
        <div className="text-[11px] font-semibold text-ink">{label}</div>
        <div className="text-[11px] tabular-nums text-ink-secondary">{made}</div>
      </div>
    </div>
  );
}

/** The leaves that come up most, and how often each is made. */
export function LeavesSample() {
  return (
    <div className={`${FRAME} gap-6`} aria-hidden="true">
      <MiniDeck standing={[10]} label="10 pin" made="made 91%" />
      <MiniDeck standing={[7]} label="7 pin" made="made 84%" />
      <MiniDeck standing={[6, 10]} label="6-10" made="made 63%" />
    </div>
  );
}

/** Every ball against the others. */
export function BallsSample() {
  const rows = [
    { name: "Your reactive", rates: ["71%", "72%", "53%"] },
    { name: "Your urethane", rates: ["62%", "58%", "40%"] },
    { name: "Your plastic", rates: ["48%", "50%", "31%"] }
  ];
  return (
    <div className={`${FRAME} flex-col items-stretch justify-center gap-0.5`} aria-hidden="true">
      <div className="grid grid-cols-[1fr_repeat(3,3rem)] px-1 text-[10px] font-semibold uppercase tracking-wide text-ink-tertiary">
        <span />
        <span className="text-right">Pocket</span>
        <span className="text-right">Carry</span>
        <span className="text-right">Strike</span>
      </div>
      {rows.map((row) => (
        <div key={row.name} className="grid grid-cols-[1fr_repeat(3,3rem)] border-t border-edge px-1 py-1.5 text-xs">
          <span className="truncate font-semibold text-ink">{row.name}</span>
          {row.rates.map((rate, i) => (
            <span key={i} className="text-right tabular-nums text-ink-secondary">
              {rate}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/** A line drawn on the lane, with its three points. */
export function LineSample() {
  return (
    <div className={FRAME} aria-hidden="true">
      <svg viewBox="0 0 120 100" className="h-full">
        <rect x="26" y="2" width="68" height="96" rx="3" fill="#d9a35f" />
        <rect x="26" y="2" width="68" height="30" rx="3" fill="#a56a32" opacity="0.55" />
        <path d="M60 94 C 58 70, 44 58, 52 40 S 70 22, 66 10" fill="none" stroke="#f59e0b" strokeWidth="3.5" strokeLinecap="round" />
        <circle cx="60" cy="94" r="4" fill="#38bdf8" stroke="#fff" strokeWidth="1.5" />
        <circle cx="52" cy="58" r="4" fill="#f59e0b" stroke="#fff" strokeWidth="1.5" />
        <circle cx="66" cy="10" r="4" fill="#34d399" stroke="#fff" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

/** A ball with its pin, its PAP and the angle between them. */
export function LayoutSample() {
  return (
    <div className={FRAME} aria-hidden="true">
      <svg viewBox="0 0 100 100" className="h-full">
        <defs>
          <radialGradient id="pro-sample-ball" cx="40%" cy="35%" r="75%">
            <stop offset="0" stopColor="#64748b" />
            <stop offset="1" stopColor="#1e293b" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="44" fill="url(#pro-sample-ball)" />
        <path d="M30 28 Q 60 30 70 52" fill="none" stroke="#fff" strokeWidth="2" />
        <path d="M30 28 L 52 78" fill="none" stroke="#fbbf24" strokeWidth="2" strokeDasharray="4 3" />
        <circle cx="30" cy="28" r="4" fill="#fff" />
        <circle cx="70" cy="52" r="5" fill="none" stroke="#38bdf8" strokeWidth="2" />
        <rect x="49" y="76" width="7" height="7" fill="#fbbf24" transform="rotate(45 52 80)" />
      </svg>
    </div>
  );
}

/** The colors Pro adds, beside the one every bowler has. */
export function ThemesSample() {
  return (
    <div className={`${FRAME} gap-3`} aria-hidden="true">
      {PALETTES.map((palette) => (
        <span
          key={palette.id}
          className="h-9 w-9 rounded-full border-2 border-surface shadow-sm"
          style={{ backgroundColor: palette.swatch }}
        />
      ))}
    </div>
  );
}
