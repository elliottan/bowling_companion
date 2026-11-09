import { t } from "@lingui/core/macro";
import { Check, ExternalLink, FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { GuideFigure } from "../components/GuideFigure";
import { PushScreen } from "../components/PushScreen";
import { IconButton } from "../components/ui/IconButton";
import { ShareIosIcon } from "../components/icons";
import { LIST_DIVIDER, ListGroup, ListRow } from "../components/ui/ListGroup";
import { GROUP_HEADING } from "../components/ui/typography";
import {
  findGuide,
  guideShareUrl,
  guidesByTopic,
  termSlug,
  type Guide,
  type GuideBlock,
  type GuideTerm
} from "../lib/guides";
import { fold } from "../lib/search";
import { TermFigure } from "../components/TermFigure";
import { SearchField } from "../components/ui/SearchField";
import { shareLinkFromApp } from "../lib/nativeShare";
import { isNativeApp, shareOrigin } from "../lib/platform";
import { formatNumber } from "../lib/format";

interface GuidesViewProps {
  onBack: () => void;
  /** The article on top of the list, or null for the list itself. */
  openGuideId: string | null;
  onOpenGuide: (guideId: string) => void;
  /** A term the open guide scrolls to and marks, from the app's search. */
  focusTerm?: string;
}

/** How long the guide takes to read, on the row and under the title. */
function readingTime(guide: Guide): string {
  return t`${{ minutes: formatNumber(guide.minutes) }} min read`;
}

/**
 * The list of guides, and one article pushed on top of it.
 *
 * Both screens live in this file, and the article is a second `PushScreen`
 * rather than a route of its own, exactly as the catalog and its ball detail
 * do: the article only exists while the list is underneath it, so the list
 * owns which one is open and back closes it first (appNavigation).
 */
export function GuidesView({ onBack, openGuideId, onOpenGuide, focusTerm }: GuidesViewProps) {
  const open = findGuide(openGuideId);

  return (
    <>
      <PushScreen history="route" title={t`Guides`} onBack={onBack} active={!open}>
        <div className="mx-auto w-full max-w-xl space-y-5 px-3 py-4 sm:px-6">
          {guidesByTopic().map(({ topic, guides }) => (
            <ListGroup key={topic} heading={topic}>
              {guides.map((guide) => (
                <ListRow
                  key={guide.id}
                  icon={FileText}
                  label={guide.title}
                  description={guide.summary}
                  onClick={() => onOpenGuide(guide.id)}
                />
              ))}
            </ListGroup>
          ))}
        </div>
      </PushScreen>

      {open && <GuideArticle key={open.id} guide={open} onBack={onBack} focusTerm={focusTerm} />}
    </>
  );
}

/** One article. `onBack` is the same pop as the list's: the reducer takes the
 *  open guide off before it touches the overlay stack. */
function GuideArticle({ guide, onBack, focusTerm }: { guide: Guide; onBack: () => void; focusTerm?: string }) {
  // Where there is no share sheet the link goes to the clipboard, and the
  // button says so for a moment: a copy nobody is told about reads as a dead
  // button.
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function share() {
    const url = guideShareUrl(guide.id, shareOrigin());
    try {
      if (isNativeApp()) {
        await shareLinkFromApp(guide.title, url);
      } else if (typeof navigator.share === "function") {
        await navigator.share({ title: guide.title, url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      }
    } catch {
      // A dismissed share sheet rejects, and cancelling is not a failure. A
      // clipboard that refuses has nothing further to fall back to.
    }
  }

  return (
    <PushScreen
      history="route"
      title={guide.title}
      onBack={onBack}
      trailing={
        <IconButton variant="round" label={t`Share guide`} onClick={() => void share()}>
          {copied ? (
            <Check size={18} aria-hidden="true" />
          ) : (
            <ShareIosIcon size={18} aria-hidden="true" />
          )}
        </IconButton>
      }
    >
      <span role="status" className="sr-only">
        {copied ? t`Link copied` : ""}
      </span>
      {/* The guide's title is the screen's large title, above this. */}
      <article className="mx-auto w-full max-w-xl px-4 pb-5 pt-1 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
          {guide.topic} · {readingTime(guide)}
        </p>

        {guide.glossary ? (
          <Glossary guide={guide} focusTerm={focusTerm} />
        ) : (
          <div className="mt-4 space-y-4">
            {guide.body.map((block, i) => (
              <Block key={i} block={block} />
            ))}
          </div>
        )}

        {guide.sources && guide.sources.length > 0 && (
          <div className="mt-8">
            <ListGroup heading={t`Sources`}>
              {guide.sources.map((source) => (
                <ListRow
                  key={source.url}
                  label={source.label}
                  href={source.url}
                  ariaLabel={t`${{ label: source.label }}, opens in a new tab`}
                  trailing={
                    <ExternalLink
                      size={16}
                      aria-hidden="true"
                      className="shrink-0 text-ink-tertiary"
                    />
                  }
                />
              ))}
            </ListGroup>
          </div>
        )}
      </article>
    </PushScreen>
  );
}

/** Whether a term answers a search typed on its page: its name, its other
 *  names and its meaning, accents and case aside. */
function termMatches(item: GuideTerm, query: string): boolean {
  const q = fold(query);
  if (!q) return true;
  return fold([item.term, ...(item.aliases ?? []), item.text].join(" ")).includes(q);
}

/**
 * A page of terms (ADR-249): every short definition on one page, grouped
 * under its headings, each with its picture, and a search at the top that
 * narrows the page as it is typed. A heading whose terms all fall away goes
 * with them.
 *
 * Opened from the app's search on one term, it scrolls to that term and
 * marks it for a moment, so the answer is the first thing seen.
 */
function Glossary({ guide, focusTerm }: { guide: Guide; focusTerm?: string }) {
  const [query, setQuery] = useState("");
  const [marked, setMarked] = useState<string | null>(focusTerm ?? null);

  useEffect(() => {
    if (!focusTerm) return;
    // After the push has laid the page out, so the scroll lands.
    const frame = requestAnimationFrame(() => {
      document.getElementById(`term-${focusTerm}`)?.scrollIntoView({ block: "center" });
    });
    const timer = window.setTimeout(() => setMarked(null), 1800);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [focusTerm]);

  // Pairs each terms block with the heading over it.
  const groups: Array<{ heading: string | null; items: GuideTerm[] }> = [];
  let heading: string | null = null;
  for (const block of guide.body) {
    if (block.kind === "heading") heading = block.text;
    else if (block.kind === "terms") groups.push({ heading, items: block.items });
  }
  const shown = groups
    .map((g) => ({ ...g, items: g.items.filter((item) => termMatches(item, query)) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="mt-3">
      {/* Top 0: the push's scroll area is padded by its bar's height, and a
          sticky row already stops at that padding. Adding --push-bar-h again
          held the field a bar's height too low, with the list showing
          through above it. */}
      <div className="sticky top-0 z-10 -mx-1 bg-surface-sunken px-1 py-2">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder={t({ message: "Search terms", comment: "Placeholder of the search on the Bowling terms page" })}
          label={t({ message: "Search terms", comment: "Placeholder of the search on the Bowling terms page" })}
        />
      </div>
      {shown.length === 0 ? (
        <p className="mt-6 text-center text-subhead text-ink-secondary">
          {t`No terms match “${{ query: query.trim() }}”`}
        </p>
      ) : (
        <div className="mt-2 space-y-5">
          {shown.map((group) => (
            <section key={group.heading ?? "terms"}>
              {group.heading && <h3 className={`mb-1.5 px-4 ${GROUP_HEADING}`}>{group.heading}</h3>}
              <ul className="overflow-hidden rounded-[26px] bg-surface">
                {group.items.map((item) => {
                  const id = termSlug(item.term);
                  return (
                    <li
                      key={id}
                      id={`term-${id}`}
                      className={`${LIST_DIVIDER} scroll-mt-32 px-4 py-3 transition-colors duration-700 ${
                        marked === id ? "bg-accent-soft" : ""
                      }`}
                    >
                      <h4 className="text-headline text-ink">{item.term}</h4>
                      <p className="mt-0.5 text-subhead leading-relaxed text-ink-secondary">{item.text}</p>
                      {item.figure && (
                        <div className="mt-2.5">
                          <TermFigure figure={item.figure} term={item.term} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/** The block union rendered one shape at a time. Prose sits at 15px with open
 *  leading: this is the one screen in the app that is read rather than scanned,
 *  and the dense type the score panels want is unreadable at length. */
function Block({ block }: { block: GuideBlock }) {
  switch (block.kind) {
    case "heading":
      return <h3 className={`pt-2 ${GROUP_HEADING}`}>{block.text}</h3>;

    case "text":
      return <p className="text-subhead leading-relaxed text-ink">{block.text}</p>;

    case "list":
      return (
        <ul className="space-y-2">
          {block.items.map((item) => (
            <li key={item} className="flex gap-2.5 text-subhead leading-relaxed text-ink">
              <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <span className="min-w-0">{item}</span>
            </li>
          ))}
        </ul>
      );

    case "terms":
      return (
        <dl className="space-y-3 rounded-xl border border-edge bg-surface p-3 shadow-sm">
          {block.items.map((item) => (
            <div key={item.term}>
              <dt className="text-sm font-bold text-ink">{item.term}</dt>
              <dd className="mt-0.5 text-subhead leading-relaxed text-ink-secondary">{item.text}</dd>
              {item.figure && (
                <dd className="mt-2">
                  <TermFigure figure={item.figure} term={item.term} />
                </dd>
              )}
            </div>
          ))}
        </dl>
      );

    case "figure":
      return <GuideFigure figure={block.figure} caption={block.caption} />;
  }
}
