import { plural, t } from "@lingui/core/macro";
import { Plus, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { entryKey, graphPoints, MAX_COMPARE, specsAt, weightsFor, type GraphPoint, type WeighedBall } from "../lib/ballCompare";
import { formatReleaseDate } from "../lib/dates";
import { formatFixed, formatNumber } from "../lib/format";
import { BallGraph, GraphTermNote, type GraphTerm } from "./BallGraph";
import { BallPeek } from "./BallPeek";
import { BallTag } from "./BallTag";
import { CatalogBallImage } from "./CatalogBallImage";
import { coreTypeLabel, coverstockLabel } from "./catalogLabels";
import { PushScreen } from "./PushScreen";
import { RemoveFromCompare } from "./RemoveFromCompare";
import { Button } from "./ui/Button";
import { Chip } from "./ui/Chip";
import { IconButton } from "./ui/IconButton";
import { SegmentedControl } from "./ui/SegmentedControl";
import { Select } from "./ui/Select";

export type CompareTab = "specs" | "graph";

const lb = (weight: number) => t({ message: `${{ weight }} lb`, comment: "A ball weight in pounds, short" });

/**
 * Catalog balls side by side, and where they sit on the graph (ADR-258,
 * ADR-261, ADR-262).
 *
 * Every ball is at its own weight: a menu in its column moves it, except a
 * ball the bowler owns at that weight, which is theirs and stays at what they
 * own it in. Specs is a table, one column a ball, from the catalog's own
 * per-weight RG, diff and MB diff. Graph places the same balls on RG and diff,
 * with the bowler's own bag at the weights it holds, and a tap on a ball there
 * or in the key opens a card that leads to the ball's page. While a column is
 * free, a button goes back to the catalog for another ball.
 */
export function BallCompareView({
  compared,
  owned,
  onRemove,
  onWeightChange,
  onAddBall,
  onBack,
  onOpenBall,
  initialTab = "specs",
  backCloses = true,
  active = true
}: {
  /** The compared balls, each at its weight, in the order they were picked. */
  compared: readonly WeighedBall[];
  /** The bowler's own catalog balls, each at the weight it was bought in. */
  owned: readonly WeighedBall[];
  /** Takes one ball at one weight out, by its `entryKey`. */
  onRemove: (key: string) => void;
  onWeightChange?: (key: string, weight: number) => void;
  /** To the catalog for another ball, while a column is free. */
  onAddBall?: () => void;
  onBack: () => void;
  /** Opens a ball's own page, from its card on the graph. */
  onOpenBall?: (id: string) => void;
  initialTab?: CompareTab;
  /** False when the comparison is the route itself, opened straight from the
   *  arsenal, so history closes it rather than the sheet back stack. */
  backCloses?: boolean;
  active?: boolean;
}) {
  const [tab, setTab] = useState<CompareTab>(initialTab);
  // The bag's balls hidden from the graph, one by one (ADR-263). The bag is
  // part of what the graph is for, so every ball is on until hidden.
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const [peek, setPeek] = useState<{ point: GraphPoint; anchor: DOMRect } | null>(null);
  const keyOf = (b: WeighedBall) => entryKey({ id: b.ball.id, weight: b.weight });
  // A ball owned at the weight it is compared at is the bowler's own, so its
  // weight is not the comparison's to move.
  const ownedKeys = new Set(owned.map(keyOf));
  const ownedCount = owned.length;
  // Every ball keeps its number whether it is drawn or not, so the key does
  // not renumber under the finger. A compared ball is always drawn.
  const keyPoints = graphPoints(compared, owned, true);
  const isOn = (p: GraphPoint) => p.selected || !hidden.has(p.key);
  const points = keyPoints.filter(isOn);
  const bagKeys = keyPoints.filter((p) => !p.selected).map((p) => p.key);
  const bagShown = bagKeys.filter((k) => !hidden.has(k)).length;
  const toggleBall = (p: GraphPoint) => {
    // A compared ball is always drawn; it leaves only through the comparison.
    if (p.selected) return;
    setHidden((h) => {
      const next = new Set(h);
      if (next.has(p.key)) next.delete(p.key);
      else next.add(p.key);
      return next;
    });
  };
  const tapKeyPhoto = (p: GraphPoint, el: Element) => {
    if (p.selected) {
      askRemove(p.key, el);
      return;
    }
    toggleBall(p);
  };
  // All on, the bag's switch takes them all off; otherwise it puts them all on.
  const toggleBag = () => setHidden(bagShown === bagKeys.length ? new Set(bagKeys) : new Set());
  const [term, setTerm] = useState<{ term: GraphTerm; anchor: DOMRect } | null>(null);
  // A compared ball asks before it leaves (ADR-266).
  const [removing, setRemoving] = useState<{ key: string; anchor: DOMRect } | null>(null);
  const askRemove = (key: string, el: Element) => setRemoving({ key, anchor: el.getBoundingClientRect() });

  const specs = compared.map((b) => specsAt(b.ball, b.weight));
  const standIns = specs.some((s) => !s.exact);
  const openPeek = (point: GraphPoint, anchor: DOMRect) => setPeek({ point, anchor });
  const canAdd = onAddBall !== undefined && compared.length < MAX_COMPARE;
  const empty = t({ message: "Pick balls in the catalog to compare them here.", comment: "Shown when no balls have been picked to compare" });

  /** The weights a column's menu offers: the ball's listed ones and its own,
   *  less those the same ball is already compared at in another column. */
  const weightOptions = (b: WeighedBall) => {
    const taken = compared.filter((o) => o.ball.id === b.ball.id && o.weight !== b.weight).map((o) => o.weight);
    return [...new Set([...weightsFor(b.ball), b.weight])].filter((w) => !taken.includes(w)).sort((x, y) => y - x);
  };

  const addButton = canAdd && (
    <Button variant="secondary" onClick={onAddBall} className="w-full">
      <Plus size={16} aria-hidden="true" />
      {t({ message: "Add a ball", comment: "Goes to the catalog to pick another bowling ball to compare" })}
    </Button>
  );

  return (
    <PushScreen title={t({ message: "Compare", comment: "The title of the screen that compares bowling balls side by side" })} onBack={onBack} active={active && peek === null && term === null && removing === null} backCloses={backCloses}>
      <div className="mx-auto w-full max-w-3xl space-y-3 px-3 pb-6 pt-2 sm:px-6">
        <SegmentedControl<CompareTab>
          label={t({ message: "Compare by", comment: "The spoken name of the switch between a table of specs and a graph" })}
          options={[
            { value: "specs", label: t({ message: "Specs", comment: "A tab: bowling ball specs side by side" }) },
            { value: "graph", label: t({ message: "Graph", comment: "A tab: bowling balls placed on a graph of RG and differential" }) }
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === "specs" ? (
          compared.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-secondary">{empty}</p>
          ) : (
            <>
              {/* Up to eight columns: the table scrolls sideways under its
                  row names, which stay put (ADR-266). */}
              <div className="overflow-x-auto overscroll-x-none scrollbar-none rounded-xl border border-edge bg-surface shadow-sm">
                <table
                  className="table-fixed border-collapse text-center"
                  style={{ width: `max(100%, ${4.5 + compared.length * 6}rem)` }}
                >
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-[1] w-[4.5rem] bg-surface" />
                      {compared.map((b) => {
                        const key = keyOf(b);
                        return (
                          <th key={key} scope="col" className="relative px-1 pb-2 pt-3 align-top font-normal">
                            <span className="absolute right-0 top-0 z-[1]">
                              <IconButton compact label={t({ message: `Remove ${{ ball: b.ball.name }}, ${{ weight: lb(b.weight) }}`, comment: "Takes one bowling ball, at one weight, out of the comparison" })} onClick={(e) => askRemove(key, e.currentTarget)}>
                                <X size={14} aria-hidden="true" />
                              </IconButton>
                            </span>
                            <span className="flex w-full flex-col items-center gap-1 px-0.5 py-1">
                              {/* The ball itself opens its page (ADR-266). */}
                              <button
                                type="button"
                                onClick={() => onOpenBall?.(b.ball.id)}
                                disabled={!onOpenBall}
                                aria-label={t`Open ${{ name: b.ball.name }}`}
                                className="flex w-full flex-col items-center gap-1 rounded-lg active:opacity-60"
                              >
                                <span className="block w-12">
                                  <CatalogBallImage src={b.ball.imageThumb} alt="" brand={b.ball.brand} size="thumb" />
                                </span>
                                <span className="block w-full break-words text-caption-2 font-semibold uppercase tracking-wide text-ink-secondary">{b.ball.brand}</span>
                                <span className="block w-full break-words text-footnote font-semibold leading-tight text-ink">{b.ball.name}</span>
                              </button>
                            </span>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="text-footnote">
                    {/* Each ball's weight on a row of its own, so the
                        weights line up however long the names above run
                        (ADR-267). The bowler's own stays at the weight they
                        own it in; any other moves with its menu. */}
                    <Row label={t`Weight`} middle>
                      {compared.map((b) => {
                        const key = keyOf(b);
                        const mine = ownedKeys.has(key);
                        return (
                          <td key={key} className="px-1 py-1 align-middle">
                            <span className="flex flex-col items-center">
                              {mine || !onWeightChange ? (
                                <span className="flex min-h-11 items-center text-subhead font-medium tabular-nums text-ink">{lb(b.weight)}</span>
                              ) : (
                                <Select
                                  variant="menu"
                                  aria-label={t({ message: `Weight of ${{ ball: b.ball.name }}`, comment: "The spoken name of the menu that picks one compared bowling ball's weight in pounds" })}
                                  value={String(b.weight)}
                                  onChange={(e) => onWeightChange(key, Number(e.target.value))}
                                >
                                  {weightOptions(b).map((w) => (
                                    <option key={w} value={String(w)}>
                                      {lb(w)}
                                    </option>
                                  ))}
                                </Select>
                              )}
                              {mine && <BallTag kind="owned" />}
                            </span>
                          </td>
                        );
                      })}
                    </Row>
                    <Row label={t({ message: "Cover type", comment: "Bowling term: the kind of coverstock (solid, pearl or hybrid), as opposed to one cover by name" })}>
                      {compared.map((b) => (
                        <Cell key={keyOf(b)}>{b.ball.coverstockCategory ? coverstockLabel(b.ball.coverstockCategory) : "-"}</Cell>
                      ))}
                    </Row>
                    <Row label={t({ message: "Cover", comment: "Bowling term: one coverstock by name, a filter field" })}>
                      {compared.map((b) => (
                        <Cell key={keyOf(b)} small>{b.ball.coverstockRaw || "-"}</Cell>
                      ))}
                    </Row>
                    <Row label={t({ message: "Factory finish", comment: "Bowling term: the surface finish a ball ships with, such as polished or sanded" })}>
                      {compared.map((b) => (
                        <Cell key={keyOf(b)} small>{b.ball.factoryFinish ?? "-"}</Cell>
                      ))}
                    </Row>
                    <Row label={t({ message: "Core", comment: "Bowling term: the weight block inside a ball" })}>
                      {compared.map((b) => (
                        <Cell key={keyOf(b)} small>{b.ball.coreName ?? "-"}</Cell>
                      ))}
                    </Row>
                    <Row label={t({ message: "Core type", comment: "Bowling term: whether a ball has a symmetric or asymmetric core" })}>
                      {compared.map((b) => (
                        <Cell key={keyOf(b)}>{b.ball.coreType ? coreTypeLabel(b.ball.coreType) : "-"}</Cell>
                      ))}
                    </Row>
                    <Row label={t({ message: "RG", comment: "Bowling term: radius of gyration, a ball spec" })}>
                      {specs.map((sp, i) => (
                        <Cell key={keyOf(compared[i])} num>
                          {sp.rg != null ? formatFixed(sp.rg, 2) : "-"}
                          {!sp.exact && "*"}
                        </Cell>
                      ))}
                    </Row>
                    <Row label={t({ message: "Diff", comment: "Bowling term: the differential, a ball spec (short for differential RG)" })}>
                      {specs.map((sp, i) => (
                        <Cell key={keyOf(compared[i])} num>
                          {sp.diff != null ? formatFixed(sp.diff, 3) : "-"}
                          {!sp.exact && "*"}
                        </Cell>
                      ))}
                    </Row>
                    <Row label={t({ message: "MB diff", comment: "Bowling term: the mass bias differential, a ball spec" })}>
                      {specs.map((sp, i) => (
                        <Cell key={keyOf(compared[i])} num>
                          {sp.mbDiff != null ? formatFixed(sp.mbDiff, 3) : "-"}
                        </Cell>
                      ))}
                    </Row>
                    <Row label={t({ message: "Released", comment: "When a bowling ball came out, a row label" })} last>
                      {compared.map((b) => (
                        <Cell key={keyOf(b)}>{formatReleaseDate(b.ball.releaseDate) ?? "-"}</Cell>
                      ))}
                    </Row>
                  </tbody>
                </table>
              </div>
              {standIns && (
                <p className="px-1 text-caption text-ink-secondary">
                  {t({ message: "* No specs listed at that weight, so its 15 lb numbers are shown.", comment: "A footnote under a comparison table: one ball lists no specs at the weight it is compared at" })}
                </p>
              )}
            </>
          )
        ) : (
          <div className="rounded-xl border border-edge bg-surface p-3 shadow-sm">
            <BallGraph
              points={points}
              activeKey={peek?.point.key ?? null}
              onPick={openPeek}
              onTerm={(which, anchor) => setTerm({ term: which, anchor })}
            />
            {/* The bag's switch over the key it switches (ADR-263): all on, it
                takes them off; some or none, it puts them all on. */}
            {bagKeys.length > 0 && (
              <div className="mt-3 flex min-h-11 flex-wrap items-center gap-2">
                <Chip
                  selected={bagShown === bagKeys.length}
                  aria-pressed={bagShown === bagKeys.length ? true : bagShown === 0 ? false : "mixed"}
                  onClick={toggleBag}
                >
                  {bagShown > 0 && bagShown < bagKeys.length
                    ? t({ message: `Your bag, ${{ shown: bagShown }} of ${{ total: bagKeys.length }}`, comment: "A switch over the graph's key: how many of the bowler's own balls are shown, out of all of them" })
                    : plural(ownedCount, {
                        one: "Your bag, # ball",
                        other: "Your bag, # balls"
                      })}
                </Chip>
              </div>
            )}
            {keyPoints.length > 0 ? (
              <ol className={`${bagKeys.length > 0 ? "mt-1" : "mt-3"} grid grid-cols-1 gap-x-3 gap-y-1 min-[380px]:grid-cols-2`}>
                {keyPoints.map((p) => {
                  const on = isOn(p);
                  const name = `${p.ball.name}, ${lb(p.weight)}`;
                  return (
                    <li key={p.key} className="flex min-w-0 items-center gap-1">
                      {/* The photo switches the ball on and off the graph;
                          the words beside it open its card (ADR-263). */}
                      <button
                        type="button"
                        onClick={(e) => tapKeyPhoto(p, e.currentTarget)}
                        aria-pressed={on}
                        aria-label={
                          p.selected
                            ? t({ message: `Remove ${{ ball: p.ball.name }}, ${{ weight: lb(p.weight) }}`, comment: "Takes one bowling ball, at one weight, out of the comparison" })
                            : t({ message: `Show ${{ ball: name }} on the graph`, comment: "A switch in a graph's key: draws one of the bowler's own balls on the graph, or hides it" })
                        }
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full active:opacity-60"
                      >
                        <span
                          aria-hidden="true"
                          className={`relative block h-8 w-8 rounded-full ${
                            !on ? "opacity-40" : p.selected ? "ring-[3px] ring-accent" : "ring-[1.5px] ring-ink-secondary"
                          }`}
                        >
                          <span className="block h-8 w-8 overflow-hidden rounded-full">
                            <CatalogBallImage src={p.ball.imageThumb} alt="" brand={p.ball.brand} size="thumb" />
                          </span>
                          <span
                            className={`absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-caption-2 font-bold leading-none ring-1 ring-surface ${
                              p.selected ? "bg-accent-fill text-accent-on-fill" : "bg-ink-strong text-surface"
                            }`}
                          >
                            {formatNumber(p.n)}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => openPeek(p, e.currentTarget.getBoundingClientRect())}
                        className={`flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded-lg px-1 text-left text-footnote active:bg-ink/10 ${on ? "" : "opacity-50"}`}
                      >
                        <span className="block break-words font-semibold leading-tight text-ink">{p.ball.name}</span>
                        {/* Its weight beside its tags: the same ball can be on
                            the graph twice, and the bag's sit at their own. */}
                        <span className="mt-0.5 flex flex-wrap items-center gap-1">
                          <span className="text-caption font-semibold tabular-nums text-ink-secondary">{lb(p.weight)}</span>
                          {p.selected && <BallTag kind="selected" />}
                          {p.owned && <BallTag kind="owned" />}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="mt-3 text-center text-footnote text-ink-secondary">{empty}</p>
            )}
          </div>
        )}
        {addButton}
      </div>
      {removing && (
        <RemoveFromCompare anchor={removing.anchor} onRemove={() => onRemove(removing.key)} onClose={() => setRemoving(null)} />
      )}
      {term && <GraphTermNote term={term.term} anchor={term.anchor} onClose={() => setTerm(null)} />}
      {peek && (
        <BallPeek
          ball={peek.point.ball}
          anchor={peek.anchor}
          weight={peek.point.weight}
          selected={peek.point.selected}
          owned={peek.point.owned}
          onClose={() => setPeek(null)}
          onOpen={() => {
            setPeek(null);
            onOpenBall?.(peek.point.ball.id);
          }}
        />
      )}
    </PushScreen>
  );
}

function Row({ label, children, last = false, middle = false }: { label: string; children: ReactNode; last?: boolean; middle?: boolean }) {
  return (
    <tr className={last ? "" : "border-b border-edge"}>
      <th scope="row" className={`sticky left-0 z-[1] bg-surface px-2 py-2 text-left ${middle ? "align-middle" : "align-top"} text-caption font-semibold text-ink-secondary`}>
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
