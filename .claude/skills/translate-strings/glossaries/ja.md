# Translating Headpin into Japanese

Headpin is a bowling score-keeping app (iPhone, Android, web) for serious ten-pin
bowlers: score games pin by pin, track balls (the "arsenal"), lines, oil patterns,
spare lines, and stats. You are filling in the `msgstr` of a gettext `.po` chunk.

## Hard rules (a broken entry breaks the app)
1. Change ONLY the `msgstr "..."` lines. Never edit `msgid`, `msgctxt`, `#.` comments,
   `#:` references, the order of entries, or the blank lines between entries.
   Every entry must keep exactly one `msgstr "..."` line, on one line.
2. Keep every placeholder exactly as written, same names: `{name}`, `{0}`, `{count}`, `#`.
   Reorder them freely to suit Japanese grammar.
3. Keep numbered tags exactly: `<0>...</0>`, `<1>...</1>`, `<0/>`. They wrap bold text
   or an icon. Move them to where the matching words are in the Japanese sentence.
4. Plurals: Japanese has one form. Turn
   `{n, plural, one {# game} other {# games}}` into `{n, plural, other {#ゲーム}}`.
   Keep the variable name and the `plural` keyword; drop the `one` branch; keep `#`.
   Same for `select`/`selectordinal` if you meet them (keep all `select` branches).
5. Escape a double quote inside msgstr as `\"`, as the msgid does. Prefer Japanese
   brackets 「」 instead of quotes when quoting UI words, e.g. 「ホーム画面に追加」.
6. Never write an em dash (U+2014) or en dash. Use 、 。 ・ or rephrase.
7. Do not translate: Headpin, Headpin Pro, ball names, brand names (Storm, Roto Grip,
   Hammer, Motiv, Brunswick, Ebonite...), pattern names, "Storm VLS", "PAP", "VAL",
   "RG", "Diff", "USBC", "PBA", "KOSI", "iPhone", "Safari", "Chrome", "Firefox",
   "Lock Screen" is ロック画面, "Dynamic Island" stays.
8. If a msgid is pure symbols/numbers/a placeholder only (e.g. `{label}. {action}`,
   `{weight} lb`), still fill msgstr (usually copy it, adjusting punctuation if natural).

## Style
- Natural Japanese as a polished Japanese app would ship it (think Apple's own
  Japanese UI). Not literal.
- Sentences and explanations: polite です/ます form, concise.
- Buttons, menu items, titles, column headings, tab names: short noun or verb-stem
  forms without です/ます (保存, 削除, キャンセル, 編集, 完了, 閉じる, 追加).
- Japanese punctuation 。、 in sentences. A label ending without a period in English
  ends without 。 in Japanese. Use full-width （） only in prose; keep ASCII ( ) when
  wrapping a number/unit.
- Very short strings (column heads, abbreviations like "Avg", "G1", "F", "1H") are
  shown in narrow space: keep them as short as the English, or keep the English
  abbreviation if Japanese bowlers would.
- Read the `#.` translator comment: it tells you when a word is a bowling term or
  where it appears.
- Units: in compact labels keep `ft`, `lb`, `in`, `mph`, `°`. In prose use フィート,
  ポンド, インチ.

## Glossary (use these consistently)
strike ストライク · spare スペア · split スプリット · foul ファウル · gutter ガター ·
pocket ポケット · leave (pins left standing) 残りピン (as a countable noun, e.g. "3 leaves" = 3種類の残りピン, or 残り when tight) ·
open frame オープンフレーム · clean game クリーンゲーム · frame フレーム · game ゲーム ·
series シリーズ · session セッション · average アベレージ · high game ハイゲーム ·
pinfall / score スコア · first ball 1投目 · second ball 2投目 · fill ball 3投目 ·
strike ball ストライクボール · spare ball スペアボール · ball ボール ·
arsenal アーセナル · bag (bowling bag) バッグ · retired (ball) 引退 ·
line (where the ball goes) ライン · spare line スペアライン · stance 立ち位置 ·
target (board at the arrows) 目標 / スパット when it means the arrows · arrows スパット ·
board (on the lane, counted) 枚目 (board 10 = 10枚目) · breakpoint ブレイクポイント ·
laydown リリース位置 · slide スライド · drift ドリフト · move (adjust position) 移動 ·
lane レーン · pair (of lanes) ペア · bowling centre / alley ボウリング場 · house ハウス ·
oil pattern オイルパターン · pattern length パターン長 · volume オイル量 · ratio 比率 ·
layout レイアウト · dual angle デュアルアングル · drilling angle ドリリングアングル ·
pin buffer ピンバッファー · pin (on a ball / the pin) ピン · core コア ·
symmetric 対称 · asymmetric 非対称 (Sym/Asym abbreviations may stay) · coverstock カバーストック ·
surface サーフェス · hook フック · length 走り/レングス (pick by context) · backend バックエンド ·
rev rate 回転数 · speed スピード · axis tilt アクシスチルト · axis rotation アクシスローテーション ·
handedness 利き手 · right-handed 右投げ · left-handed 左投げ · one-handed 片手投げ · two-handed 両手投げ ·
catalog カタログ · guide ガイド · stats 統計 · history 履歴 · home ホーム · settings 設定 ·
backup バックアップ · restore 復元 · import 読み込み · export 書き出し · archive アーカイブ ·
delete 削除 · undo 取り消す · Pro Pro
