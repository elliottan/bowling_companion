/**
 * The privacy and terms text, read out of the site's own page (`legal/index.html`)
 * so the app shows it without a second copy to keep in step. The page's back
 * link, its heading and its footer go: in the app the bar carries the title and
 * the back arrow, and both point at the site.
 */
export function legalBody(html: string): string {
  const main = /<main>([\s\S]*?)<\/main>/.exec(html)?.[1] ?? "";
  return main
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<a class="back"[\s\S]*?<\/a>/, "")
    .replace(/<h1>[\s\S]*?<\/h1>/, "")
    .replace(/<footer>[\s\S]*?<\/footer>/, "")
    .trim();
}
