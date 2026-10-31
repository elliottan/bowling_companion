# Translating Headpin into Spanish (es)

Headpin is a bowling score-keeping app (iPhone, Android, web) for serious ten-pin
bowlers: score games pin by pin, track balls (the "arsenal"), lines, oil patterns,
spare lines, and stats. You fill in the `msgstr` of a gettext `.po` chunk.

One Spanish catalog serves Mexico, Colombia, Puerto Rico, the rest of Latin America,
US Spanish speakers and Spain, so write neutral Latin American Spanish: no vosotros,
no Spain-only words (use "celular/teléfono" never "móvil"; "computadora" never
"ordenador"; "archivo", "guardar", "borrar/eliminar").

## Hard rules (a broken entry breaks the app)
1. Change ONLY the `msgstr "..."` lines. Never edit `msgid`, `msgctxt`, `#.` comments,
   `#:` references, the order of entries, or the blank lines between entries.
   Every entry keeps exactly one `msgstr "..."` line, on one line.
2. Keep every placeholder exactly as written, same names: `{name}`, `{0}`, `{count}`, `#`.
   Reorder them freely to suit the grammar.
3. Keep numbered tags exactly: `<0>...</0>`, `<1>...</1>`, `<0/>`. They wrap bold text
   or an icon. Move them to where the matching words fall in your sentence.
4. Plurals: Spanish has `one` and `other`. Keep both branches of every
   `{n, plural, one {...} other {...}}`, translating the text inside each and keeping `#`
   and the variable name. Keep all `select` branches and their keys untouched,
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
- "# ball/# balls" is two messages: plain, a count of bowling balls (in the catalog, in a
  backup), and with context `balls thrown`, a count of shots thrown with a ball. Count
  each the way the language counts it.
- Two different stats never share words: "Strike on strike" (the rate of a strike right
  after a strike) is not "Strikes in a row" (the longest run in a game).
- "High" and "Low" are ONE message used both for a ball's flare reading and for the
  highest/lowest game score: choose a word that works for both (a plain high/low).
- "Score" is a tab name meaning "score a game" (where you enter shots).
- Strings inside `{n, plural, ...}` such as `# time`/`# times` are counts.
- A move like "2 boards left" is produced by its own message and dropped into
  sentences such as "you usually move {stanceMove} at the stance": make the move
  phrase read as an adverbial ("left by 2 boards") so it slots in without a particle clash.
- Very short strings (column heads, "Avg", "G1", "F", "1H", "L", "R") sit in narrow space:
  keep them as short as the English, or keep the English abbreviation.

## Reference
A finished Japanese translation of the same catalog is at
`src/locales/ja/messages.po` . Use it only to see how an
ambiguous English string was interpreted (meaning and where it is used), never as
the source text. Translate from the English msgid.


## Style
- Natural Spanish as a polished app ships it (think Apple's Latin American Spanish UI). Not literal.
- Address the bowler as tú, consistently. Sentences concise and friendly.
- Buttons, menu items, titles, headings, tab names: short; infinitive or noun
  (Guardar, Eliminar, Cancelar, Editar, Listo, Cerrar, Agregar). Sentence case, not Title Case.
- Questions and exclamations take opening ¿ and ¡.
- Spanish runs ~25% longer than English: for very short labels (column heads, segments,
  "Avg", "G1", "1H", "L", "R") keep them as short as the English; use common
  abbreviations (Prom., Izq., Der.) or keep the English abbreviation.
- Units: keep `ft`, `lb`, `in`, `mph`, `°` in labels; pies, libras, pulgadas in prose.
- Decimal formatting is done by the app; never rewrite numbers.

## Glossary (use consistently; bowling Spanish keeps many English terms)
strike chuza (Latin American bowling word; in short labels "Strike" is also understood,
pick chuza consistently) · spare spare (masc., "el spare"; plural "spares") ·
split split · foul falta · gutter canal · pocket bolsillo · leave (pins left standing) dejada
(plural dejadas; "the 10 pin leave" = la dejada del pino 10) · open frame cuadro abierto ·
clean game juego limpio · frame cuadro · game juego · series serie · session sesión ·
average promedio (abbrev: Prom.) · high game juego más alto · score puntaje ·
first ball primera bola · second ball segunda bola · fill ball bola extra ·
strike ball bola de strike · spare ball bola de spare · ball bola · arsenal arsenal ·
bag maleta · retired (ball) retirada · line línea · spare line línea de spare ·
stance posición de salida (short: posición) · target objetivo · arrows flechas ·
board (on the lane) tabla (board 10 = tabla 10; "2 boards left" = 2 tablas a la izquierda) ·
breakpoint punto de quiebre · laydown punto de soltada · slide deslizamiento · drift deriva ·
move movimiento / mover · lane pista · pair (of lanes) par · bowling centre / alley boliche ·
house la casa (house pattern = patrón de la casa) · oil pattern patrón de aceite ·
pattern length largo del patrón · volume volumen · ratio proporción · layout layout (perforación) ·
dual angle dual angle · drilling angle ángulo de perforación · pin buffer pin buffer ·
pin (on a ball) pin · pin (bowling pin) pino · core núcleo · symmetric simétrico ·
asymmetric asimétrico · coverstock cubierta · surface superficie · hook gancho ·
backend parte final · carry carry · rev rate revoluciones · speed velocidad ·
axis tilt inclinación del eje · axis rotation rotación del eje · flare flare ·
handedness mano · right-handed diestro · left-handed zurdo · one-handed a una mano ·
two-handed a dos manos · catalog catálogo · guide guía · stats estadísticas ·
history historial · home inicio · settings ajustes · backup respaldo · restore restaurar ·
import importar · export exportar · archive archivar · delete eliminar · undo deshacer ·
Lock Screen pantalla bloqueada · Live Activity Actividad en vivo · Backup & restore Respaldos (short to fit the title bar; the steps to move games quote it, so they say Respaldos too) · Pro Pro
