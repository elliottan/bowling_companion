---
name: translate-strings
description: >
  Translate the messages a language has no translation for, in every shipped
  language at once. Use when `npm run i18n:check` (and so `verify` and CI) fails
  with "Some messages have no translation", after adding or changing user-facing
  text, or when adding a new language's catalog.
---

# Translate strings

Every language Headpin ships must translate every message (ADR-224):
`npm run i18n:check` fails otherwise, because Lingui would quietly show English
on a translated screen. Changing or adding a `t`/`<Trans>`/`plural` message
therefore means translating it in the same PR. This skill does that.

The glossaries in `glossaries/<locale>.md` are the house style for each language:
the hard rules a broken entry would violate (placeholders, numbered tags, plural
forms per language), the tone, and the bowling vocabulary. Every translation
goes through them, so a string added next month reads like the rest.

## Steps

1. Bring the catalogs up to date with the source, which adds the new messages
   to every language with an empty `msgstr`:

   ```bash
   npm run i18n:extract
   ```

2. Write the gaps out, one file per language that has any. Use a fresh folder
   in the scratchpad:

   ```bash
   node scripts/i18n-missing.mjs export <dir>
   ```

3. Translate each `<dir>/<locale>.po`. For a handful of strings, do it yourself;
   for more (or several languages), give each language to a subagent (a
   cheaper model is fine). Either way the brief is `glossaries/<locale>.md`, and:
   - fill only `msgstr` lines, every entry, nothing else changed;
   - read the existing catalog `src/locales/<locale>/messages.po` for how
     neighbouring messages were worded, and reuse that wording;
   - for `zh-Hans`, start from the `zh-Hant` translation of the same msgid, as
     its glossary says, so translate `zh-Hant` first.

   A language with no glossary yet (a new one) needs one first: copy the
   closest existing glossary and rewrite its style and vocabulary sections.

4. Check each file before applying it: same entry count as exported, no empty
   `msgstr`, every `{placeholder}` and `<n>` tag of the msgid present, plural
   branches as the glossary says, no em or en dash.

5. Put the translations into the catalogs and check:

   ```bash
   node scripts/i18n-missing.mjs apply <dir>
   npm run i18n:check
   npx vitest run src/lib/i18n.test.ts
   ```

   `apply` reports, per language, how many it applied and any it skipped. The
   test compiles and loads every catalog, so a broken plural fails there.

6. Commit the catalogs with the change that added the text.

## A new language

Add its code to `lingui.config.ts`, `SUPPORTED_LOCALES` in `src/lib/i18n.ts`
and `CFBundleLocalizations` in `ios/App/App/Info.plist` (`docs/I18N.md`, "Adding
a language"), write its glossary here, then run the steps above: every message
is a gap. Split a whole catalog into four or so parts for parallel subagents.
