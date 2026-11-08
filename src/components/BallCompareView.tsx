import { plural, t } from "@lingui/core/macro";
import { X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { mapPoints, specsAt, weightsOf } from "../lib/ballCompare";
import { formatReleaseDate } from "../lib/dates";
import { formatFixed, formatNumber } from "../lib/format";
import type { CatalogBall } from "../types/catalog";
import { BallMap } from "./BallMap";
import { BallPeek } from "./BallPeek";
import { BallTag } from "./BallTag";
import { CatalogBallImage } from "./CatalogBallImage";
import { coreTypeLabel, coverstockLabel } from "./catalogLabels";
import { PushScreen } from "./PushScreen";
import { Chip } from "./ui/Chip";
import { IconButton } from "./ui/IconButton";
import { SegmentedControl } from "./ui/SegmentedControl";
import { Select } from "./ui/Select";

export type CompareTab = "specs" | "map";

/**
 * Catalog balls side by side, and where they sit on the map (ADR-258,
 * ADR-261).
 *
 * Specs is a table, one column a ball, at the weight the menu picks: the
 * per-weight RG, diff and MB diff are the catalog's own, and no other site we
 * found shows them. Map places the same balls on RG and diff, with the
 * bowler's own bag, and a tap on a ball there or in the key opens a card that
 * leads to the ball's page.
 */
export function BallCompareView({
  compared,
  owned,
  onRemove,
  onBack,
  onOpenBall,
  initialTab = "specs",
  backCloses = true,
  active = true
}: {
  compared: readonly CatalogBall[];
  owned: readonly CatalogBall[];
  onRemove: (id: string) => void;
  onBack: () => void;
  /** Opens a ball's own page, from its card on the map. */
  onOpenBall?: (id: string) => void;
  initialTab?: CompareTab;
  /** False when the comparison is the route itself, opened straight from the
   *  arsenal, so history closes it rather than the sheet back stack. */
  backCloses?: boolean;
  active?: boolean;
}) {
  const [tab, setTab] = useState<CompareTab>(initialTab);
  // The bag is part of what the map is for, so it is on until hidden.
  const [showOwned, setShowOwned] = useState(true);
  const [peek, setPeek] = useState<{ ball: CatalogBall; anchor: DOMRect } | null>(null);
  // The bag's own weights count too: from the arsenal the map may hold
  // nothing but the bag.
  const weights = weightsOf(tab === "map" && showOwned ? [...compared, ...owned] : compared);
  const [weight, setWeight] = useState(15);
  const at = weights.includes(weight) ? weight : 15;
  const ownedIds = new Set(owned.map((b) => b.id));
  const ownedCount = owned.length;
  const comparedIds = new Set(compared.map((b) => b.id));
  const points = mapPoints(compared, owned, showOwned);

  const specs = compared.map((b) => specsAt(b, at));
  const standIns = specs.some((s) => !s.exact);
  const openPeek = (ball: CatalogBall, anchor: DOMRect) => setPeek({ ball, anchor });

  return (
    <PushScreen title={t({ message: "Compare", comment: "The title of the screen that compares bowling balls side by side" })} onBack={onBack} active={active && peek === null} backCloses={backCloses}>
      <div className="mx-auto w-full max-w-3xl space-y-3 px-3 pb-6 pt-2 sm:px-6">
        <SegmentedControl<CompareTab>
          label={t({ message: "Compare by", comment: "The spoken name of the switch between a table of specs and a map" })}
          options={[
            { value: "specs", label: t({ message: "Specs", comment: "A tab: bowling ball specs side by side" }) },
            { value: "map", label: t({ message: "Map", comment: "A tab: bowling balls placed on a chart of RG and differential" }) }
          ]}
          value={tab}
          onChange={setTab}
        />
        {/* The bag's switch over the map, and the weight, a menu since it
            is set once and seldom moved (ADR-261). */}
        {((tab === "map" && owned.length > 0) || weights.length > 1) && (
          <div className="flex min-h-11 items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap gap-2">
              {tab === "map" && owned.length > 0 && (
                <Chip selected={showOwned} onClick={() => setShowOwned((v) => !v)}>
                  {plural(ownedCount, {
                    one: "Your bag, # ball",
                    other: "Your bag, # balls"
                  })}
                </Chip>
              )}
            </div>
            {weights.length > 1 && (
              <Select
                variant="menu"
                aria-label={t({ message: "Ball weight", comment: "The spoken name of the switch between ball weights in pounds" })}
                value={String(at)}
                onChange={(e) => setWeight(Number(e.target.value))}
                wrapperClassName="shrink-0"
              >
                {weights.map((w) => (
                  <option key={w} value={String(w)}>
                    {t({ message: `${{ weight: w }} lb`, comment: "A ball weight in pounds, short" })}
                  </option>
                ))}
              </Select>
            )}
          </div>
        )}

        {tab === "specs" ? (
          compared.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-secondary">
              {t({ message: "Pick balls in the catalog to compare them here.", comment: "Shown when no balls have been picked to compare" })}
            </p>
          ) : (
            <>
              <div className="overflow-hidden rounded-xl border border-edge bg-surface shadow-sm">
                <table className="w-full table-fixed border-collapse text-center">
                  <thead>
                    <tr>
                      <th className="w-[4.5rem]" />
                      {compared.map((b) => (
                        <th key={b.id} scope="col" className="relative px-1 pb-2 pt-3 align-top font-normal">
                          <span className="absolute right-0 top-0">
                            <IconButton compact label={t({ message: `Remove ${{ ball: b.name }}`, comment: "Takes one bowling ball out of the comparison" })} onClick={() => onRemove(b.id)}>
                              <X size={14} aria-hidden="true" />
                            </IconButton>
                          </span>
                          <span className="flex w-full flex-col items-center gap-1 px-0.5 py-1">
                            <span className="block w-12">
                              <CatalogBallImage src={b.imageThumb} alt="" brand={b.brand} size="thumb" />
                            </span>
                            <span className="block w-full break-words text-caption-2 font-semibold uppercase tracking-wide text-ink-secondary">{b.brand}</span>
                            <span className="block w-full break-words text-footnote font-semibold leading-tight text-ink">{b.name}</span>
                            {ownedIds.has(b.id) && <BallTag kind="owned" />}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="text-footnote">
                    <Row label={t({ message: "Cover type", comment: "Bowling term: the kind of coverstock (solid, pearl or hybrid), as opposed to one cover by name" })}>
                      {compared.map((b) => (
                        <Cell key={b.id}>{b.coverstockCategory ? coverstockLabel(b.coverstockCategory) : "-"}</Cell>
                      ))}
                    </Row>
                    <Row label={t({ message: "Cover", comment: "Bowling term: one coverstock by name, a filter field" })}>
                      {compared.map((b) => (
                        <Cell key={b.id} small>{b.coverstockRaw || "-"}</Cell>
                      ))}
                    </Row>
                    <Row label={t({ message: "Factory finish", comment: "Bowling term: the surface finish a ball ships with, such as polished or sanded" })}>
                      {compared.map((b) => (
                        <Cell key={b.id} small>{b.factoryFinish ?? "-"}</Cell>
                      ))}
                    </Row>
                    <Row label={t({ message: "Core", comment: "Bowling term: the weight block inside a ball" })}>
                      {compared.map((b) => (
                        <Cell key={b.id} small>{b.coreName ?? "-"}</Cell>
                      ))}
                    </Row>
                    <Row label={t({ message: "Core type", comment: "Bowling term: whether a ball has a symmetric or asymmetric core" })}>
                      {compared.map((b) => (
                        <Cell key={b.id}>{b.coreType ? coreTypeLabel(b.coreType) : "-"}</Cell>
                      ))}
                    </Row>
                    <Row label={t({ message: "RG", comment: "Bowling term: radius of gyration, a ball spec" })}>
                      {specs.map((s, i) => (
                        <Cell key={compared[i].id} num>
                          {s.rg != null ? formatFixed(s.rg, 2) : "-"}
                          {!s.exact && "*"}
                        </Cell>
                      ))}
                    </Row>
                    <Row label={t({ message: "Diff", comment: "Bowling term: the differential, a ball spec (short for differential RG)" })}>
                      {specs.map((s, i) => (
                        <Cell key={compared[i].id} num>
                          {s.diff != null ? formatFixed(s.diff, 3) : "-"}
                          {!s.exact && "*"}
                        </Cell>
                      ))}
                    </Row>
                    <Row label={t({ message: "MB diff", comment: "Bowling term: the mass bias differential, a ball spec" })}>
                      {specs.map((s, i) => (
                        <Cell key={compared[i].id} num>
                          {s.mbDiff != null ? formatFixed(s.mbDiff, 3) : "-"}
                        </Cell>
                      ))}
                    </Row>
                    <Row label={t({ message: "Released", comment: "When a bowling ball came out, a row label" })} last>
                      {compared.map((b) => (
                        <Cell key={b.id}>{formatReleaseDate(b.releaseDate) ?? "-"}</Cell>
                      ))}
                    </Row>
                  </tbody>
                </table>
              </div>
              {standIns && (
                <p className="px-1 text-caption text-ink-secondary">
                  {t({ message: `* No specs listed at ${{ weight: at }} lb, so its 15 lb numbers are shown.`, comment: "A footnote under a comparison table: one ball lists no specs at the chosen weight" })}
                </p>
              )}
              {compared.length === 1 && (
                <p className="px-1 text-footnote text-ink-secondary">
                  {t({ message: "Add another ball from the catalog to compare.", comment: "Shown under a comparison holding a single ball" })}
                </p>
              )}
            </>
          )
        ) : (
          <div className="rounded-xl border border-edge bg-surface p-3 shadow-sm">
            <BallMap points={points} weight={at} activeId={peek?.ball.id ?? null} onPick={openPeek} />
            {points.length > 0 ? (
              <ol className="mt-3 grid grid-cols-1 gap-x-3 gap-y-1 min-[380px]:grid-cols-2">
                {points.map((p) => (
                  <li key={p.ball.id} className="min-w-0">
                    <button
                      type="button"
                      onClick={(e) => openPeek(p.ball, e.currentTarget.getBoundingClientRect())}
                      className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-lg px-1 text-left text-footnote active:bg-ink/10"
                    >
                      <span
                        aria-hidden="true"
                        className={`relative block h-8 w-8 shrink-0 rounded-full ${
                          p.selected ? "ring-[3px] ring-accent" : "ring-[1.5px] ring-ink-secondary"
                        }`}
                      >
                        <span className="block h-8 w-8 overflow-hidden rounded-full">
                          <CatalogBallImage src={p.ball.imageThumb} alt="" brand={p.ball.brand} size="thumb" />
                        </span>
                        <span
                          className={`absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-[10px] font-bold leading-none ring-1 ring-surface ${
                            p.selected ? "bg-accent-fill text-accent-on-fill" : "bg-ink-strong text-surface"
                          }`}
                        >
                          {formatNumber(p.n)}
                        </span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block break-words font-semibold leading-tight text-ink">{p.ball.name}</span>
                        <span className="mt-0.5 flex flex-wrap gap-1">
                          {p.selected && <BallTag kind="selected" />}
                          {p.owned && <BallTag kind="owned" />}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-center text-footnote text-ink-secondary">
                {t({ message: "Pick balls in the catalog to compare them here.", comment: "Shown when no balls have been picked to compare" })}
              </p>
            )}
          </div>
        )}
      </div>
      {peek && (
        <BallPeek
          ball={peek.ball}
          anchor={peek.anchor}
          weight={at}
          selected={comparedIds.has(peek.ball.id)}
          owned={ownedIds.has(peek.ball.id)}
          onClose={() => setPeek(null)}
          onOpen={() => {
            setPeek(null);
            onOpenBall?.(peek.ball.id);
          }}
        />
      )}
    </PushScreen>
  );
}

function Row({ label, children, last = false }: { label: string; children: ReactNode; last?: boolean }) {
  return (
    <tr className={last ? "" : "border-b border-edge"}>
      <th scope="row" className="px-2 py-2 text-left align-top text-caption font-semibold text-ink-secondary">
        {label}
      </th>
      {children}
    </tr>
  );
}

function Cell({ children, num = false, small = false }: { children: ReactNode; num?: boolean; small?: boolean }) {
  return (
    <td className={`break-words px-1 py-2 align-top ${small ? "text-caption" : ""} ${num ? "tabular-nums" : ""} text-ink`}>
      <span>{children}</span>
    </td>
  );
}
