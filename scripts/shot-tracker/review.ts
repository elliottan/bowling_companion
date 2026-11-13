import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { TraceOutput } from "../../src/lib/shotTrack/pipeline";
import type { Metric, TrackResult } from "../../src/lib/shotTrack/types";
import type { CalibrationFile } from "./overlay";

/** One enlarged frame for the owner to read a board off, with the tracer's numbers. */
export interface ReviewShot {
  title: string;
  png: string;
  lines: string[];
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function metricRow(label: string, m: Metric, unit: string): string {
  const v = m.value === null ? "" : `${m.state === "estimated" ? "about " : ""}${m.value.toFixed(1)}${unit}`;
  return `<tr><td>${label}</td><td>${esc(v)}</td><td class="${m.state}">${m.state}</td></tr>`;
}

/** A self-contained page (images inlined) for the owner's review (plan 10.3). */
export function reviewHtml(
  shots: ReviewShot[], name: string, cal: CalibrationFile, r: TrackResult | null, out: TraceOutput, json: Record<string, unknown>
): string {
  const dir = join(new URL(".", import.meta.url).pathname, "out", name);
  const img = (file: string, alt: string) =>
    existsSync(join(dir, file)) ? `<img alt="${alt}" src="data:image/png;base64,${readFileSync(join(dir, file)).toString("base64")}">` : "";
  const c = out.debug.calibration;
  const m = r?.metrics;
  const table = m
    ? [
        metricRow("Laydown (board over the foul line, 0 ft)", m.laydown, ""),
        metricRow("Touchdown board (where the ball lands)", m.touchdown, ""),
        metricRow("Touchdown distance", m.touchdownFeet, " ft"),
        metricRow("Board at the arrows", m.arrows, ""),
        metricRow("Breakpoint board", m.breakpoint, ""),
        metricRow("Breakpoint distance", m.breakpointFeet, " ft"),
        metricRow("Board at the pins", m.pins, ""),
        metricRow("Entry angle", m.entryAngle, " deg"),
        metricRow("Launch angle", m.launchAngle, " deg"),
        metricRow("Average speed", m.speed, " mph"),
        metricRow("Speed at the pins", m.speedAtPins, " mph")
      ].join("")
    : "";
  const checks = c
    ? `<p>Calibration check (found minus expected, boards): pins ${c.pins.map((p) => `${p.name} ${p.error.toFixed(2)}`).join(", ") || "not found"}; arrows ${c.arrows.map((p) => `${p.name.replace("arrow ", "")}: ${p.error.toFixed(2)}`).join(", ") || "not found"}.</p>`
    : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(name)} trace review</title>
<style>
body{font:15px/1.45 system-ui,sans-serif;margin:16px;max-width:1000px;color:#111;background:#fafafa}
img{max-width:100%;image-rendering:pixelated;border:1px solid #ccc;display:block;margin:8px 0}
table{border-collapse:collapse}td{padding:2px 10px;border-bottom:1px solid #ddd}
.measured{color:#060}.estimated{color:#a60}.missing{color:#999}
section{margin:28px 0}code{background:#eee;padding:0 3px}
</style></head><body>
<h1>${esc(name)}: ${esc(cal.clip)}, ${cal.hand}-handed</h1>
<p>${r ? `Traced from ${r.from.toFixed(1)} to ${r.to.toFixed(1)} ft with ${r.sightings.filter((s) => !s.airborne).length} sightings, residual ${r.rms.toFixed(2)} boards RMS.` : `Not traced: ${esc(String(json.failure))}, ${esc(String(json.detail))}.`}
Boards are the bowler's own (board 1 is their gutter). Please read the board under the ball off each picture and compare it with the tracer's number.</p>
${cal.owner ? `<p>Owner's reading: ${esc(cal.owner)}</p>` : ""}
${table ? `<table>${table}</table>` : ""}
${checks}
${shots.map((s) => `<section><h2>${esc(s.title)}</h2>${s.lines.map((l) => `<p>${esc(l)}</p>`).join("")}<img alt="${esc(s.title)}" src="data:image/png;base64,${s.png}"></section>`).join("\n")}
<section><h2>Calibration (frame ${cal.frame})</h2>
<p>The lane mapping is the least squares fit to every mark below: points whose lane position is known (arrow tips, pin bases) and points on lane lines (an edge, the foul line, the pin row across the house). Each mark's residual is how far it sits from where the fit puts it. A calibration with a mark more than a board off is refused.${out.debug.fit ? ` Worst: ${out.debug.fit.worstBoards.toFixed(2)} boards; ${out.debug.fit.redundancy} equations to spare.` : ""}</p>
${out.debug.fit ? `<table><tr><td>Mark</td><td>Pixels</td><td>Boards across</td><td>Feet along</td></tr>${out.debug.fit.residuals.map((q) => `<tr><td>${esc(q.index ? `${q.label} #${q.index + 1}` : q.label)}</td><td>${q.px.toFixed(2)}</td><td>${q.boards === null ? "" : q.boards.toFixed(2)}</td><td>${q.feet === null ? "" : q.feet.toFixed(2)}</td></tr>`).join("")}</table>` : ""}
${cal.notes ? `<p>${esc(cal.notes)}</p>` : ""}
<p>Contrast-stretched. Yellow circles: the marks (point marks labelled with their residual in boards). Magenta crosses: the arrows' tips as the fit projects them; red: the pin spots. Cyan: every 5 boards (white: board 20). Yellow dashes: the foul line and the pin row.</p>
${img("cal-lane.png", "the calibrated lane")}${img("cal-near.png", "the near end")}${img("cal-pins.png", "the pin deck")}</section>
<section><h2>The track on the lane</h2><p>Dots: sightings (green strong, yellow weak, orange in the air). Blue: the fitted path, dashed beyond the sightings.</p>${img("lane.png", "lane")}</section>
<section><h2>Every sighting</h2><p>Green: fitted circle. Yellow: edge points used. Red: contact point. Bottom: feet and handed board.</p>${img("sightings.png", "sightings")}</section>
</body></html>
`;
}
