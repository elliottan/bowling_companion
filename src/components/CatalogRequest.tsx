import { ArrowUpRight, MailPlus } from "lucide-react";
import type { ReactNode } from "react";
import { catalogRequestMailto, openMail, type CatalogRequestKind } from "../lib/links";
import { BowlingBallIcon, OilPatternIcon } from "./icons";
import { Button } from "./ui/Button";
import { EmptyState } from "./ui/EmptyState";
import { ListGroup, ListRow } from "./ui/ListGroup";

function openRequest(kind: CatalogRequestKind, query: string) {
  openMail(catalogRequestMailto(kind, query));
}

const NOUN: Record<CatalogRequestKind, string> = { ball: "ball", pattern: "pattern" };

/**
 * What a search that found nothing says: the catalog is missing it, and the
 * bowler can ask for it. Only for a typed search. A list that filters emptied is
 * not missing anything, and the way out of that is clearing the filters.
 */
export function CatalogRequestEmpty({
  kind,
  query,
  children
}: {
  kind: CatalogRequestKind;
  query: string;
  /** Secondary ways out, below the request: clearing filters, adding by hand. */
  children?: ReactNode;
}) {
  const typed = query.trim();
  return (
    <EmptyState
      icon={kind === "ball" ? BowlingBallIcon : OilPatternIcon}
      title={`Nothing matches "${typed}"`}
      description={
        kind === "ball"
          ? "Tell us which ball it is and we'll add it to the catalog."
          : "Send us the pattern sheet and we'll add it to the catalog."
      }
    >
      <Button variant="primary" onClick={() => openRequest(kind, typed)}>
        <MailPlus size={16} aria-hidden="true" />
        Request this {NOUN[kind]}
      </Button>
      {children}
    </EmptyState>
  );
}

/** The quiet row at the end of a catalog list. Rare to reach, so it is quiet by
 *  where it sits, and it leaves the app, so it wears the outward arrow. */
export function CatalogRequestRow({ kind, query = "" }: { kind: CatalogRequestKind; query?: string }) {
  return (
    <div className="mt-4">
      <ListGroup>
        <ListRow
          icon={MailPlus}
          label={`Request a ${NOUN[kind]}`}
          onClick={() => openRequest(kind, query)}
          trailing={<ArrowUpRight size={16} aria-hidden="true" className="shrink-0 text-ink-tertiary" />}
        />
      </ListGroup>
    </div>
  );
}
