import type { MouseEvent } from "react";
import { PushScreen } from "../components/PushScreen";
import { legalBody } from "../lib/legalPage";
import { openInAppBrowser } from "../lib/inAppBrowser";
import { openMail } from "../lib/links";
import { isNativeApp } from "../lib/platform";
import legalPage from "../../legal/index.html?raw";

// The site's page is the one copy of the text; this is read from it at build time.
const BODY = legalBody(legalPage);

/**
 * Privacy and terms as a screen in the app, pushed from Settings, rather than a
 * trip to the site. The text is the site's own page (ADR-181), styled here with
 * the app's type, so a store reviewer's public URL and the bowler's screen
 * never say different things.
 */
export function LegalView({ onBack }: { onBack: () => void }) {
  // The page's links are plain anchors. A contents link scrolls this screen
  // instead of writing a hash into the app's history, an email opens Mail, and
  // any other link leaves the way every outbound link does.
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const link = (event.target as HTMLElement).closest("a");
    const href = link?.getAttribute("href");
    if (!href) return;
    event.preventDefault();
    if (href.startsWith("#")) {
      event.currentTarget.querySelector(href)?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (href.startsWith("mailto:")) {
      openMail(href);
    } else if (isNativeApp()) {
      void openInAppBrowser(href).catch(() => window.open(href, "_blank", "noopener"));
    } else {
      window.open(href, "_blank", "noopener");
    }
  };

  return (
    <PushScreen mode="inline" title="Privacy and terms" onBack={onBack}>
      <div
        onClick={onClick}
        className={[
          "mx-auto w-full max-w-xl px-4 py-4 pb-10 text-subhead leading-relaxed text-ink-secondary sm:px-6",
          "[&_a]:font-semibold [&_a]:text-accent",
          "[&_h2]:mt-9 [&_h2]:scroll-mt-16 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink",
          "[&_h3]:mt-6 [&_h3]:font-bold [&_h3]:text-ink",
          "[&_p]:mt-3 [&_strong]:text-ink",
          "[&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5",
          "[&_.stamp]:mt-0 [&_.stamp]:text-xs [&_.stamp]:font-semibold [&_.stamp]:uppercase [&_.stamp]:tracking-wide",
          "[&_.lede]:text-base [&_.lede]:text-ink",
          "[&_.summary]:mt-6 [&_.summary]:rounded-xl [&_.summary]:border [&_.summary]:border-edge [&_.summary]:bg-surface [&_.summary]:p-4 [&_.summary]:shadow-sm",
          "[&_.summary_h2]:mt-0 [&_.summary_h2]:text-base [&_.summary_p]:mt-2",
          "[&_nav_ul]:space-y-1"
        ].join(" ")}
        // Trusted, static text from this repository's own page, not anything a bowler typed.
        dangerouslySetInnerHTML={{ __html: BODY }}
      />
    </PushScreen>
  );
}
