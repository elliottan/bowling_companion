# Translating Headpin into Indonesian (id, Bahasa Indonesia)

Headpin is a bowling score-keeping app (iPhone, Android, web) for serious ten-pin
bowlers: score games pin by pin, track balls (the "arsenal"), lines, oil patterns,
spare lines, and stats. You fill in the `msgstr` of a gettext `.po` chunk.

Write standard, natural Indonesian (Bahasa Indonesia as KBBI and a well-made Indonesian
app write it), the way Indonesian bowlers read it. The federation is PB PBI (Persatuan
Boling Indonesia); bowlers are "peboling", and they keep most technical terms in English
(strike, spare, split, game, frame, open frame, pocket).

## Hard rules (a broken entry breaks the app)
1. Change ONLY the `msgstr "..."` lines. Never edit `msgid`, `msgctxt`, `#.` comments,
   `#:` references, the order of entries, or the blank lines between entries.
   Every entry keeps exactly one `msgstr "..."` line, on one line.
2. Keep every placeholder exactly as written, same names: `{name}`, `{0}`, `{count}`, `#`.
   Reorder them freely to suit the grammar.
3. Keep numbered tags exactly: `<0>...</0>`, `<1>...</1>`, `<0/>`. They wrap bold text
   or an icon. Move them to where the matching words fall in your sentence.
4. Plurals: Indonesian has one form, `other` (CLDR), and a noun after a number does not
   change. Turn `{n, plural, one {# game} other {# games}}` into
   `{n, plural, other {# game}}`: keep the variable name and the `plural` keyword, drop the
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

- MALAY AND INDONESIAN ARE NOT INTERCHANGEABLE. Write only Malay-free Indonesian. Words that
  give the wrong one away are listed under "Never write" below.
- "# ball/# balls" is two messages: plain, a count of bowling balls (in the catalog, in a
  backup: "# bola"), and with context `balls thrown`, a count of shots ("# lemparan").
- Two different stats never share words: "Strike on strike" (the rate of a strike right
  after a strike) is not "Strikes in a row" (the longest run in a game: "strike beruntun").
- "High" and "Low" are ONE message used both for a ball's flare reading and for the
  highest/lowest game score: Tinggi / Rendah.
- "Score" as a tab name means "score a game" (where you enter shots): Skor.
- A move like "2 boards left" is its own message dropped into sentences such as "you
  usually move {stanceMove} at the stance": write it as "2 papan ke kiri" so it slots in.
- Very short strings (column heads, "Avg", "G1", "F", "1H", "L", "R") sit in narrow space:
  keep them as short as the English, or keep the English abbreviation (G1 stays G1).
- Never translate a word into its literal Indonesian when bowlers use the English term (the
  glossary says which). Never invent an Indonesian coinage for a technical term not in the
  glossary: keep the English term.
- Tight spaces (text-fit, `e2e/text-fit.spec.ts`): the lane badge and the scorer's lane row
  (context `short label`) say "Lane", since "Lintasan" does not fit; everywhere else a lane is
  "lintasan". "Default" (text size) is "Biasa", "Largest" is "Maks.", "Never backed up" is "Belum dicadangkan".

## Reference
Finished Spanish and Japanese catalogs are at `src/locales/es/messages.po` and
`src/locales/ja/messages.po`. Use them only to see how an ambiguous English string was
interpreted (meaning and where it is used), never as the source text. Translate from the
English msgid. The `#.` comment above an entry and the `#:` file it names say where it shows.

## Style
- Natural, polished Indonesian as a modern Indonesian app ships it (friendly, not stiff,
  not slang). Not a word-for-word calque.
- Address the bowler as "kamu", consistently, and leave the pronoun out where Indonesian
  reads fine without it. Possessive "-mu" ("bolamu", "skormu") is fine and natural.
  Never "Anda", "lo/lu", "elo".
- Buttons, menu items, titles, tab names: short; a verb (Simpan, Hapus, Batal, Edit,
  Selesai, Tutup, Tambah) or a noun. Sentence case, not Title Case.
- English loan terms stay as they are, no italics, no quotes (strike, spare, split, game).
- Units: keep `ft`, `lb`, `in`, `mph`, `°`. The app formats numbers; never rewrite them.

## Never write (these are Malay, not Indonesian)
kerana (karena) · padam (hapus) · tetapan (pengaturan) · fail (file/berkas) · muat turun (unduh) ·
muat naik (unggah) · telefon (ponsel/HP) · sila (silakan) · ketik for tap (ketuk) · sejarah for history (riwayat) ·
kelajuan (kecepatan) · bahagian (bagian) · peranti (perangkat) · sandaran (cadangan) · kad (kartu) ·
purata (rata-rata) · lorong (lintasan) · corak (pola) · balingan (lemparan) · "tidak boleh" for
cannot (tidak bisa / tidak dapat) · boleh for can (bisa / dapat) · anda lowercase · sunting is
fine but prefer edit · also no slang: "aja", "banget", "nggak", "udah", "sih", "gak".

## Glossary (use consistently)
bowling boling · bowler peboling · strike strike · spare spare · split split · foul foul ·
gutter gutter · pocket pocket · leave (pins left standing) sisa pin ("the 10 pin leave" = sisa pin 10) ·
open frame open frame · clean game game bersih · frame frame · game game ·
series seri · session sesi · average rata-rata (column abbreviation: Rata2 is wrong, use "Avg"
where it must be very short, else "Rata-rata") · high game game tertinggi · score skor ·
first ball lemparan pertama · second ball lemparan kedua · fill ball lemparan tambahan ·
shot / throw lemparan · strike ball bola strike · spare ball bola spare · ball bola ·
arsenal arsenal · bag tas · retired (ball) dipensiunkan · line jalur · spare line jalur spare ·
stance posisi awal · target target · arrows panah · board (on the lane) papan (board 10 = papan 10) ·
breakpoint titik belok (breakpoint) · laydown titik lepas · slide luncuran · drift pergeseran ·
move geser / pergeseran · lane lintasan · pair (of lanes) pasangan lintasan · bowling centre arena boling ·
house (the centre) arena boling; house pattern pola house · oil pattern pola minyak ·
pattern length panjang pola · volume volume · ratio rasio · layout layout ·
dual angle dual angle · drilling angle sudut pengeboran · pin buffer pin buffer ·
pin (on a ball) pin · pin (bowling pin) pin · core inti · symmetric simetris · asymmetric asimetris ·
coverstock coverstock · surface permukaan · hook hook · backend bagian akhir lintasan ·
carry carry · rev rate rev rate · speed kecepatan · axis tilt kemiringan sumbu ·
axis rotation rotasi sumbu · flare flare · handedness tangan dominan · right-handed tangan kanan ·
left-handed tangan kiri (kidal) · one-handed satu tangan · two-handed dua tangan ·
catalog katalog · guide panduan · stats statistik · history riwayat · home Beranda ·
settings Pengaturan · backup cadangan · back up cadangkan · restore pulihkan ·
Backup & restore Cadangan & pemulihan · import impor · export ekspor · file file ·
archive arsip / arsipkan · delete hapus · save simpan · edit edit · undo urungkan ·
device perangkat · phone ponsel · tap ketuk · download unduh · share bagikan ·
Lock Screen Layar Terkunci · Live Activity Aktivitas Langsung · Home Screen Layar Utama ·
Add to Home Screen Tambahkan ke Layar Utama · Pro Pro · Headpin Pro Headpin Pro
