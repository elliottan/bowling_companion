// The captions over each App Store screenshot, per language: the headline and
// the line under it. screenshots.mjs draws them with frame.html, and the shot
// list (which screen, and why) is the table in docs/APP-STORE-LISTING.md.
//
// A "|" in a headline is a line break, so no word is left alone on a line and a
// CJK headline breaks where a reader would pause. <em> is the gold words. Each
// language uses the app's own words for a thing (the catalog of that locale),
// so the caption and the screen under it agree. They are drafts, like the
// listing: read them with a native speaker before submission.
//
// The keys are the app's locales (src/lib/i18n.ts). App Store Connect's
// Spanish (Mexico) and Spanish (Spain) both take the `es` set, and English
// (U.K.) the `en` one.

export const CAPTIONS = {
  en: {
    "01-score": { h: "Score <em>every shot</em>.", sub: "Tap the pins you left. Unlimited games, free." },
    "02-line": { h: "Remember every|<em>line</em> you threw.", sub: "Your line drawn over the oil, shot by shot." },
    "03-arsenal": { h: "Your whole|<em>arsenal</em>, free.", sub: "Every ball you own, with no cap on the bag." },
    "04-stats": { h: "Know what's|<em>working</em>.", sub: "Your average, pocket and spares, over time." },
    "05-catalog": { h: "Over 800 balls,|<em>one tap</em>.", sub: "Specs and photos. Build your bag from them." },
    "06-pattern": { h: "See the oil|<em>before you throw</em>.", sub: "Load tables and the oil drawn on the lane." },
    "07-layout": { h: "See a layout|<em>before you drill it</em>.", sub: "Dual angle and Storm\u00a0VLS, drawn from your PAP." },
    "08-pro": { h: "Go deeper|with <em>Pro</em>.", sub: "Carry, strike, ball by ball, alley by alley. One purchase, no subscription." },
    "09-home": { h: "Works without|<em>a signal</em>.", sub: "No account to make. Built for the alley." },
    "10-history": { h: "Every night,|<em>on your phone</em>.", sub: "Unlimited sessions. Back up any time, free." }
  },
  es: {
    "01-score": { h: "Anota <em>cada tiro</em>.", sub: "Toca los pinos que dejaste. Juegos ilimitados, gratis." },
    "02-line": { h: "Recuerda cada|<em>línea</em> que tiraste.", sub: "Tu línea dibujada sobre el aceite, tiro a tiro." },
    "03-arsenal": { h: "Todo tu|<em>arsenal</em>, gratis.", sub: "Cada bola que tienes, sin límite en la maleta." },
    "04-stats": { h: "Descubre qué te|<em>funciona</em>.", sub: "Tu promedio, bolsillo y spares, a lo largo del tiempo." },
    "05-catalog": { h: "Más de 800 bolas,|<em>a un toque</em>.", sub: "Especificaciones y fotos. Arma tu maleta con ellas." },
    "06-pattern": { h: "Ve el aceite|<em>antes de tirar</em>.", sub: "Tablas de cargas y el aceite dibujado en la pista." },
    "07-layout": { h: "Ve un layout|<em>antes de perforar</em>.", sub: "Dual angle y Storm\u00a0VLS, dibujados desde tu PAP." },
    "08-pro": { h: "Ve más a fondo|con <em>Pro</em>.", sub: "Carry, strike, bola por bola, pista por pista. Una compra, sin suscripción." },
    "09-home": { h: "Funciona|<em>sin señal</em>.", sub: "Sin crear cuenta. Hecha para la pista." },
    "10-history": { h: "Cada noche,|<em>en tu teléfono</em>.", sub: "Sesiones ilimitadas. Respalda cuando quieras, gratis." }
  },
  ja: {
    "01-score": { h: "スコアは|<em>1投ずつ</em>。", sub: "残ったピンをタップ。ゲーム数は無制限、無料。" },
    "02-line": { h: "投げたラインを、|<em>すべて記憶</em>。", sub: "オイルの上にラインを描画。1投ずつ振り返れます。" },
    "03-arsenal": { h: "<em>アーセナル</em>も、|すべて無料。", sub: "持っているボールをすべて登録。バッグの本数に上限なし。" },
    "04-stats": { h: "何が<em>効いているか</em>、|見えてくる。", sub: "アベレージ、ポケット、スペアの推移をグラフで。" },
    "05-catalog": { h: "800種類超のボールを|<em>ワンタップで</em>。", sub: "スペックと写真つき。カタログからバッグを作れます。" },
    "06-pattern": { h: "投げる前に、|<em>オイルを見る</em>。", sub: "ロードテーブルとレーン上のオイルを描画。" },
    "07-layout": { h: "ドリルする前に、|<em>レイアウトを確認</em>。", sub: "デュアルアングルとStorm\u00a0VLSを、あなたのPAPから描画。" },
    "08-pro": { h: "<em>Pro</em>で、|さらに深く。", sub: "キャリー、ストライク、ボール別、ボウリング場別。買い切りでサブスクなし。" },
    "09-home": { h: "電波がなくても|<em>使える</em>。", sub: "アカウント登録は不要。ボウリング場で使うためのアプリ。" },
    "10-history": { h: "毎晩の記録を、|<em>iPhoneに</em>。", sub: "セッション数は無制限。バックアップはいつでも無料。" }
  },
  ko: {
    "01-score": { h: "<em>모든 투구</em>를|기록하세요.", sub: "남은 핀만 누르세요. 게임 수 제한 없이 무료예요." },
    "02-line": { h: "던진 라인을|<em>모두 기억</em>하세요.", sub: "내 라인이 오일 위에 투구마다 그려져요." },
    "03-arsenal": { h: "내 <em>아스널</em>을|무료로.", sub: "가진 볼을 가방 제한 없이 모두 담아요." },
    "04-stats": { h: "<em>무엇이 통하는지</em>|확인하세요.", sub: "에버리지, 포켓, 스페어를 시간순으로 봐요." },
    "05-catalog": { h: "800개 넘는 볼,|<em>탭 한 번</em>.", sub: "사양과 사진을 보고 내 가방을 채워 보세요." },
    "06-pattern": { h: "던지기 전에|<em>오일을 확인</em>하세요.", sub: "로드 표와 레인 위의 오일을 한눈에." },
    "07-layout": { h: "드릴링 전에|<em>레이아웃 확인</em>.", sub: "듀얼 앵글과 Storm\u00a0VLS를 내 PAP로 그려 줘요." },
    "08-pro": { h: "<em>Pro</em>로|더 깊이.", sub: "캐리, 스트라이크, 볼별, 볼링장별 분석. 한 번 구매, 구독 없음." },
    "09-home": { h: "인터넷 없이도|<em>잘 돼요</em>.", sub: "계정 없이 시작해요. 볼링장에 딱 맞는 앱이에요." },
    "10-history": { h: "매주 리그 기록을|<em>내 폰에</em>.", sub: "세션 수 제한 없이. 백업은 언제든 무료예요." }
  },
  "zh-Hant": {
    "01-score": { h: "<em>每一球</em>|都計分。", sub: "點選你留下的球瓶。局數不限，永久免費。" },
    "02-line": { h: "記住你打過的|<em>每條路線</em>。", sub: "你的路線畫在油型上，一球一球清楚可見。" },
    "03-arsenal": { h: "完整<em>球庫</em>，|免費使用。", sub: "你擁有的每顆球都能加入，球袋沒有數量上限。" },
    "04-stats": { h: "知道什麼打法|<em>有效</em>。", sub: "你的平均分、甜蜜點與補中，隨時間一目了然。" },
    "05-catalog": { h: "超過 800 顆球，|<em>一點即達</em>。", sub: "規格與照片齊全，直接用來建立你的球袋。" },
    "06-pattern": { h: "出手前，|<em>先看見油</em>。", sub: "油量表與畫在球道上的油型。" },
    "07-layout": { h: "打孔前，|<em>先看見配置</em>。", sub: "雙角度與 Storm\u00a0VLS，依你的 PAP 繪製。" },
    "08-pro": { h: "用 <em>Pro</em>|看得更深。", sub: "帶倒、全倒，逐球、逐館分析。一次購買，不需訂閱。" },
    "09-home": { h: "沒有訊號|<em>也能用</em>。", sub: "不需建立帳號，為球館而生。" },
    "10-history": { h: "每一場，|<em>都存在手機裡</em>。", sub: "場次不限。隨時備份，免費。" }
  },
  "zh-Hans": {
    "01-score": { h: "为<em>每一次出手</em>|计分。", sub: "点选剩下的球瓶。局数不限，免费。" },
    "02-line": { h: "记住你打过的|<em>每条路线</em>。", sub: "你的路线画在油型上，一球一球看。" },
    "03-arsenal": { h: "你的全部<em>球库</em>，|免费。", sub: "你拥有的每颗球都能记录，球包不设上限。" },
    "04-stats": { h: "知道什么|<em>管用</em>。", sub: "平均分、甜区和补中，随时间一目了然。" },
    "05-catalog": { h: "800 多颗球，|<em>一点即达</em>。", sub: "规格和照片俱全，用它们组建你的球包。" },
    "06-pattern": { h: "出手之前，|<em>先看油</em>。", sub: "油量表，以及画在球道上的油型。" },
    "07-layout": { h: "打孔之前，|<em>先看布局</em>。", sub: "根据你的 PAP 绘制双角度和 Storm\u00a0VLS。" },
    "08-pro": { h: "用 <em>Pro</em>|更进一步。", sub: "带倒、全中，逐球、逐馆分析。一次购买，无需订阅。" },
    "09-home": { h: "没有信号|<em>也能用</em>。", sub: "无需账号，专为球馆打造。" },
    "10-history": { h: "每一场，|<em>都存在手机里</em>。", sub: "场次不限。随时备份，免费。" }
  },
  id: {
    "01-score": { h: "Catat skor|<em>setiap lemparan</em>.", sub: "Ketuk pin yang tersisa. Game tanpa batas, gratis." },
    "02-line": { h: "Ingat setiap|<em>jalur</em> lemparanmu.", sub: "Jalurmu digambar di atas minyak, lemparan demi lemparan." },
    "03-arsenal": { h: "Seluruh <em>arsenal</em>-mu,|gratis.", sub: "Semua bola milikmu, tanpa batas isi tas." },
    "04-stats": { h: "Lihat apa yang|<em>berhasil</em>.", sub: "Rata-rata, pocket, dan spare-mu dari waktu ke waktu." },
    "05-catalog": { h: "800+ bola,|<em>sekali ketuk</em>.", sub: "Spesifikasi dan foto. Susun tasmu dari situ." },
    "06-pattern": { h: "Lihat minyaknya|<em>sebelum melempar</em>.", sub: "Tabel load dan minyak yang digambar di lintasan." },
    "07-layout": { h: "Lihat layout|<em>sebelum dibor</em>.", sub: "Dual angle dan Storm\u00a0VLS, digambar dari PAP-mu." },
    "08-pro": { h: "Lebih dalam|dengan <em>Pro</em>.", sub: "Carry, strike, per bola, per arena. Sekali beli, tanpa langganan." },
    "09-home": { h: "Tetap jalan|<em>tanpa sinyal</em>.", sub: "Tanpa akun. Dibuat untuk dipakai di arena boling." },
    "10-history": { h: "Setiap malam,|<em>di ponselmu</em>.", sub: "Sesi tanpa batas. Cadangkan kapan saja, gratis." }
  },
  ms: {
    "01-score": { h: "Catat skor|<em>setiap balingan</em>.", sub: "Ketik pin yang tinggal. Permainan tanpa had, percuma." },
    "02-line": { h: "Ingat setiap|<em>laluan</em> balingan anda.", sub: "Laluan anda dilukis di atas minyak, balingan demi balingan." },
    "03-arsenal": { h: "Seluruh <em>arsenal</em>|anda, percuma.", sub: "Setiap bola milik anda, tanpa had dalam beg." },
    "04-stats": { h: "Lihat apa yang|<em>berkesan</em>.", sub: "Purata, pocket dan spare anda, dari masa ke masa." },
    "05-catalog": { h: "800+ bola,|<em>satu ketikan</em>.", sub: "Spesifikasi dan foto. Bina beg anda daripadanya." },
    "06-pattern": { h: "Lihat minyak|<em>sebelum membaling</em>.", sub: "Jadual load dan minyak yang dilukis pada lorong." },
    "07-layout": { h: "Lihat layout|<em>sebelum digerudi</em>.", sub: "Dual angle dan Storm\u00a0VLS, dilukis dari PAP anda." },
    "08-pro": { h: "Lebih mendalam|dengan <em>Pro</em>.", sub: "Carry, strike, setiap bola, setiap pusat boling. Sekali beli, tanpa langganan." },
    "09-home": { h: "Berfungsi|<em>tanpa isyarat</em>.", sub: "Tiada akaun diperlukan. Dibina untuk pusat boling." },
    "10-history": { h: "Setiap malam,|<em>dalam telefon anda</em>.", sub: "Sesi tanpa had. Sandarkan bila-bila masa, percuma." }
  }
};
