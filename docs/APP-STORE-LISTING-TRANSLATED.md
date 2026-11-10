# App Store listing drafts, translated

The English listing in [APP-STORE-LISTING.md](./APP-STORE-LISTING.md), for each
language the app speaks (ADR-224): Japanese, Korean, Chinese (Traditional),
Chinese (Simplified), Spanish (for Mexico and for Spain), Indonesian and Malay,
plus a second English for the U.K. localization. Like the English, it is copy
for the owner to review and paste into App Store Connect, and nothing reads
this file.

## Where each section goes

In App Store Connect, per localization:

1. Open the app, then the language menu at the top right of the page (it
   reads "English (U.S.)"), and add the language.
2. **App Information**, in that language: the name and subtitle, and the
   privacy policy URL (the same `https://headpin.app/legal`).
3. **The version page** (iOS App, the version under review), in that
   language: promotional text, description, keywords, support URL and the
   screenshots, `captioned/` in the 6.9 inch slot and `captioned-6.3/` in the
   6.3 inch one. What's new is asked for from the second version on.
4. **In-App Purchases**, Headpin Pro, App Store Localization: add the
   language with the purchase's display name and description.
5. Submit the version as usual: the localizations go out with it. Promotional
   text can change later without a new version; the rest waits for the next
   one.

