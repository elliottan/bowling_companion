import { ExternalLink, FileText } from "lucide-react";
import { GuideFigure } from "../components/GuideFigure";
import { PushScreen } from "../components/PushScreen";
import { ListGroup, ListRow } from "../components/ui/ListGroup";
import { GROUP_HEADING } from "../components/ui/typography";
import { findGuide, guidesByTopic, type Guide, type GuideBlock } from "../lib/guides";

interface GuidesViewProps {
  onBack: () => void;
  /** The article on top of the list, or null for the list itself. */
  openGuideId: string | null;
  onOpenGuide: (guideId: string) => void;
}

/** How long the guide takes to read, on the row and under the title. */
function readingTime(guide: Guide): string {
  return `${guide.minutes} min read`;
}

/**
 * The list of guides, and one article pushed on top of it.
 *
 * Both screens live in this file, and the article is a second `PushScreen`
 * rather than a route of its own, exactly as the catalog and its ball detail
 * do: the article only exists while the list is underneath it, so the list
 * owns which one is open and back closes it first (appNavigation).
 */
export function GuidesView({ onBack, openGuideId, onOpenGuide }: GuidesViewProps) {
  const open = findGuide(openGuideId);

  return (
    <>
      <PushScreen title="Guides" onBack={onBack} active={!open}>
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

      {open && <GuideArticle guide={open} onBack={onBack} />}
    </>
  );
}

/** One article. `onBack` is the same pop as the list's: the reducer takes the
 *  open guide off before it touches the overlay stack. */
function GuideArticle({ guide, onBack }: { guide: Guide; onBack: () => void }) {
  return (
    <PushScreen title={guide.title} onBack={onBack}>
      <article className="mx-auto w-full max-w-xl px-4 py-5 sm:px-6">
        <h2 className="text-xl font-bold text-ink">{guide.title}</h2>
        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
          {guide.topic} · {readingTime(guide)}
        </p>

        <div className="mt-4 space-y-4">
          {guide.body.map((block, i) => (
            <Block key={i} block={block} />
          ))}
        </div>

        {guide.sources && guide.sources.length > 0 && (
          <div className="mt-8">
            <ListGroup heading="Sources">
              {guide.sources.map((source) => (
                <ListRow
                  key={source.url}
                  label={source.label}
                  href={source.url}
                  ariaLabel={`${source.label}, opens in a new tab`}
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

/** The block union rendered one shape at a time. Prose sits at 15px with open
 *  leading: this is the one screen in the app that is read rather than scanned,
 *  and the dense type the score panels want is unreadable at length. */
function Block({ block }: { block: GuideBlock }) {
  switch (block.kind) {
    case "heading":
      return <h3 className={`pt-2 ${GROUP_HEADING}`}>{block.text}</h3>;

    case "text":
      return <p className="text-[15px] leading-relaxed text-ink">{block.text}</p>;

    case "list":
      return (
        <ul className="space-y-2">
          {block.items.map((item) => (
            <li key={item} className="flex gap-2.5 text-[15px] leading-relaxed text-ink">
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
              <dd className="mt-0.5 text-[15px] leading-relaxed text-ink-secondary">{item.text}</dd>
            </div>
          ))}
        </dl>
      );

    case "figure":
      return <GuideFigure figure={block.figure} caption={block.caption} />;

    case "note":
      return (
        <p className="rounded-xl border border-edge bg-accent-soft p-3 text-[15px] leading-relaxed text-ink">
          {block.text}
        </p>
      );
  }
}
