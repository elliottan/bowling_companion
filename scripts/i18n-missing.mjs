// The gaps in the translated catalogs, out and back (ADR-224, the
// translate-strings skill).
//
//   node scripts/i18n-missing.mjs export <dir>
//     writes <dir>/<locale>.po for each language with untranslated messages,
//     holding only those entries, comments and all, for a translator to fill.
//   node scripts/i18n-missing.mjs apply <dir>
//     copies each filled msgstr in <dir>/<locale>.po into
//     src/locales/<locale>/messages.po, matched by msgctxt and msgid. An entry
//     still empty, or one the catalog no longer has, is reported and skipped.
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const dir = "src/locales";
const sourceLocale = "en";
const [mode, out] = process.argv.slice(2);
if (!["export", "apply"].includes(mode) || !out) {
  console.error("Usage: node scripts/i18n-missing.mjs export|apply <dir>");
  process.exit(2);
}

function entries(po) {
  return po.split(/\n\s*\n/).filter((e) => /^msgid /m.test(e));
}
function keyOf(entry) {
  const ctx = entry.match(/^msgctxt "(.*)"$/m)?.[1] ?? "";
  const id = entry.match(/^msgid "(.*)"$/m)?.[1];
  return id ? `${ctx}\u0004${id}` : null;
}
function msgstrOf(entry) {
  return entry.match(/^msgstr "(.*)"$/m)?.[1] ?? "";
}

const locales = readdirSync(dir).filter(
  (l) => l !== sourceLocale && existsSync(join(dir, l, "messages.po"))
);

if (mode === "export") {
  mkdirSync(out, { recursive: true });
  for (const locale of locales) {
    const missing = entries(readFileSync(join(dir, locale, "messages.po"), "utf8")).filter(
      (e) => keyOf(e) && msgstrOf(e) === ""
    );
    if (!missing.length) continue;
    writeFileSync(join(out, `${locale}.po`), missing.join("\n\n") + "\n");
    console.log(`${locale}: ${missing.length} to translate, in ${join(out, `${locale}.po`)}`);
  }
} else {
  for (const locale of locales) {
    const filled = join(out, `${locale}.po`);
    if (!existsSync(filled)) continue;
    const answers = new Map();
    for (const e of entries(readFileSync(filled, "utf8"))) {
      const key = keyOf(e);
      if (key) answers.set(key, msgstrOf(e));
    }
    const file = join(dir, locale, "messages.po");
    const po = readFileSync(file, "utf8");
    let applied = 0;
    const used = new Set();
    const next = po
      .split(/(\n\s*\n)/)
      .map((block) => {
        const key = keyOf(block);
        const answer = key && answers.get(key);
        if (!answer || msgstrOf(block) !== "") return block;
        used.add(key);
        applied += 1;
        return block.replace(/^msgstr ""$/m, () => `msgstr "${answer}"`);
      })
      .join("");
    writeFileSync(file, next);
    const skipped = [...answers].filter(([k, v]) => !used.has(k) && v === "").length;
    const stale = [...answers.keys()].filter((k) => !used.has(k) && answers.get(k) !== "").length;
    console.log(`${locale}: ${applied} applied, ${skipped} still empty, ${stale} not in the catalog`);
  }
}
