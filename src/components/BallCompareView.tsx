import { plural, t } from "@lingui/core/macro";
import { X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { closeToOwned, marked, specsAt, weightsOf } from "../lib/ballCompare";
import { formatReleaseDate } from "../lib/dates";
import { formatFixed } from "../lib/format";
import type { CatalogBall } from "../types/catalog";
import { BallMap } from "./BallMap";
import { CatalogBallImage } from "./CatalogBallImage";
import { coreTypeLabel, coverstockLabel } from "./catalogLabels";
import { PushScreen } from "./PushScreen";
import { Chip } from "./ui/Chip";
import { IconButton } from "./ui/IconButton";
import { SegmentedControl } from "./ui/SegmentedControl";

type Tab = "specs" | "map";

/**
 * Catalog balls side by side, and where they sit on the map (ADR-258).
 *
 * Specs is a table, one column a ball, at the weight the switch picks: the
 * per-weight RG, diff and MB diff are the catalog's own, and no other site we
 * found shows them. The lowest RG and the highest diff and MB diff are marked.
 * Map places the same balls on RG and diff over the whole catalog, with the
 * bowler's own bag, and says which owned ball a new one would do the job of.
 */
export function BallCompareView({
  compared,
  catalog,
  owned,
  onRemove,
  onBack,
  active = true
}: {
  compared: readonly CatalogBall[];
  catalog: readonly CatalogBall[];
  owned: readonly CatalogBall[];
  onRemove: (id: string) => void;
  onBack: () => void;
  active?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("specs");
  const weights = weightsOf(compared);
  const [weight, setWeight] = useState(15);
  const at = weights.includes(weight) ? weight : 15;
  const [showOwned, setShowOwned] = useState(true);
  const ownedIds = new Set(owned.map((b) => b.id));
  const near = closeToOwned(compared, owned, at);
  const ownedCount = owned.length;

  const specs = compared.map((b) => specsAt(b, at));
  const rgMarks = marked(specs.map((s) => s.rg), "low");
  const diffMarks = marked(specs.map((s) => s.diff), "high");
  const mbMarks = marked(specs.map((s) => s.mbDiff), "high");
  const standIns = specs.some((s) => !s.exact);

  const nearNotes =
    near.length > 0 ? (
      <ul className="space-y-1.5">
        {near.map((n) => (
          <li key={n.ball.id} className="rounded-xl bg-accent-soft px-3 py-2 text-footnote text-ink">
            {t({
              message: `${{ ball: n.ball.name }} rolls much like ${{ owned: n.owned.name }} in your bag.`,
              comment: "Two bowling balls with nearly the same specs and the same cover type: a compared ball, and one the bowler owns"
            })}
          </li>
        ))}
      </ul>
    ) : null;

  return (
    <PushScreen title={t({ message: "Compare", comment: "The title of the screen that compares bowling balls side by side" })} onBack={onBack} active={active} backCloses>
      <div className="mx-auto w-full max-w-3xl space-y-3 px-3 pb-6 pt-2 sm:px-6">
        <SegmentedControl<Tab>
          label={t({ message: "Compare by", comment: "The spoken name of the switch between a table of specs and a map" })}
          options={[
            { value: "specs", label: t({ message: "Specs", comment: "A tab: bowling ball specs side by side" }) },
            { value: "map", label: t({ message: "Map", comment: "A tab: bowling balls placed on a chart of RG and differential" }) }
          ]}
          value={tab}
          onChange={setTab}
        />
        {weights.length > 1 && (
          <SegmentedControl<string>
            label={t({ message: "Ball weight", comment: "The spoken name of the switch between ball weights in pounds" })}
            options={weights.map((w) => ({ value: String(w), label: t({ message: `${{ weight: w }} lb`, comment: "A ball weight in pounds, short" }) }))}
            value={String(at)}
            onChange={(v) => setWeight(Number(v))}
          />
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
                            {ownedIds.has(b.id) && (
                              <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-caption-2 font-bold uppercase tracking-wide text-accent">
                                {t({ message: "Owned", comment: "A badge on a ball you already have in your arsenal" })}
                              </span>
                            )}
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
                        <Cell key={compared[i].id} mark={rgMarks[i]} num>
                          {s.rg != null ? formatFixed(s.rg, 2) : "-"}
                          {!s.exact && "*"}
                        </Cell>
                      ))}
                    </Row>
                    <Row label={t({ message: "Diff", comment: "Bowling term: the differential, a ball spec (short for differential RG)" })}>
                      {specs.map((s, i) => (
                        <Cell key={compared[i].id} mark={diffMarks[i]} num>
                          {s.diff != null ? formatFixed(s.diff, 3) : "-"}
                          {!s.exact && "*"}
                        </Cell>
                      ))}
                    </Row>
                    <Row label={t({ message: "MB diff", comment: "Bowling term: the mass bias differential, a ball spec" })}>
                      {specs.map((s, i) => (
                        <Cell key={compared[i].id} mark={mbMarks[i]} num>
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
              <p className="px-1 text-caption text-ink-secondary">
                <span aria-hidden="true" className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-accent-soft ring-1 ring-accent/40 align-middle" />
                {t({ message: "Marked: the lowest RG revs up soonest, the highest diff and MB diff flare most.", comment: "Bowling terms: RG, diff and MB diff are ball specs. Explains the highlighted cells of a comparison table." })}
                {standIns && (
                  <span className="mt-1 block">
                    {t({ message: `* No specs listed at ${{ weight: at }} lb, so its 15 lb numbers are shown.`, comment: "A footnote under a comparison table: one ball lists no specs at the chosen weight" })}
                  </span>
                )}
              </p>
              {compared.length === 1 && (
                <p className="px-1 text-footnote text-ink-secondary">
                  {t({ message: "Add another ball from the catalog to compare.", comment: "Shown under a comparison holding a single ball" })}
                </p>
              )}
              {nearNotes}
            </>
          )
        ) : (
          <>
            <div className="rounded-xl border border-edge bg-surface p-3 shadow-sm">
              <BallMap catalog={catalog} compared={compared} owned={owned} weight={at} showOwned={showOwned} />
            </div>
            {owned.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <Chip selected={showOwned} onClick={() => setShowOwned((v) => !v)}>
                  {plural(ownedCount, {
                    one: "Your bag, # ball",
                    other: "Your bag, # balls"
                  })}
                </Chip>
              </div>
            )}
            <p className="px-1 text-caption text-ink-secondary">
              {t({
                message: "Each dot is a catalog ball, colored by its cover type. Two balls close together roll much alike.",
                comment: "Explains a chart of bowling balls by RG and differential"
              })}
            </p>
            {nearNotes}
          </>
        )}
      </div>
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

function Cell({ children, mark = false, num = false, small = false }: { children: ReactNode; mark?: boolean; num?: boolean; small?: boolean }) {
  return (
    <td className={`break-words px-1 py-2 align-top ${small ? "text-caption" : ""} ${num ? "tabular-nums" : ""} text-ink`}>
      <span className={mark ? "inline-block rounded-md bg-accent-soft px-1.5 font-semibold text-accent ring-1 ring-accent/30" : ""}>{children}</span>
    </td>
  );
}