A storefront shows the localization of its own language, then the next most
relevant one, then the primary language (English (U.S.)), and it indexes the
keywords of its default and its additional language (Apple's "App Store
localizations" table). The screenshots for each are in
`marketing/app-store/2026-11-10/<locale>/`, the column below.

| App Store Connect localization | Section | Screenshots | Storefronts where it is the default or indexed |
|---|---|---|---|
| English (U.S.), primary | APP-STORE-LISTING.md | `en` | U.S., and every storefront with no language of its own here |
| English (U.K.) | English (U.K.) | `en` | U.K., Singapore; extra language in Malaysia, Indonesia, Hong Kong, Taiwan, Korea, China, Mexico, Spain |
| Spanish (Mexico) | Spanish, Mexico | `es` | Mexico and Latin America; also indexed in the U.S. |
| Spanish (Spain) | Spanish, Spain | `es` | Spain |
| Japanese | Japanese | `ja` | Japan |
| Korean | Korean | `ko` | Korea; also indexed in the U.S. |
| Chinese (Traditional) | Chinese, Traditional | `zh-Hant` | Taiwan, Hong Kong; also indexed in the U.S. |
| Chinese (Simplified) | Chinese, Simplified | `zh-Hans` | China mainland; extra language in Singapore; also indexed in the U.S. |
| Indonesian | Indonesian | `id` | Indonesia |
| Malay | Malay | `ms` | Malaysia |

The app is always **Headpin**. The App Store name is set per localization, so
each one is "Headpin:" and a descriptor in that language, as the English is
"Headpin: Bowling Score & Stats". The name under the icon on the Home Screen
is `CFBundleDisplayName`, "Headpin", in every language.

## How they were made, and what to check before pasting

- **Drafts, not reviewed.** Each was written from the English listing and the
  app's own catalog for that language, so the listing and the screens use the
  same words. None has had a native speaker's read. Read each with one before
  submission.
- **Keywords are chosen, not translated**: the terms bowlers in that market
  search for, none repeating a word in the name or subtitle. They are guesses
  until checked against search data in App Store Connect. Apple indexes the
  English (U.S.) keywords and the Spanish (Mexico), Korean and both Chinese
  ones together in the U.S. storefront, so a word in one need not be in
  another.
- **The Headpin Pro purchase** has a display name and description here, which
  the English listing does not draft yet: the 30 and 45 character limits are
  App Store Connect's for an in-app purchase. Each is set under the purchase's
  own App Store localization.
- **Recheck "over 800 balls"** against the catalog with the English, before each
  submission.
- **Screenshots** are drawn per language by `scripts/app-store/screenshots.mjs`
  with the app itself in that language (`STORE_LOCALE`), captioned from
  `scripts/app-store/captions.mjs`. A localization with no screenshots of its
  own shows the primary language's, so upload each set to its localization.
- **Counts** were measured on the text as written, in characters, and every
  field is within its limit. Recount after any edit.

## Japanese (ja)

### App name (20 of 30)

```
Headpin: ボウリングスコア＆統計
```

### Subtitle (15 of 30)

```
1投ごとのボールとラインを記録
```

### Promotional text (92 of 170)

```
ピンはどこへ向かっているのか、答えは記録の中に。ボールごとの投球を残し、オイルの上のラインを確かめて、差がつくボールとスペアを見つけましょう。どのボウリング場でもオフラインで使えます。
```

### Keywords (100 of 100)

```
アベレージ,リーグ,ストライク,スペア,オイルパターン,アーセナル,レイアウト,PAP,USBC,PBA,レーン,残りピン,ケーゲル,カタログ,ハイゲーム,ボウラー,オフライン,メモ,トラッカー,投球
```

### Description (1312 of 4000)

```
スコアのつけ方から、ボールとラインの見直しまで。あなたのゲームを理解して、もっとうまくなるためのすべてを1つのアプリに。

1. スコア入力
2. ラインビジュアライザー
3. レイアウトビジュアライザー
4. ボウリングボールのアーセナル
5. 統計とグラフ
6. スペアライン
7. オイルパターン
8. あなたのゲームは、あなたのiPhoneに

---

1. スコア入力

スコアは手軽につけて、1ゲームごとを学びの材料に。投げたボール、狙ったラインまで1投ずつ残すので、シーズンを通したゲームの記録になります。

---

2. ラインビジュアライザー

レーンの攻め方が、はっきり見えます。立ち位置からポケットまで、あなたのラインをオイルの上に描画。レーンが変わったときも動かす位置がわかり、同じパターンに出会ったときは、うまくいった攻め方を思い出せます。

---

3. レイアウトビジュアライザー

ドリルする前に、レイアウトを確認。デュアルアングルとStorm VLSのレイアウトを、あなた自身のPAPをもとにボール上へ描画します。プロショップに持ち込む前に、仕上がりがわかります。

---

4. ボウリングボールのアーセナル

自分のバッグを、しっかり把握。800種類を超えるボウリングボールをスペックと写真つきで調べて、アーセナルを作り、本当にスコアに貢献しているボールを確かめられます。

---

5. 統計とグラフ

ピンがどこへ向かっているのかを知りましょう。アベレージ、ポケット率とスペア率、いちばんスコアを落とした残りピンを、推移のグラフで表示。上達していく様子を確かめられます。

---

6. スペアライン

スペアをもっと取れるように。Headpinは残りピンごとのあなたの投げ方を覚えていて、その場面になれば最適なラインがすぐに出てきます。レーンの状態が変わっていくのにあわせて、ラインも動きます。

---

7. オイルパターン

狙い所をつかんでレーンへ。PBAパターンとKegelパターンを調べて、レーン上のオイルを視覚的に確認し、1投目の前にラインを組み立てられます。

---

8. あなたのゲームは、あなたのiPhoneに

ゲームのデータはiPhoneに保存され、アカウントの作成も不要で、どのボウリング場でもオフラインで使えます。好きなときにバックアップでき、機種変更でも履歴をそっくり引き継げます。

---

Headpin Pro

買い切りで、サブスクリプションなしで、さらに深く。キャリー率とストライク率でストライクの裏側を見て、バッグにあるすべてのボールを比較し、ボウリング場ごとに最もアベレージが高いボールを見つけ、ラインとレイアウトを細かく調整して何が変わるかを確かめられるほか、プレー中のゲームをロック画面とダイナミックアイランドで確認できます。記録した内容は、これからもずっと無料です。

Headpinは独立したアプリであり、ボールメーカーおよびボウリング団体とは一切提携していません。ボールの名称と画像は、各権利者に帰属します。
```

### What's new in 1.0 (179 of 4000)

```
iPhone版Headpinの最初のリリースです。

1投ごとにスコアをつけ、ボールとラインも一緒に記録して、何がうまくいっているかを確かめましょう。データはすべてiPhoneに保存され、電波がなくても使えます。

Web版のHeadpinをお使いの方は、Web版でバックアップを書き出し、このアプリの「設定」の「バックアップと復元」から読み込んでください。
```

### Headpin Pro in-app purchase display name (11 of 30)

```
Headpin Pro
```

### Headpin Pro in-app purchase description (31 of 45)

```
キャリー率、全ボール比較、ライン調整。買い切りでサブスクなし。
```

## Korean (ko)

### App name (19 of 30)

```
Headpin: 볼링 점수 & 통계
```

### Subtitle (15 of 30)

```
투구도 볼도 라인도 빠짐없이
```

### Promotional text (103 of 170)

```
내 점수가 어디서 새는지 알아보세요. 모든 볼을 기록하고, 오일 위에 그려진 내 라인을 확인하고, 차이를 만드는 볼과 스페어를 찾아보세요. 어느 볼링장에서든 오프라인으로 쓸 수 있어요.
```

### Keywords (100 of 100)

```
에버리지,리그,스트라이크,스페어,오일패턴,아스널,볼링공,스코어,핀,레인,기록,어플,트래커,레이아웃,남은핀,PAP,USBC,오프라인,대회,동호회,하이게임,드릴링,커버스톡,볼링장,에버
```

### Description (1368 of 4000)

```
볼링 실력을 이해하고 더 잘 치기 위한 모든 것을 앱 하나에 담았어요.

1. 점수 기록
2. 라인 시각화
3. 레이아웃 시각화
4. 볼링공 아스널
5. 통계 및 차트
6. 스페어 라인
7. 오일 패턴
8. 내 게임은 내 폰에

---

1. 점수 기록

쉽게 점수를 기록하고, 모든 게임을 배움의 기회로 바꿔 보세요. 던진 볼과 공략한 위치까지 투구마다 남기면 시즌 전체의 내 게임이 기록으로 쌓여요.

---

2. 라인 시각화

레인을 어떻게 공략하고 있는지 정확히 확인해 보세요. 내 라인이 발 위치에서 포켓까지 오일 위에 그려져요. 레인 상태가 바뀌어도 어디로 이동해야 할지 알 수 있고, 같은 패턴을 다시 만나면 어떻게 쳤는지 떠올릴 수 있어요.

---

3. 레이아웃 시각화

드릴링하기 전에 레이아웃을 미리 확인해 보세요. 듀얼 앵글과 Storm VLS 레이아웃을 내 PAP 기준으로 볼 위에 그려 주니, 프로샵에 맡기기 전에 어떤 볼이 나올지 알 수 있어요.

---

4. 볼링공 아스널

내 가방을 한눈에 파악해 보세요. 800개가 넘는 볼링공의 사양과 사진을 둘러보고, 나만의 아스널을 만들고, 어떤 볼이 정말 점수에 도움이 되는지 확인해 보세요.

---

5. 통계 및 차트

내 점수가 어디서 새는지 알아보세요. 에버리지, 포켓 비율, 스페어 비율, 점수를 가장 많이 깎아 먹는 남은 핀을 시간에 따라 차트로 보여 줘서 실력이 느는 과정을 직접 볼 수 있어요.

---

6. 스페어 라인

스페어를 더 많이 잡아 보세요. Headpin은 남은 핀마다 내가 어떻게 쳤는지 기억해 두었다가, 같은 상황이 오면 알맞은 라인을 바로 보여 줘요. 레인이 변해도 그에 맞춰 함께 움직여요.

---

7. 오일 패턴

공략법을 미리 알고 레인에 서 보세요. PBA와 Kegel 패턴을 찾아보고, 레인 위에 펼쳐진 오일을 확인하고, 첫 투구 전에 라인을 미리 짜 볼 수 있어요.

---

8. 내 게임은 내 폰에

내 게임은 폰에 저장되고, 계정을 만들 필요 없이 어느 볼링장에서든 오프라인으로 쓸 수 있어요. 원할 때 백업하고, 새 폰으로 전체 기록을 옮겨 올 수도 있어요.

---

Headpin Pro

한 번의 구매로, 구독 없이 더 깊이 들여다보세요. 캐리와 스트라이크 비율로 스트라이크 뒤에 숨은 이유를 확인하고, 가방 속 모든 볼을 비교하고, 볼링장마다 가장 에버가 좋은 볼을 찾고, 라인과 레이아웃을 세밀하게 조절해 무엇이 달라지는지 확인하고, 진행 중인 게임을 잠금 화면과 Dynamic Island에서 따라가 보세요. 기록하는 모든 것은 앞으로도 계속 무료예요.

Headpin은 독립적으로 만든 앱이며 어떤 볼 제조사나 볼링 단체와도 제휴하지 않았어요. 볼 이름과 이미지의 권리는 각 소유자에게 있어요.
```

### What's new in 1.0 (173 of 4000)

```
iPhone용 Headpin의 첫 번째 버전이에요.

모든 투구를 기록하고, 볼과 라인을 함께 남기고, 무엇이 잘 통하는지 확인해 보세요. 모든 데이터는 폰에 저장되고 인터넷이 안 돼도 쓸 수 있어요.

웹에서 Headpin을 써 오셨다면 그곳에서 백업을 내보낸 뒤, 여기 설정의 백업 및 복원에서 가져오세요.
```

### Headpin Pro in-app purchase display name (11 of 30)

```
Headpin Pro
```

### Headpin Pro in-app purchase description (26 of 45)

```
한 번 구매로 캐리와 볼별 분석까지, 구독 없음
```

## Chinese, Traditional (zh-Hant)

### App name (16 of 30)

```
Headpin：保齡球計分與統計
```

### Subtitle (13 of 30)

```
每次出手、每顆球、每條路線
```

### Promotional text (54 of 170)

```
看清分數在哪裡流失。記錄每一顆球，在油型上看見你的路線，找出拉開差距的球與補中方式。在任何球館都能離線使用。
```

### Keywords (100 of 100)

```
聯賽,聯盟賽,平均分,全倒,補中,球瓶,殘瓶,油型,球庫,球道,打孔,雙角度,PAP,USBC,筆記,記分,保齡球館,比賽,成績,分數,轉速,曲球,練球,離線,球皮,球速,洗溝,球友,保齡,手機,球路
```

### Description (882 of 4000)

```
一個 App，讓你看懂自己的球路，打得更好：

1. 計分
2. 路線視覺化
3. 打孔配置視覺化
4. 保齡球球庫
5. 統計與圖表
6. 補中路線
7. 油型
8. 你的比賽，留在你的手機

---

1. 計分

輕鬆計分，也讓每一局都成為可以學習的紀錄。你打出的每一球，包括用了哪顆球、打在哪條路線，都會累積成整個球季的比賽紀錄。

---

2. 路線視覺化

清楚看見你怎麼打這條球道。你的路線會畫在油型上，從站位一路到甜蜜點。球道狀況改變時，你知道該往哪裡移動；下次再遇到同樣的油型，你也會記得哪種打法有效。

---

3. 打孔配置視覺化

打孔前先看見配置。雙角度與 Storm VLS 配置會依你自己的 PAP 畫在球上，送到球具店之前，你就知道會得到什麼效果。

---

4. 保齡球球庫

了解你的球袋。瀏覽超過 800 顆保齡球的規格與照片，建立你的球庫，看看哪一顆球真正為你拿分。

---

5. 統計與圖表

找出分數在哪裡流失。你的平均分、甜蜜點與補中率，以及讓你丟最多分的殘瓶，都會畫成隨時間變化的圖表，讓你看見自己的進步。

---

6. 補中路線

補中更穩。Headpin 會記住你每一種殘瓶的打法，讓你一遇到就能看到合適的路線，並隨著球道逐漸變化跟著你調整。

---

7. 油型

進場前就掌握打法。查詢 PBA 與 Kegel 油型，在球道上看見油的分布，在打出第一球之前就規劃好你的路線。

---

8. 你的比賽，留在你的手機

你的比賽都存在手機裡，在任何球館都能離線使用，不需要建立帳號。想備份就隨時備份，也能把完整紀錄帶到新手機。

---

Headpin Pro

一次購買，不需訂閱，帶你更深入。透過帶倒率與全倒率看懂全倒背後的原因，比較球袋裡的每一顆球，找出在各個球館平均分最高的球，並微調路線與打孔配置，看看會有什麼改變，還能在鎖定畫面和動態島上隨時掌握進行中的比賽。你記錄的一切永遠免費。

Headpin 為獨立開發，與任何球廠或保齡球組織皆無關聯。球款名稱與圖片屬於各自的擁有者。
```

### What's new in 1.0 (129 of 4000)

```
Headpin 的 iPhone 版首度推出。

為每一球計分，連同使用的球與你的路線一起記下，看見什麼打法有效。一切都存在你的手機裡，沒有訊號也能使用。

如果你曾在網頁版使用 Headpin，請先在網頁版匯出備份，再到這裡的「設定」>「備份與還原」匯入。
```

### In-app purchase display name (11 of 30)

```
Headpin Pro
```

### In-app purchase description (24 of 45)

```
一次購買，不需訂閱。深入分析帶倒、全倒與每顆球。
```

## Chinese, Simplified (zh-Hans)

### App name (16 of 30)

```
Headpin：保龄球计分与统计
```

### Subtitle (14 of 30)

```
每一次出手，每颗球，每条路线
```

### Promotional text (58 of 170)

```
看清你在哪里丢分。记录每一颗球，查看路线在油型上的走向，找出真正拉开差距的球和补中线路。离线也能用，在任何球馆都行。
```

### Keywords (100 of 100)

```
联赛,全中,补中,平均分,球道,油型,球库,残瓶,成绩,记录,比分,打孔,球芯,甜区,分瓶,球馆,PAP,USBC,PBA,离线,左手,赛季,球皮,转速,弧线,球包,目标,打法,站位,箭头,Kegel
```

### Description (894 of 4,000)

```
一个应用，帮你读懂自己的比赛，打得更好：

1. 计分
2. 路线可视化
3. 打孔布局可视化
4. 保龄球球库
5. 统计与图表
6. 补中路线
7. 油型
8. 你的比赛，你的手机

---

1. 计分

轻松计分，让每一局都成为可以学习的经验。你打的每一球，包括用了哪颗球、打在球道的哪个位置，都会累积成整个赛季的比赛记录。

---

2. 路线可视化

清楚看到你是怎样打这条球道的。你的路线会画在油型上，从站位一直到甜区。球道状况变化时，你知道该往哪里移动；下次再遇到同样的油型，也能记起当时什么方法管用。

---

3. 打孔布局可视化

打孔之前，先看布局。双角度和 Storm VLS 布局会根据你自己的 PAP 画在球上，送去球具店之前，你就知道打出来会是什么效果。

---

4. 保龄球球库

了解你的球包。浏览 800 多颗保龄球的规格和照片，建立你的球库，看看哪颗球真正在帮你得分。

---

5. 统计与图表

找出你在哪里丢分。你的平均分、甜区命中率和补中率，以及让你丢分最多的残瓶，都会随时间绘成图表，让你亲眼看到自己的进步。

---

6. 补中路线

多补中几个。Headpin 会记住你打每一种残瓶的方式，下次遇到时，合适的路线已经备好；球道逐渐变化时，路线也会跟着你调整。

---

7. 油型

带着答案走进球馆。查询 PBA 和 Kegel 油型，看油在球道上的分布，在打出第一球之前就规划好你的路线。

---

8. 你的比赛，你的手机

你的比赛都存在手机里，在任何球馆都能离线使用，无需创建账号。随时备份，也可以把全部历史记录带到新手机上。

---

Headpin Pro

一次购买，无需订阅，即可更进一步。通过带倒率和全中率，看清全中背后的原因；比较球包里的每一颗球，找出你在每家球馆平均分最高的那颗球；还可以微调路线和打孔布局，看看会有什么变化，并在锁定屏幕和灵动岛上随时掌握进行中的比赛。你记录的一切，永远免费。

Headpin 是独立应用，与任何球品牌或保龄球组织均无关联。球的名称和图片归各自所有者所有。
```

### What's new in 1.0 (131 of 4,000)

```
Headpin iPhone 版首次发布。

为每一次出手计分，同时记下所用的球和你的路线，看清什么管用。所有数据都保存在你的手机上，没有信号也能使用。

如果你之前在网页版使用过 Headpin，请先在网页版导出备份，再到这里的“设置”，“备份与恢复”中导入。
```

### In-app purchase display name (11 of 30)

```
Headpin Pro
```

### In-app purchase description (22 of 45)

```
一次购买，无需订阅。深入分析，记录永远免费。
```

## Spanish, Mexico (es-MX)

### App name (27 of 30)

```
Headpin: Puntaje de boliche
```

### Subtitle (23 of 30)

```
Cada tiro, bola y línea
```

### Promotional text (168 of 170)

```
Descubre dónde pierdes pinos. Registra cada bola, ve tu línea sobre el aceite y halla la bola y los spares que marcan la diferencia. Sin conexión, en cualquier boliche.
```

### Keywords (100 of 100)

```
bolos,chuza,spare,promedio,liga,pista,aceite,arsenal,estadísticas,anotador,pinos,usbc,pap,pba,dejada
```

### Description (2,637 of 4,000)

```
Todo lo que necesitas para entender tu juego y jugar mejor, en una sola app:

1. Puntaje
2. Visualizador de línea
3. Visualizador de layouts
4. Arsenal de bolas de boliche
5. Estadísticas y gráficas
6. Líneas de spare
7. Patrones de aceite
8. Tus juegos, tu teléfono

---

1. Puntaje

Anota tu puntaje de la manera más fácil y convierte cada juego en algo de lo que puedes aprender. Cada bola que lanzas, con la bola que usaste y dónde la jugaste, va armando el registro de tu juego a lo largo de toda la temporada.

---

2. Visualizador de línea

Mira exactamente cómo estás jugando la pista. Tu línea se dibuja sobre el aceite, desde tus pies hasta el bolsillo, así que cuando las pistas cambian sabes hacia dónde moverte, y la próxima vez que veas ese patrón recordarás qué funcionó.

---

3. Visualizador de layouts

Mira un layout antes de perforar. Los layouts dual angle y Storm VLS se dibujan sobre la bola a partir de tu propio PAP, para que sepas lo que vas a obtener antes de llevarla a la tienda de perforación.

---

4. Arsenal de bolas de boliche

Conoce tu maleta. Explora más de 800 bolas de boliche con sus especificaciones y fotos, arma tu arsenal y descubre cuál bola realmente te está dando puntaje.

---

5. Estadísticas y gráficas

Descubre dónde pierdes pinos. Tu promedio, tus porcentajes de bolsillo y de spares, y las dejadas que más te cuestan, en gráficas a lo largo del tiempo para que veas cómo mejoras.

---

6. Líneas de spare

Convierte más spares. Headpin recuerda cómo tiras cada dejada, así que la línea correcta está lista en cuanto se presenta, y se mueve contigo conforme las pistas se van desgastando.

---

7. Patrones de aceite

Llega sabiendo cuál es el tiro. Consulta los patrones PBA y Kegel, mira el aceite dibujado sobre la pista y planea tu línea antes de tu primera bola.

---

8. Tus juegos, tu teléfono

Tus juegos se guardan en tu teléfono y la app funciona sin conexión en cualquier boliche, sin crear una cuenta. Haz un respaldo cuando quieras y lleva todo tu historial a un teléfono nuevo.

---

Headpin Pro

Ve más a fondo con una sola compra y sin suscripción. Descubre qué hay detrás de tus strikes con los porcentajes de carry y de strike, compara todas las bolas de tu maleta, encuentra con qué bola tienes mejor promedio en cada boliche, ajusta líneas y layouts para ver qué cambia y sigue tu juego en curso en la pantalla bloqueada y en la Dynamic Island. Todo lo que registras es gratis, para siempre.

Headpin es independiente y no está afiliada a ningún fabricante de bolas ni a ninguna organización de boliche. Los nombres e imágenes de las bolas pertenecen a sus dueños.
```

### What's new in 1.0 (286 of 4,000)

```
Primera versión de Headpin para iPhone.

Anota cada tiro, guarda con él la bola y tu línea, y mira qué te funciona. Todo se queda en tu teléfono y funciona sin señal.

Si ya jugaste con Headpin en la web, exporta un respaldo allá e impórtalo aquí desde Ajustes, Respaldo y restauración.
```

### In-app purchase display name (11 of 30)

```
Headpin Pro
```

### In-app purchase description (29 of 45)

```
Compra única, sin suscripción
```

## Indonesian (id)

### App name (29 of 30)

```
Headpin: Pencatat Skor Boling
```

### Subtitle (30 of 30)

```
Statistik tiap lemparan & bola
```

### Promotional text (164 of 170)

```
Pahami permainan bolingmu. Catat setiap bola, lihat jalurmu di atas pola minyak, dan temukan bola dan spare yang paling berpengaruh. Bisa offline di arena mana pun.
```

### Keywords (97 of 100)

```
bowling,liga,strike,spare,pola minyak,arsenal,rata-rata,lintasan,pin,layout,pap,usbc,pba,peboling
```

### Description (2513 of 4000)

```
Semua yang kamu perlukan untuk memahami permainanmu dan bermain boling lebih baik, dalam satu aplikasi:

1. Skor
2. Visualisasi jalur
3. Visualisasi layout
4. Arsenal bola boling
5. Statistik & grafik
6. Jalur spare
7. Pola minyak
8. Game-mu, di ponselmu

---

1. Skor

Catat skor dengan mudah, dan jadikan setiap game bahan belajar. Setiap lemparan, lengkap dengan bola yang kamu pakai dan jalur yang kamu mainkan, menjadi catatan permainanmu sepanjang musim.

---

2. Visualisasi jalur

Lihat dengan jelas cara kamu memainkan lintasan. Jalurmu digambar di atas minyak, dari posisi kakimu sampai ke pocket. Saat lintasan berubah, kamu tahu harus bergeser ke mana, dan saat bertemu pola yang sama lagi, kamu ingat apa yang berhasil.

---

3. Visualisasi layout

Lihat layout sebelum bola dibor. Layout dual angle dan Storm VLS digambar di bola berdasarkan PAP-mu sendiri, jadi kamu tahu hasilnya sebelum bola dibawa ke pro shop.

---

4. Arsenal bola boling

Kenali isi tasmu. Jelajahi lebih dari 800 bola boling lengkap dengan spesifikasi dan foto, susun arsenalmu, dan lihat bola mana yang benar-benar menyumbang skor.

---

5. Statistik & grafik

Cari tahu di mana skormu hilang. Rata-rata, persentase pocket dan spare, serta sisa pin yang paling merugikanmu, tampil dalam grafik dari waktu ke waktu, jadi kamu bisa melihat permainanmu makin baik.

---

6. Jalur spare

Ambil lebih banyak spare. Headpin mengingat cara kamu mengambil setiap sisa pin, jadi jalur yang tepat langsung siap saat sisa pin itu muncul, dan ikut bergeser bersamamu saat lintasan berubah.

---

7. Pola minyak

Datang dengan rencana. Cari pola PBA dan Kegel, lihat sebaran minyaknya di lintasan, dan rencanakan jalurmu sebelum lemparan pertama.

---

8. Game-mu, di ponselmu

Game-mu tersimpan di ponselmu dan bisa dipakai offline di arena boling mana pun, tanpa perlu membuat akun. Buat cadangan kapan saja dan bawa seluruh riwayatmu ke ponsel baru.

---

Headpin Pro

Lebih dalam dengan sekali beli, tanpa langganan. Lihat apa di balik strike-mu lewat persentase carry dan strike, bandingkan setiap bola di tasmu, temukan bola dengan rata-rata terbaikmu di setiap arena boling, atur jalur serta layout untuk melihat apa yang berubah, dan pantau game-mu yang sedang berjalan di Layar Terkunci dan di Dynamic Island. Semua yang kamu catat tetap gratis, selamanya.

Headpin adalah aplikasi independen dan tidak berafiliasi dengan produsen bola atau organisasi boling mana pun. Nama dan gambar bola adalah milik pemiliknya masing-masing.
```

### What's new in 1.0 (319 of 4000)

```
Rilis pertama Headpin untuk iPhone.

Catat skor setiap lemparan, simpan bola dan jalurmu bersamanya, dan lihat apa yang berhasil. Semuanya tersimpan di ponselmu dan tetap berjalan tanpa sinyal.

Kalau kamu pernah memakai Headpin di web, ekspor cadangan di sana lalu impor di sini lewat Pengaturan, Cadangan & pemulihan.
```

### Headpin Pro in-app purchase display name (11 of 30)

```
Headpin Pro
```

### Headpin Pro in-app purchase description (38 of 45)

```
Carry, strike, tiap bola. Sekali beli.
```

## Malay (ms)

### App name (24 of 30)

```
Headpin: Kad Skor Boling
```

### Subtitle (30 of 30)

```
Statistik tiap balingan & bola
```

### Promotional text (162 of 170)

```
Fahami permainan boling anda. Rekod setiap bola, lihat laluan anda di atas corak minyak, dan cari bola dan spare yang membawa perbezaan. Berfungsi di luar talian.
```

### Keywords (97 of 100)

```
bowling,liga,strike,spare,corak minyak,arsenal,purata,lorong,pin,layout,pap,usbc,pba,tenpin,kegel
```

### Description (2687 of 4000)

```
Semua yang anda perlukan untuk memahami permainan anda dan bermain boling dengan lebih baik, dalam satu aplikasi:

1. Skor
2. Visualisasi laluan
3. Visualisasi layout
4. Arsenal bola boling
5. Statistik & carta
6. Laluan spare
7. Corak minyak
8. Permainan anda, telefon anda

---

1. Skor

Catat skor dengan mudah, dan jadikan setiap permainan sesuatu yang boleh anda pelajari. Setiap balingan, bersama bola yang anda gunakan dan laluan yang anda mainkan, membina rekod permainan anda sepanjang musim.

---

2. Visualisasi laluan

Lihat dengan jelas cara anda bermain di lorong. Laluan anda dilukis di atas minyak, dari kaki anda hingga ke pocket. Apabila lorong berubah, anda tahu ke mana perlu beranjak, dan apabila bertemu corak yang sama lagi, anda ingat apa yang berkesan.

---

3. Visualisasi layout

Lihat layout sebelum bola digerudi. Layout dual angle dan Storm VLS dilukis pada bola berdasarkan PAP anda sendiri, jadi anda tahu hasilnya sebelum bola dibawa ke pro shop.

---

4. Arsenal bola boling

Kenali isi beg anda. Lihat lebih 800 bola boling lengkap dengan spesifikasi dan foto, bina arsenal anda, dan lihat bola mana yang benar-benar menyumbang skor.

---

5. Statistik & carta

Ketahui di mana anda kehilangan pin. Purata, peratusan pocket dan spare anda, serta pin yang tinggal yang paling merugikan anda, dipaparkan dalam carta dari masa ke masa supaya anda dapat melihat permainan anda semakin baik.

---

6. Laluan spare

Dapatkan lebih banyak spare. Headpin mengingati cara anda mengambil setiap pin yang tinggal, jadi laluan yang betul sedia sebaik sahaja ia muncul, dan ia beranjak bersama anda apabila keadaan lorong berubah.

---

7. Corak minyak

Masuk dengan rancangan. Cari corak PBA dan Kegel, lihat minyak yang dilukis pada lorong, dan rancang laluan anda sebelum balingan pertama.

---

8. Permainan anda, telefon anda

Permainan anda disimpan dalam telefon dan boleh digunakan di luar talian di mana-mana pusat boling, tanpa perlu membuat akaun. Buat sandaran bila-bila masa dan bawa seluruh sejarah anda ke telefon baharu.

---

Headpin Pro

Selami lebih mendalam dengan satu pembelian, tanpa langganan. Lihat apa di sebalik strike anda melalui kadar carry dan strike, bandingkan setiap bola dalam beg anda, cari bola dengan purata terbaik anda di setiap pusat boling, laraskan laluan serta layout untuk melihat apa yang berubah, dan ikuti permainan anda yang sedang berjalan pada Skrin Kunci dan dalam Dynamic Island. Semua yang anda rekod kekal percuma, selama-lamanya.

Headpin ialah aplikasi bebas dan tidak mempunyai sebarang kaitan dengan mana-mana pengeluar bola atau organisasi boling. Nama dan imej bola adalah milik pemiliknya masing-masing.
```

### What's new in 1.0 (331 of 4000)

```
Keluaran pertama Headpin untuk iPhone.

Catat skor setiap balingan, simpan bola dan laluan anda bersamanya, dan lihat apa yang berkesan. Semuanya kekal dalam telefon anda dan berfungsi tanpa isyarat.

Jika anda pernah bermain dengan Headpin di web, eksport sandaran di sana dan import di sini melalui Tetapan, Sandaran & pemulihan.
```

### Headpin Pro in-app purchase display name (11 of 30)

```
Headpin Pro
```

### Headpin Pro in-app purchase description (40 of 45)

```
Carry, strike, setiap bola. Sekali beli.
```

## Spanish, Spain (es-ES)

The app has one Spanish, written for Latin America (its glossary), and the Spain
storefront shows the Spanish (Spain) localization, so without this section a
bowler in Spain sees the Mexican page. These are the words Spain uses: *bolos*
and *bolera*, *pleno* for a strike in the keywords, *partida* for a game, and
*móvil*. The screens stay the app's own Spanish, so a menu path is quoted as
the app writes it (Ajustes, Respaldos).

### App name (28 of 30)

```
Headpin: Puntuación de bolos
```

### Subtitle (25 of 30)

```
Cada tirada, bola y línea
```

### Promotional text (169 of 170)

```
Descubre dónde pierdes bolos. Registra cada bola, mira tu línea sobre el aceite y halla la bola y los spares que marcan la diferencia. Sin conexión, en cualquier bolera.
```

### Keywords (98 of 100)

```
bolera,pleno,semipleno,strike,spare,media,liga,pista,aceite,arsenal,estadísticas,marcador,usbc,pba
```

### Description (2621 of 4000)

```
Todo lo que necesitas para entender tu juego y jugar mejor a los bolos, en una sola app:

1. Puntuación
2. Visualizador de línea
3. Visualizador de layouts
4. Arsenal de bolas
5. Estadísticas y gráficos
6. Líneas de spare
7. Patrones de aceite
8. Tus partidas, en tu móvil

---

1. Puntuación

Apunta la puntuación de la forma más sencilla y convierte cada partida en algo de lo que aprender. Cada bola que lanzas, con la bola que usaste y por dónde la jugaste, va formando el registro de tu juego a lo largo de toda la temporada.

---

2. Visualizador de línea

Mira exactamente cómo estás jugando la pista. Tu línea se dibuja sobre el aceite, desde tus pies hasta el bolsillo, así que cuando las pistas cambian sabes hacia dónde moverte, y la próxima vez que te encuentres ese patrón recordarás qué funcionó.

---

3. Visualizador de layouts

Mira un layout antes de taladrar. Los layouts dual angle y Storm VLS se dibujan sobre la bola a partir de tu propio PAP, para que sepas lo que vas a obtener antes de llevarla a la tienda.

---

4. Arsenal de bolas

Conoce tu bolsa. Explora más de 800 bolas de bolos con sus especificaciones y fotos, monta tu arsenal y descubre qué bola te está dando puntos de verdad.

---

5. Estadísticas y gráficos

Descubre dónde pierdes bolos. Tu media, tus porcentajes de bolsillo y de spares, y las dejadas que más te cuestan, en gráficos a lo largo del tiempo para que veas cómo mejoras.

---

6. Líneas de spare

Haz más spares. Headpin recuerda cómo tiras cada dejada, así que la línea correcta está lista en cuanto aparece, y se mueve contigo a medida que las pistas cambian.

---

7. Patrones de aceite

Llega sabiendo qué tiro hacer. Consulta los patrones PBA y Kegel, mira el aceite dibujado sobre la pista y planifica tu línea antes de la primera bola.

---

8. Tus partidas, en tu móvil

Tus partidas se guardan en tu móvil y la app funciona sin conexión en cualquier bolera, sin crear una cuenta. Haz una copia de seguridad cuando quieras y llévate todo tu historial a un móvil nuevo.

---

Headpin Pro

Profundiza más con una sola compra y sin suscripción. Descubre qué hay detrás de tus plenos con los porcentajes de carry y de strike, compara todas las bolas de tu bolsa, encuentra con qué bola tienes mejor media en cada bolera, ajusta líneas y layouts para ver qué cambia y sigue tu juego en curso en la pantalla bloqueada y en la Dynamic Island. Todo lo que registras es gratis, para siempre.

Headpin es independiente y no está afiliada a ningún fabricante de bolas ni a ninguna organización de bolos. Los nombres e imágenes de las bolas pertenecen a sus propietarios.
```

### What's new in 1.0 (289 of 4000)

```
Primera versión de Headpin para iPhone.

Apunta cada tirada, guarda con ella la bola y tu línea, y mira qué te funciona. Todo se queda en tu móvil y funciona sin cobertura.

Si ya jugabas con Headpin en la web, exporta allí una copia de seguridad e impórtala aquí desde Ajustes, Respaldos.
```

### Headpin Pro in-app purchase display name (11 of 30)

```
Headpin Pro
```

### Headpin Pro in-app purchase description (29 of 45)

```
Compra única, sin suscripción
```

## English (U.K.)

Not a translation, a second English listing. English (U.K.) is the extra
language of the App Store in Malaysia, Indonesia, Hong Kong, Taiwan, Korea,
China, Mexico and Spain, and the main one in the UK and Singapore, and Apple
indexes its keywords there alongside the local language's. Without it those
storefronts show the U.S. English page, whose keywords are not indexed there.
So it is a second 100 characters of keywords in every one of those countries,
for the bowlers who search in English.

Paste the English (U.S.) name, subtitle, promotional text, description and
what's new as they are, with *Visualizer* spelt *Visualiser* (four times). Only the keywords differ: none
repeats a word of the name or subtitle, and they reach for the British and
Asian English word *tenpin*, and leave out *bowls*, which is lawn bowls there.

### Keywords (99 of 100)

```
tenpin,league,pins,strike,spare,oil pattern,arsenal,average,tracker,layout,pap,usbc,pba,lane,keeper
```
