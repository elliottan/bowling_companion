# Translating Headpin into Malay (ms, Bahasa Melayu)

Headpin is a bowling score-keeping app (iPhone, Android, web) for serious ten-pin
bowlers: score games pin by pin, track balls (the "arsenal"), lines, oil patterns,
spare lines, and stats. You fill in the `msgstr` of a gettext `.po` chunk.

Write standard Malaysian Malay (Bahasa Melayu as DBP and Apple's Malay UI write it), the
way Malaysian bowlers read it. Malaysia is a strong bowling country (MTBC, Shalin
Zulkifli, Muhammad Rafiq Ismail) and its bowlers keep most technical terms in English.

## Hard rules (a broken entry breaks the app)
1. Change ONLY the `msgstr "..."` lines. Never edit `msgid`, `msgctxt`, `#.` comments,
   `#:` references, the order of entries, or the blank lines between entries.
   Every entry keeps exactly one `msgstr "..."` line, on one line.
2. Keep every placeholder exactly as written, same names: `{name}`, `{0}`, `{count}`, `#`.
   Reorder them freely to suit the grammar.
3. Keep numbered tags exactly: `<0>...</0>`, `<1>...</1>`, `<0/>`. They wrap bold text
   or an icon. Move them to where the matching words fall in your sentence.
4. Plurals: Malay has one form, `other` (CLDR), and a noun after a number does not
   change. Turn `{n, plural, one {# game} other {# games}}` into
   `{n, plural, other {# permainan}}`: keep the variable name and the `plural` keyword, drop the
   `one` branch, keep `#`. An `=0`/`=1` branch in the msgid may stay. Keep all `select` branches and their keys untouched,
   translating only the text inside them.
5. Escape a double quote inside msgstr as `\"`, as the msgid does.
6. Never write an em dash (U+2014) or en dash (U+2013).
7. Do not translate: Headpin, Headpin Pro, ball names, brand names (Storm, Roto Grip,
   Hammer, Motiv, Brunswick, Ebonite...), pattern names, "Storm VLS", "PAP", "VAL",
   "RG", "Diff", "USBC", "PBA", "KOSI", "iPhone", "Safari", "Chrome", "Firefox",
   "Dynamic Island".
8. A msgid that is only symbols/placeholders (e.g. `{label}. {action}`, `{weight} lb`)
   still gets a msgstr: usually a copy, punctuation adjusted if natural.

## Known traps

- MALAY AND INDONESIAN ARE NOT INTERCHANGEABLE. Write only Indonesian-free Malay. Words that
  give the wrong one away are listed under "Never write" below.
- "# ball/# balls" is two messages: plain, a count of bowling balls (in the catalog, in a
  backup: "# bola"), and with context `balls thrown`, a count of shots ("# balingan").
- Two different stats never share words: "Strike on strike" (the rate of a strike right
  after a strike) is not "Strikes in a row" (the longest run in a game: "strike berturut-turut").
- "High" and "Low" are ONE message used both for a ball's flare reading and for the
  highest/lowest game score: Tinggi / Rendah.
- "Score" as a tab name means "score a game" (where you enter shots): Skor.
- A move like "2 boards left" is its own message dropped into sentences such as "you
  usually move {stanceMove} at the stance": write it as "2 papan ke kiri" so it slots in.
- Very short strings (column heads, "Avg", "G1", "F", "1H", "L", "R") sit in narrow space:
  keep them as short as the English, or keep the English abbreviation (G1 stays G1,
  L/R may become Ki/Ka only if the msgid comment says it is a hand or side label that has room).
- Never translate a word into its literal Malay when bowlers use the English term (the
  glossary says which). Never invent a Malay coinage for a technical term not in the glossary:
  keep the English term.
- Tight spaces (text-fit, `e2e/text-fit.spec.ts`): the lane badge and the scorer's lane row
  (context `short label`) say "Lane", and the game-by-game table (contexts `column heading` and
  `row label`) and the per-game caption under open frames say "Game" / "setiap game", as centre
  scoring screens do: "permainan" is too wide there at the largest text size. Everywhere else a
  game is "permainan". That table's "Avg" heading stays "Avg". "Largest" (text size) is "Maks.",
  "Never backed up" is "Belum disandarkan".

## Reference
Finished Spanish and Japanese catalogs are at `src/locales/es/messages.po` and
`src/locales/ja/messages.po`. Use them only to see how an ambiguous English string was
interpreted (meaning and where it is used), never as the source text. Translate from the
English msgid. The `#.` comment above an entry and the `#:` file it names say where it shows.

## Style
- Natural, polished Malay as a well-made Malaysian app ships it. Not a word-for-word calque.
- Address the bowler as "anda" (lowercase mid-sentence, "Anda" only at the start of a
  sentence), and leave the pronoun out where Malay reads fine without it. Never "kamu", "awak", "engkau".
- Buttons, menu items, titles, tab names: short; a verb (Simpan, Padam, Batal, Sunting,
  Selesai, Tutup, Tambah) or a noun. Sentence case, not Title Case.
- Instructions use "Sila ..." sparingly; a plain imperative is fine ("Ketik ...").
- English loan terms stay as they are, no italics, no quotes (strike, spare, split).
- Units: keep `ft`, `lb`, `in`, `mph`, `°`. The app formats numbers; never rewrite them.

## Never write (these are Indonesian, not Malay)
karena (kerana) · hapus (padam) · pengaturan (tetapan) · berkas (fail) · unduh (muat turun) ·
unggah (muat naik) · ponsel/HP (telefon) · silakan (sila) · mengetuk (ketik) · beranda (utama) ·
riwayat (sejarah) · Anda capitalised mid-sentence (anda) · kecepatan (kelajuan) · bagian (bahagian) ·
sekarang is fine, but "aja", "banget", "nggak", "udah", "sih" never · perangkat (peranti) ·
cadangan (sandaran) · kartu (kad) · rata-rata (purata) · lintasan (lorong) · pola (corak) ·
lemparan (balingan) · gagal is fine · "tidak bisa" (tidak boleh / tidak dapat) · mengubah is fine.

## Glossary (use consistently)
bowling boling (tenpin boling) · bowler pemain boling (short: pemain) · strike strike ·
spare spare · split split · foul faul · gutter gutter (bola gutter) · pocket pocket ·
leave (pins left standing) pin yang tinggal / baki pin ("the 10 pin leave" = pin 10 yang tinggal) ·
open frame open frame · clean game permainan bersih · frame frame · game permainan ·
series siri · session sesi · average purata (column abbreviation: Purata) · high game permainan tertinggi ·
score skor · first ball balingan pertama · second ball balingan kedua · fill ball balingan tambahan ·
shot / throw balingan · strike ball bola strike · spare ball bola spare · ball bola · arsenal arsenal ·
bag beg · retired (ball) bersara · line laluan · spare line laluan spare · stance kedudukan awal ·
target sasaran · arrows anak panah · board (on the lane) papan (board 10 = papan 10) ·
breakpoint titik belok (breakpoint) · laydown titik lepas · slide gelongsor · drift anjakan ·
move anjak / anjakan · lane lorong · pair (of lanes) pasangan lorong · bowling centre pusat boling ·
house (the centre) pusat boling; house pattern corak house · oil pattern corak minyak ·
pattern length panjang corak · volume isi padu · ratio nisbah · layout layout ·
dual angle dual angle · drilling angle sudut gerudi · pin buffer pin buffer ·
pin (on a ball) pin · pin (bowling pin) pin · core teras · symmetric simetri · asymmetric asimetri ·
coverstock coverstock · surface permukaan · hook hook · backend bahagian hujung lorong ·
carry carry · rev rate rev rate · speed kelajuan · axis tilt kecondongan paksi ·
axis rotation putaran paksi · flare flare · handedness tangan dominan · right-handed tangan kanan ·
left-handed tangan kiri (kidal) · one-handed satu tangan · two-handed dua tangan ·
catalog katalog · guide panduan · stats statistik · history sejarah · home Utama ·
settings Tetapan · backup sandaran · back up sandarkan · restore pulihkan ·
Backup & restore Sandaran & pemulihan · import import · export eksport · file fail ·
archive arkib / arkibkan · delete padam · save simpan · edit sunting · undo buat asal ·
device peranti · phone telefon · tap ketik · download muat turun · share kongsi ·
Lock Screen Skrin Kunci · Live Activity Aktiviti Langsung · Home Screen Skrin Utama ·
Add to Home Screen Tambah ke Skrin Utama · Pro Pro · Headpin Pro Headpin Pro
