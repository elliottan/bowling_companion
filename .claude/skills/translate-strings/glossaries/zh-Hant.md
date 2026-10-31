# Translating Headpin into Traditional Chinese (zh-Hant, Taiwan usage)

Headpin is a bowling score-keeping app (iPhone, Android, web) for serious ten-pin
bowlers: score games pin by pin, track balls (the "arsenal"), lines, oil patterns,
spare lines, and stats. You fill in the `msgstr` of a gettext `.po` chunk.

## Hard rules (a broken entry breaks the app)
1. Change ONLY the `msgstr "..."` lines. Never edit `msgid`, `msgctxt`, `#.` comments,
   `#:` references, the order of entries, or the blank lines between entries.
   Every entry keeps exactly one `msgstr "..."` line, on one line.
2. Keep every placeholder exactly as written, same names: `{name}`, `{0}`, `{count}`, `#`.
   Reorder them freely to suit the grammar.
3. Keep numbered tags exactly: `<0>...</0>`, `<1>...</1>`, `<0/>`. They wrap bold text
   or an icon. Move them to where the matching words fall in your sentence.
4. Plurals: this language has one form. Turn
   `{n, plural, one {# game} other {# games}}` into `{n, plural, other {...#...}}`.
   Keep the variable name and the `plural` keyword; drop the `one` branch; keep `#`.
   If the `one` and `other` branches use different placeholders (e.g. `{1}` and `{2}`),
   keep the one from `other`. Keep all `select` branches and their keys untouched,
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
- Natural Traditional Chinese as used in Taiwan, as a polished Taiwanese app ships it
  (think Apple's zh-TW UI). Traditional characters only, never Simplified. Taiwan
  vocabulary (e.g. 設定 not 设置, 資料 not 數據, 檔案 not 文件, 軟體, 網路, 螢幕, 預設).
- Sentences: plain and polite, concise. Address the user as 你 (not 您) unless very formal.
- Buttons, menu items, titles, headings, tab names: short (儲存, 刪除, 取消, 編輯, 完成, 關閉, 新增).
- Full-width punctuation in sentences: ，。？！：「」（）. A label without a period in English
  has none in Chinese. Put a half-width space between Chinese and Latin letters or numbers
  only where Apple's zh-TW UI does (e.g. "3 局", "Headpin Pro 版"); be consistent.
- Units: keep `ft`, `lb`, `in`, `mph`, `°` in compact labels; 英尺, 磅, 英吋 in prose.

## Glossary (use consistently)
strike 全倒 · spare 補中 · split 分瓶 (技術球) · foul 犯規 · gutter 洗溝 · pocket 甜蜜點 (口袋) · 
leave (pins left standing) 殘瓶 · open frame 失誤 (never 失格, which reads as "disqualified"; 失誤 is the zh.wikipedia rules glossary term) · clean game 全補局 · frame 格 ·
game 局 · series 系列賽 · session 場次 · average 平均分 (abbrev: 平均) · high game 單局最高 ·
score 分數 · first ball 第一球 · second ball 第二球 · fill ball 追加球 ·
strike ball 全倒球 · spare ball 補中球 · ball 球 · arsenal 球庫 · bag 球袋 · retired (ball) 退役 ·
line 路線 · spare line 補中路線 · stance 站位 · target 目標 · arrows 箭頭 ·
board (on the lane, counted) 板 (board 10 = 第 10 板; "2 boards" = 2 板) · breakpoint 轉折點 ·
laydown 出手點 · slide 滑步 · drift 偏移 · move 移動 · lane 球道 · pair (of lanes) 雙球道 ·
bowling centre / alley 保齡球館 · house 球館 · oil pattern 油型 · pattern length 油長 ·
volume 油量 · ratio 比例 · layout 打孔配置 · dual angle 雙角度 · drilling angle 打孔角度 ·
pin buffer 定位銷緩衝 (never 定位銷距離, which reads as the pin to PAP distance) · pin (on a ball) 定位銷 · pin (bowling pin) 球瓶 · core 球心 ·
symmetric 對稱 · asymmetric 非對稱 · coverstock 球皮 · surface 表面 · hook 曲球 · backend 後段 ·
carry 帶倒 (unconfirmed: no Taiwanese source found; a native bowler may prefer the English "carry") · rev rate 轉速 · speed 球速 · axis tilt 軸傾角 · axis rotation 軸旋轉 ·
handedness 慣用手 · right-handed 右手 · left-handed 左手 · one-handed 單手 · two-handed 雙手 ·
catalog 型錄 · guide 指南 · stats 統計 · history 紀錄 · home 首頁 · settings 設定 ·
backup 備份 · restore 還原 · import 匯入 · export 匯出 · archive 封存 · delete 刪除 ·
undo 復原 · Lock Screen 鎖定畫面 · Pro Pro
