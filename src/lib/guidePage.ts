import { guideAppPath, type Guide } from "./guides";

/**
 * The page behind a shared guide link: `/guides/<id>`.
 *
 * It exists for the preview. A chat app builds the card under a pasted link by
 * fetching the URL, reading the `og:` tags out of the HTML and ignoring the
 * `#`, and it runs no script. The app is one page, so every guide link would
 * preview as the app. This page carries the guide's own title, one-line summary
 * and card image, then sends a person straight into the app on that guide.
 *
 * Generated (`npm run guide-pages`) and committed, like the icons and the
 * screenshots, and held to the guides by a test, so a retitled guide cannot
 * keep an old preview. Self-contained for the same reason the landing page is:
 * no bundle, no stylesheet request.
 */

/** The site, absolute, because scrapers do not resolve a relative image URL. */
export const SITE = "https://headpin.app";

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function guidePageUrl(guide: Guide): string {
  return `${SITE}/guides/${encodeURIComponent(guide.id)}`;
}

export function guideCardUrl(guide: Guide): string {
  return `${guidePageUrl(guide)}/card.png`;
}

export function renderGuidePage(guide: Guide): string {
  const title = `${guide.title}, Headpin`;
  const description = guide.summary;
  const appPath = guideAppPath(guide.id);
  const url = guidePageUrl(guide);
  const card = guideCardUrl(guide);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0b1220" />
    <link rel="icon" type="image/png" sizes="96x96" href="/icons/icon-96.png" />
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />

    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${url}" />
    <!-- A page that only hands a visitor on is not one to list in a search. -->
    <meta name="robots" content="noindex" />

    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="Headpin" />
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${escapeHtml(guide.title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${card}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${escapeHtml(`Headpin guide: ${guide.title}`)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(guide.title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${card}" />

    <!-- Script first, and replace so back does not land here again. The refresh
         is for a browser that will not run it. -->
    <script>location.replace(${JSON.stringify(appPath)});</script>
    <meta http-equiv="refresh" content="0; url=${appPath}" />
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #0b1220;
        color: #f1f5f9;
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
        text-align: center;
        padding: 1rem;
      }
      a { color: #5ed6c1; font-weight: 600; }
    </style>
  </head>
  <body>
    <p><a href="${appPath}">Open ${escapeHtml(guide.title)} in Headpin</a></p>
  </body>
</html>
`;
}
