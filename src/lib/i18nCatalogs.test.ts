import { describe, expect, it } from "vitest";
import { parse, type Token } from "@messageformat/parser";
import { SOURCE_LOCALE, SUPPORTED_LOCALES } from "./i18n";

/**
 * The mechanical half of checking a translation (docs/I18N.md, "Checking a
 * translation"): what a broken entry does to the app, whatever the language.
 * A placeholder renamed or dropped shows the bowler a blank or the wrong
 * number, a numbered tag lost drops the bold word or the icon, and a plural
 * category the language does not have is never chosen. None of it is caught
 * by `i18n:check`, which only asks that every entry has a translation.
 *
 * Whether the words are right is the other half, and no test reads that.
 */

const catalogs = import.meta.glob<string>("../locales/*/messages.po", {
  query: "?raw",
  import: "default",
  eager: true
});

type Entry = { ctx: string; id: string; str: string };

function unescape(s: string): string {
  return s.replace(/\\(["\\n])/g, (_, c: string) => (c === "n" ? "\n" : c));
}

function entries(locale: string): Entry[] {
  const po = catalogs[`../locales/${locale}/messages.po`];
  return po
    .split(/\n\s*\n/)
    .map((e) => ({
      ctx: e.match(/^msgctxt "(.*)"$/m)?.[1] ?? "",
      id: e.match(/^msgid "(.*)"$/m)?.[1] ?? "",
      str: e.match(/^msgstr "(.*)"$/m)?.[1] ?? ""
    }))
    .filter((e) => e.id !== "")
    .map((e) => ({ ctx: e.ctx, id: unescape(e.id), str: unescape(e.str) }));
}

type Shape = {
  /** Arguments used outside any plural `one`/`=n` branch: every language needs them. */
  required: Set<string>;
  /** Every argument used anywhere. */
  all: Set<string>;
  pluralKeys: string[][];
  hashes: number;
  tags: string;
};

function shape(message: string): Shape {
  const out: Shape = { required: new Set(), all: new Set(), pluralKeys: [], hashes: 0, tags: "" };
  const walk = (tokens: Token[], optional: boolean) => {
    for (const token of tokens) {
      if (token.type === "content") continue;
      if (token.type === "octothorpe") {
        out.hashes++;
        continue;
      }
      out.all.add(token.arg);
      if (!optional) out.required.add(token.arg);
      if (token.type === "select" || token.type === "plural" || token.type === "selectordinal") {
        if (token.type !== "select") out.pluralKeys.push(token.cases.map((c) => c.key));
        for (const c of token.cases) {
          walk(c.tokens, optional || (token.type !== "select" && c.key !== "other"));
        }
      }
    }
  };
  walk(parse(message, { strict: false }), false);
  out.tags = (message.match(/<\/?\d+\/?>/g) ?? []).sort().join(" ");
  return out;
}

const source = new Map(entries(SOURCE_LOCALE).map((e) => [`${e.ctx}\u0004${e.id}`, e]));
const translated = SUPPORTED_LOCALES.filter((l) => l !== SOURCE_LOCALE);

describe.each(translated)("the %s catalog keeps every message working", (locale) => {
  const list = entries(locale).filter((e) => source.has(`${e.ctx}\u0004${e.id}`));
  const categories = new Set(new Intl.PluralRules(locale).resolvedOptions().pluralCategories);

  it("parses as a message", () => {
    const broken = list.filter((e) => {
      try {
        parse(e.str, { strict: false });
        return false;
      } catch {
        return true;
      }
    });
    expect(broken.map((e) => e.id)).toEqual([]);
  });

  it("keeps the placeholders, and invents none", () => {
    const wrong = list.flatMap((e) => {
      const want = shape(e.id);
      const got = shape(e.str);
      const missing = [...want.required].filter((a) => !got.all.has(a));
      const invented = [...got.all].filter((a) => !want.all.has(a));
      return missing.length || invented.length ? [{ id: e.id, missing, invented }] : [];
    });
    expect(wrong).toEqual([]);
  });

  it("keeps the numbered tags", () => {
    const wrong = list.filter((e) => shape(e.id).tags !== shape(e.str).tags).map((e) => e.id);
    expect(wrong).toEqual([]);
  });

  it("keeps the count in a plural, and uses only the language's plural forms", () => {
    const wrong = list.filter((e) => {
      const want = shape(e.id);
      const got = shape(e.str);
      if (want.hashes > 0 && got.hashes === 0) return true;
      return got.pluralKeys.some(
        (keys) => !keys.includes("other") || keys.some((k) => !k.startsWith("=") && !categories.has(k as Intl.LDMLPluralRule))
      );
    });
    expect(wrong.map((e) => e.id)).toEqual([]);
  });

  it("writes no em or en dash, and no other language's script", () => {
    const wrong = list.filter(
      (e) =>
        /[\u2013\u2014]/.test(e.str) ||
        (locale !== "ko" && /[\uac00-\ud7af]/.test(e.str)) ||
        (locale !== "ja" && /[\u3040-\u30ff]/.test(e.str))
    );
    expect(wrong.map((e) => `${e.id} => ${e.str}`)).toEqual([]);
  });
});
