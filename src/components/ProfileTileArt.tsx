/*
 * The pictures behind Home's three profile tiles (spare lines, lane notes and
 * the Game plan). Like the tool cards' pictures (`ToolCards`), they are
 * drawings rather than the screens' own components, and they keep their own
 * colours in both themes, as a photo would. Each is drawn to a 120 x 120 box
 * and anchored at the top; a tile shows about the top 90, so what matters
 * sits above that.
 */

const SVG_PROPS = {
  viewBox: "0 0 120 120",
  preserveAspectRatio: "xMidYMin slice",
  className: "block h-full w-full",
  "aria-hidden": true
} as const;

/** A lane in deep teal, the rack with a 10 pin left standing, and a dashed
 *  line from the ball across the lane to it. */
export function SpareLinesArt() {
  // The rack from the approach, back row at the top.
  const rack: Array<[number, number]> = [
    [60, 58],
    [52, 46],
    [68, 46],
    [44, 34],
    [60, 34],
    [76, 34],
    [36, 22],
    [52, 22],
    [68, 22],
    [84, 22]
  ];
  return (
    <svg {...SVG_PROPS}>
      <defs>
        <linearGradient id="tile-spare-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0f766e" />
          <stop offset="1" stopColor="#134e4a" />
        </linearGradient>
      </defs>
      <rect width="120" height="120" fill="url(#tile-spare-bg)" />
      {/* The lane's boards, and its gutters. */}
      <rect x="22" y="0" width="76" height="120" fill="#ffffff" fillOpacity="0.06" />
      {Array.from({ length: 12 }, (_, i) => (
        <line key={i} x1={22 + (i + 1) * 5.85} y1="0" x2={22 + (i + 1) * 5.85} y2="120" stroke="#ffffff" strokeOpacity="0.06" />
      ))}
      {rack.map(([x, y], i) =>
        i === 9 ? null : <circle key={i} cx={x} cy={y} r="1.6" fill="#ffffff" fillOpacity="0.3" />
      )}
      <path
        d="M 40 74 C 45 58, 62 45, 79 29"
        fill="none"
        stroke="#5eead4"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeDasharray="5 4"
      />
      <circle cx="84" cy="22" r="5" fill="#ffffff" />
      <circle cx="84" cy="22" r="8.5" fill="none" stroke="#5eead4" strokeWidth="1.6" strokeOpacity="0.7" />
      <circle cx="40" cy="74" r="7" fill="#1e293b" stroke="#5eead4" strokeWidth="2" />
    </svg>
  );
}

/** A spiral notebook, tilted on a warm desk, its page ruled and written on,
 *  with a pencil across it. */
export function LaneNotesArt() {
  return (
    <svg {...SVG_PROPS}>
      <defs>
        <linearGradient id="tile-notes-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b45309" />
          <stop offset="1" stopColor="#78350f" />
        </linearGradient>
      </defs>
      <rect width="120" height="120" fill="url(#tile-notes-bg)" />
      <g transform="translate(12 2) scale(0.8)">
      <g transform="rotate(-8 60 60)">
        {/* The cover peeking out under the page, then the page. */}
        <rect x="27" y="14" width="68" height="92" rx="5" fill="#1e3a5f" />
        <rect x="24" y="12" width="68" height="92" rx="4" fill="#fdf6e3" />
        {/* Margin and rules. */}
        <line x1="36" y1="22" x2="36" y2="104" stroke="#ef4444" strokeOpacity="0.5" strokeWidth="1" />
        {[30, 40, 50, 60, 70, 80, 90].map((y) => (
          <line key={y} x1="24" y1={y} x2="92" y2={y} stroke="#60a5fa" strokeOpacity="0.45" strokeWidth="0.8" />
        ))}
        {/* What was written: a pair of lanes, and a line or two about them. */}
        <path d="M 41 37.5 h 18 M 41 47.5 h 30 M 41 57.5 h 24" stroke="#334155" strokeWidth="2" strokeLinecap="round" />
        <rect x="42" y="64" width="9" height="14" rx="1.5" fill="none" stroke="#0f766e" strokeWidth="1.6" />
        <rect x="54" y="64" width="9" height="14" rx="1.5" fill="none" stroke="#0f766e" strokeWidth="1.6" />
        {/* The spiral across the top. */}
        {[32, 42, 52, 62, 72, 82].map((x) => (
          <g key={x}>
            <circle cx={x} cy="17" r="2" fill="#78350f" fillOpacity="0.5" />
            <path d={`M ${x} 17 v -8`} stroke="#cbd5e1" strokeWidth="2.2" strokeLinecap="round" />
          </g>
        ))}
      </g>
      {/* A pencil across the corner. */}
      <g transform="rotate(-40 92 92)">
        <rect x="64" y="88" width="44" height="8" fill="#facc15" />
        <rect x="64" y="88" width="44" height="2.6" fill="#fde047" />
        <rect x="104" y="88" width="7" height="8" fill="#f9a8d4" />
        <rect x="101" y="88" width="3" height="8" fill="#94a3b8" />
        <path d="M 64 88 L 55 92 L 64 96 Z" fill="#fde68a" />
        <path d="M 58 90.6 L 55 92 L 58 93.4 Z" fill="#334155" />
      </g>
      </g>
    </svg>
  );
}

/** A clipboard on deep indigo: the plan for the alley, ticked off, and the
 *  numbers that back it. */
export function GamePlanArt() {
  return (
    <svg {...SVG_PROPS}>
      <defs>
        <linearGradient id="tile-plan-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4338ca" />
          <stop offset="1" stopColor="#1e1b4b" />
        </linearGradient>
      </defs>
      <rect width="120" height="120" fill="url(#tile-plan-bg)" />
      <g transform="translate(12 2) scale(0.8) rotate(6 60 60)">
        {/* The board, the paper, and the clip. */}
        <rect x="26" y="14" width="68" height="94" rx="6" fill="#92400e" />
        <rect x="31" y="22" width="58" height="82" rx="2" fill="#f8fafc" />
        <rect x="46" y="9" width="28" height="12" rx="3" fill="#cbd5e1" />
        <rect x="52" y="6" width="16" height="6" rx="3" fill="none" stroke="#cbd5e1" strokeWidth="2.4" />
        {/* The plan, ticked off. */}
        {[34, 46, 58].map((y, i) => (
          <g key={y}>
            <rect x="37" y={y - 4} width="8" height="8" rx="2" fill={i < 2 ? "#14b8a6" : "none"} stroke="#14b8a6" strokeWidth="1.4" />
            {i < 2 && (
              <path d={`M 39 ${y} l 1.8 1.8 l 3.2 -3.6`} fill="none" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            )}
            <line x1="49" y1={y} x2={i === 1 ? 72 : 80} y2={y} stroke="#475569" strokeWidth="2" strokeLinecap="round" />
          </g>
        ))}
        {/* Its numbers. */}
        {[
          [38, 12],
          [48, 20],
          [58, 15],
          [68, 24],
          [78, 19]
        ].map(([x, h]) => (
          <rect key={x} x={x} y={96 - h} width="7" height={h} rx="1.5" fill="#6366f1" fillOpacity={x === 68 ? 1 : 0.55} />
        ))}
      </g>
    </svg>
  );
}
