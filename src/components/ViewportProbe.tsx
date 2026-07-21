import { useEffect, useRef, useState } from "react";
import {
  FIX_LABELS,
  VIEWPORT_FIXES,
  findHitOffset,
  type ViewportFix,
} from "../lib/viewportFix";

/**
 * Temporary probe for the tap-displacement half of the iOS standalone viewport
 * bug — see `docs/VIEWPORT-BUG.md`. Delete with `viewportFix.ts` once resolved.
 *
 * The `hit dy` row is the whole point: it is measured, not inferred. On every
 * tap it compares the element iOS delivered the event to against what the DOM
 * says is at those coordinates, and reports the displacement in px.
 */

type Probe = {
  dy: number | null;
  tapY: number;
  tag: string;
  samples: number[];
};

export function ViewportProbe({
  fix,
  onFixChange,
}: {
  fix: ViewportFix;
  onFixChange: (next: ViewportFix) => void;
}) {
  const [open, setOpen] = useState(true);
  const [probe, setProbe] = useState<Probe | null>(null);
  const [env, setEnv] = useState<Record<string, string | number>>({});
  const panelRef = useRef<HTMLDivElement>(null);

  // Measure the displacement on every tap, except taps on the panel itself.
  useEffect(() => {
    const onTouch = (e: TouchEvent) => {
      const target = e.target as Element | null;
      if (!target || panelRef.current?.contains(target)) return;
      const t = e.touches[0];
      if (!t) return;
      const dy = findHitOffset(
        (x, y) => document.elementFromPoint(x, y),
        target,
        t.clientX,
        t.clientY
      );
      setProbe((prev) => ({
        dy,
        tapY: Math.round(t.clientY),
        tag: target.tagName.toLowerCase(),
        samples: [...(prev?.samples ?? []), dy ?? 0].slice(-6),
      }));
    };
    document.addEventListener("touchstart", onTouch, { passive: true, capture: true });
    return () => document.removeEventListener("touchstart", onTouch, { capture: true });
  }, []);

  useEffect(() => {
    const tick = () => {
      const vv = window.visualViewport;
      setEnv({
        vvOffTop: Math.round(vv?.offsetTop ?? -1),
        vvPageTop: Math.round(vv?.pageTop ?? -1),
        vvH: Math.round(vv?.height ?? 0),
        scrollY: Math.round(window.scrollY),
        docTop: Math.round(document.scrollingElement?.scrollTop ?? 0),
        clientH: document.documentElement.clientHeight,
        innerH: window.innerHeight,
        standalone: window.matchMedia("(display-mode: standalone)").matches ? "yes" : "NO",
      });
    };
    tick();
    const id = setInterval(tick, 400);
    return () => clearInterval(id);
  }, []);

  const row = (label: string, value: string | number) => (
    <div className="flex justify-between gap-3">
      <span className="text-slate-400">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );

  const badge =
    probe?.dy == null ? "?" : probe.dy === 0 ? "ok" : `${probe.dy > 0 ? "+" : ""}${probe.dy}`;

  return (
    <div
      ref={panelRef}
      className="fixed top-[env(safe-area-inset-top)] right-1 z-[9999] font-mono text-[10px] leading-tight"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full bg-black/80 px-2 py-1 font-bold text-white"
      >
        {open ? "×" : `dy:${badge}`}
      </button>

      {open && (
        <div className="mt-1 w-52 rounded-lg bg-black/85 p-2 text-white">
          <div className="mb-1 grid grid-cols-3 gap-1">
            {VIEWPORT_FIXES.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => onFixChange(f)}
                className={`rounded px-1 py-1 font-bold ${
                  f === fix ? "bg-white text-black" : "bg-white/20"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="mb-2 text-[9px] text-slate-300">{FIX_LABELS[fix]}</div>

          <div className="space-y-0.5">
            {row("hit dy", probe ? badge : "tap anything")}
            {row("last taps", probe?.samples.join(",") ?? "—")}
            {row("tap y / tag", probe ? `${probe.tapY} ${probe.tag}` : "—")}
            {Object.entries(env).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <span className="text-slate-400">{k}</span>
                <span className="font-semibold tabular-nums">{v}</span>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => location.reload()}
            className="mt-2 w-full rounded bg-white/20 py-1 font-bold"
          >
            reload
          </button>
        </div>
      )}
    </div>
  );
}
