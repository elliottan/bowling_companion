# Translating Headpin into Korean (ko)

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
- Natural Korean as a polished Korean app ships it (think Apple's or Toss's Korean UI). Not literal.
- Sentences and explanations: polite 해요체 (-요), concise. Confirmations as questions: "삭제할까요?".
- Buttons, menu items, titles, headings, tab names: short nouns or 하기-less verb nouns
  (저장, 삭제, 취소, 편집, 완료, 닫기, 추가). No -요 on buttons.
- Use normal Korean spacing (띄어쓰기). ASCII punctuation (. , ? ! : ( )) as Korean UI does.
- A label without a period in English has none in Korean.
- Units: keep `ft`, `lb`, `in`, `mph`, `°` in compact labels; 피트, 파운드, 인치 in prose.

## Glossary (use consistently)
strike 스트라이크 · spare 스페어 · split 스플릿 · foul 파울 · gutter 거터 · pocket 포켓 ·
leave (pins left standing) 남은 핀 (counted: 3가지 남은 핀, or 리브 only if very tight) ·
open frame 오픈 프레임 · clean game 클린 게임 · frame 프레임 · game 게임 · series 시리즈 ·
session 세션 · average 에버리지 (abbrev: 에버) · high game 하이 게임 · score 점수 ·
first ball 첫 투구 · second ball 두 번째 투구 · fill ball 보너스 투구 ·
strike ball 스트라이크 볼 · spare ball 스페어 볼 · ball 볼 · arsenal 아스널 · bag 가방 ·
retired (ball) 은퇴 · line 라인 · spare line 스페어 라인 · stance 스탠스 위치 (short: 스탠스) ·
target 타깃 · arrows 스팟 · board (on the lane, counted) 보드 (board 10 = 10번 보드; "2 boards" = 2보드) ·
breakpoint 브레이크 포인트 · laydown 릴리스 지점 · slide 슬라이드 · drift 드리프트 · move 이동 ·
lane 레인 · pair (of lanes) 페어 · bowling centre / alley 볼링장 · house 하우스 ·
oil pattern 오일 패턴 · pattern length 패턴 길이 · volume 오일량 · ratio 비율 ·
layout 레이아웃 · dual angle 듀얼 앵글 · drilling angle 드릴링 앵글 · pin buffer 핀 버퍼 ·
pin 핀 · core 코어 · symmetric 대칭 · asymmetric 비대칭 · coverstock 커버스톡 · surface 표면 ·
hook 훅 · backend 백엔드 · carry 캐리 · rev rate 회전수 · speed 속도 · axis tilt 액시스 틸트 ·
axis rotation 액시스 로테이션 · handedness 사용하는 손 · right-handed 오른손 · left-handed 왼손 ·
one-handed 원핸드 · two-handed 투핸드 · catalog 카탈로그 · guide 가이드 · stats 통계 ·
history 기록 · home 홈 · settings 설정 · backup 백업 · restore 복원 · import 가져오기 ·
export 내보내기 · archive 보관 · delete 삭제 · undo 실행 취소 · Lock Screen 잠금 화면 · Pro Pro
