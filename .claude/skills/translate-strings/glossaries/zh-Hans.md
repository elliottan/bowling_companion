# Making the Simplified Chinese (zh-Hans) catalog of Headpin

Headpin is a bowling score-keeping app (iPhone, Android, web) for serious ten-pin
bowlers. A finished Traditional Chinese (Taiwan) catalog exists. Your job is the
Simplified Chinese catalog, read in Malaysia, Singapore and mainland China. It is NOT
a character-by-character conversion: convert to Simplified characters AND change
Taiwan vocabulary to the words used in Simplified-Chinese apps (Apple's zh-CN UI).

For each entry, look up the same msgid in the Traditional catalog,
`src/locales/zh-Hant/messages.po`. Start from its text, convert it, fix the
vocabulary, and check it against the English msgid: if the Traditional version got
the meaning wrong, or has no translation yet, translate from the English instead.

Vocabulary changes (Taiwan -> Simplified usage), among others:
設定 -> 设置 (Settings) · 資料 -> 数据 · 檔案 -> 文件 · 軟體 -> 软件 · 網路 -> 网络 ·
螢幕 -> 屏幕 · 預設 -> 默认 · 拷貝 -> 拷贝/复制 (use 复制) · 匯入 -> 导入 · 匯出 -> 导出 ·
封存 -> 归档 · 還原 -> 恢复 · 新增 -> 添加 · 儲存 -> 保存 · 刪除 -> 删除 · 鎖定畫面 -> 锁定屏幕 ·
即時動態 -> 实时活动 · 型錄 -> 目录 · 紀錄 -> 记录 · 首頁 -> 首页 · 影片 -> 视频 · 訊息 -> 信息 ·
支援 -> 支持 · 使用者 -> 用户 · 帳號 -> 账号 · 品質 -> 质量.
Bowling terms in Simplified usage: strike 全中 · spare 补中 · split 分瓶 · foul 犯规 ·
gutter 洗沟 · pocket 甜区 · leave (pins left standing) 残瓶 (never 残局, which means an endgame) · open frame 失误格 ·
frame 格 · game 局 · series 系列赛 · session 场次 · average 平均分 (abbrev 平均) ·
strike ball 全中球 · spare ball 补中球 · arsenal 球库 · line 路线 · stance 站位 ·
target 目标 · arrows 箭头 · board 板 · oil pattern 油型 · lane 球道 · flare 油圈 ·
drift 偏移 (one word everywhere, never 漂移) · pin buffer 定位销缓冲 · over the oil 叠在油型上 (never 沿着油画, which reads as 油画, oil painting) · layout 打孔布局 · core 球芯 · coverstock 球皮 · hook 飞碟/弧线 (use 弧线) · rev rate 转速 ·
handedness 惯用手 · bowling centre 保龄球馆 · undo 撤销 · backup 备份.
Address the user as 你. Full-width punctuation ，。？！：“”（）; Simplified apps use “” for
quotes, not 「」.

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

