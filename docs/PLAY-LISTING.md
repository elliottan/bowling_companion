# Google Play listing drafts

Draft text and form answers for the Android app's Play Console page, for the
owner to review and paste. It is copy, not code: nothing reads this file. It
follows [APP-STORE-LISTING.md](./APP-STORE-LISTING.md), so the two stores say
the same thing, with the iPhone-only parts left out (the Lock Screen, the
Dynamic Island and the Apple Watch, ADR-274). The voice is
`docs/DESIGN-LANGUAGE.md` section 8: sentence case, contractions, one word per
thing, no exclamation marks, no em dashes.

Every limit below is Google's, and each count was measured on the text as
written here. Recount after any edit; the counts are in the headings. Play
indexes the title, the short description and the full description; it has no
keyword field, and it turns away listings that stuff keywords, repeat
themselves, or claim a rank ("best", "#1") or a price ("free") in the title or
icon.

English (United States) only for now. The other seven languages follow from
[APP-STORE-LISTING-TRANSLATED.md](./APP-STORE-LISTING-TRANSLATED.md) once this
one is settled, as Play Console translations of the same text.

## App name (30 of 30)

```
Headpin: Bowling Score & Stats
```

The same name as the App Store, so a bowler who hears of it finds the same
thing on either phone.

## Short description (76 of 80)

The line under the name in search results and on the listing.

```
Score every ball, see your line over the oil, and find the ball that scores.
```

## Full description (2,243 of 4,000)

```
Everything you need to understand your game and bowl better, in one app:

1. Scoring
2. Line Visualizer
3. Layouts Visualizer
4. Bowling Ball Arsenal
5. Stats & Charts
6. Spare Lines
7. Oil Patterns
8. Your Games, Your Phone

---

1. Scoring

Keep score the easy way, and turn every game into something you can learn from. Each ball you bowl, with the ball you threw and where you played it, builds a record of your game across the whole season.

---

2. Line Visualizer

See exactly how you're playing the lane. Your line is drawn over the oil, from your feet to the pocket, so when the lanes change you know where to move, and the next time you see that pattern you'll remember what worked.

---

3. Layouts Visualizer

See a layout before you drill it. Dual angle and Storm VLS layouts are drawn on the ball from your own PAP, so you know what you're getting before it goes to the pro shop.

---

4. Bowling Ball Arsenal

Know your bag. Browse over 800 bowling balls with specs and photos, build your arsenal, and see which ball is really scoring for you.

---

5. Stats & Charts

Find out where your pins are going. Your average, your pocket and spare percentages, and the leaves that cost you the most, charted over time so you can watch yourself improve.

---

6. Spare Lines

Make more spares. Headpin remembers how you shoot every leave, so the right line is ready the moment it comes up, and it moves with you as the lanes break down.

---

7. Oil Patterns

Walk in knowing the shot. Look up PBA and Kegel patterns, see the oil laid out on the lane, and plan your line before your first ball.

---

8. Your Games, Your Phone

Your games live on your phone and work offline at any alley, with no account to create. Back up whenever you like and bring your whole history to a new phone.

---

Headpin Pro

Go deeper with one purchase and no subscription. See what's behind your strikes with carry and strike rates, compare every ball in your bag, find the ball you average best with at each alley, and fine-tune lines and layouts to see what changes. Everything you record stays free, forever.

Headpin is independent and isn't affiliated with any ball manufacturer or bowling organization. Ball names and images belong to their owners.
```

It is the App Store description with the Lock Screen and Dynamic Island left
out of the Headpin Pro paragraph. "Over 800" was checked against
`public/catalog/catalog.json` (848) on 2026-11-11; recheck it before each
release.

## Release notes for 1.0 (under 500)

```
The first release of Headpin for Android.

Score every shot, keep the ball and your line with it, and see what's working. Everything stays on your phone and works without a signal.

If you've bowled with Headpin on the web, export a backup there and import it here from Settings, Backup & restore.
```

## Store settings

- **App or game:** App. **Free or paid:** Free (Headpin Pro is an in-app
  product, so the app itself is free; this cannot be changed to paid later).
- **Category:** Sports. **Tags:** pick the bowling and sports-tracking ones
  Play Console offers; it allows up to five.
- **Contact email:** `hello@headpin.app` (`FEEDBACK_EMAIL`, the address the
  app uses). **Website:** `https://headpin.app`. Play shows the email on the
  listing.
- **Privacy policy:** `https://headpin.app/legal`, the same page the app shows
  in Settings (ADR-181). It names Google Play for the Android app's purchase
  as of 0.106.0.

## The Headpin Pro in-app product

Monetize, Products, One-time products, Create:

- **Product ID:** `app.headpin.pro`. It must be exactly this: the app asks Play
  for this id (`PRO_PRODUCT_ID`, ADR-274), and an id cannot be changed or
  reused once made.
- **Name:** Headpin Pro. **Description (under 200):**
  `Deeper stats, the game plan, and the line and layout tools. Pay once, with every Pro feature added later included.`
- **Price:** US$9.99, the same as the App Store, with Play's local prices
  for other countries.
- Leave it non-consumable in spirit: the app never consumes it, so it is
  bought once per Google account.
- **License testing** (Setup, License testing): add the owner's own Google
  account, so test purchases from a testing track are free and can be
  refunded.

## App content (the policy forms)

- **Privacy policy:** the URL above.
- **Ads:** No, the app contains no ads.
- **App access:** All functionality is available without special access. Pro
  is a purchase, not a login, so no test account is needed.
- **Content rating** (IARC questionnaire): category "Utility, Productivity,
  Communication, or Other". No violence, sexuality, language, controlled
  substances or gambling. Users cannot interact or exchange content with each
  other in the app (a share card goes out through the phone's own share sheet,
  not through Headpin), no location is shared, and digital purchases: yes. It
  should come out as Everyone / PEGI 3.
- **Target audience:** 13 and over. Choosing ages under 13 brings in the
  Families policy and its requirements, which the app has not been reviewed
  against.
- **News app:** No. **Government app:** No. **Financial features:** None.
  **Health:** None.
- **Data safety:** the app collects and shares no user data.
  - Games, balls, alleys and settings live only on the phone, in the web
    view's own storage, and leave it only in a backup file the bowler saves
    themselves. Play's form counts data as collected only when it leaves the
    device for the developer or a third party, so none of that is collected.
  - The app fetches the ball and pattern catalogs and their photos from
    headpin.app. Those requests carry no account, no identifier and no
    bowler data; the host's own request logs are not collection under Play's
    definition (data processed only to serve the request).
  - The purchase is Google Play's own: Play handles payment and the app only
    asks Play whether this account owns `app.headpin.pro`. Google's
    processing is Google's, and is not declared as the app's.
  - No analytics run in the store apps (PRO-LAUNCH lists Umami counts from the
    app as not done). **If they are added, this form changes first.**
  - Answers: "Does your app collect or share any of the required user data
    types?" No. "Is all of the user data collected by your app encrypted in
    transit?" Not asked once the answer is No. "Do you provide a way for users
    to request that their data is deleted?" Not asked once the answer is No.
- **Advertising ID:** the app does not use it. Play Console asks because the
  target SDK is 33 or newer; answer No.

## Graphics

Not made yet. Play's rules differ from Apple's, so the App Store sets cannot be
uploaded as they are:

- **App icon:** 512 x 512 PNG, 32-bit, up to 1 MB. `scripts/native/icons.mjs`
  draws the launcher icons from the same pin and can write this size too.
- **Feature graphic:** 1024 x 500, required. Artwork, not a screenshot, with no
  important content near the edges (Play crops it in places). Nothing in the
  repo yet.
- **Phone screenshots:** 2 to 8, each side 320 to 3,840 pixels, and the long
  side **no more than twice** the short side. The App Store sets are 1320 x
  2868 and 1206 x 2622, about 2.17 to 1, which Play refuses. They need a Play
  size from `scripts/app-store/screenshots.mjs`, 1080 x 1920 (9 to 16) for
  Play to promote them, with the captioned phone fitted inside rather than
  cropped. The screens themselves should be taken from the Android app, or at
  least with nothing iPhone-only in them (no Live Activity).
- Tablet screenshots are optional, and the app is phone first.

## Testing before production

A personal developer account made after November 2023 must run a **closed
test with at least 12 testers opted in for 14 days in a row** before it can
apply for production. The order:

1. Create the app in Play Console (default language English (United States),
   app, free) and fill in App content above.
2. Upload the first bundle to **Internal testing** (`npm run bundle:android`,
   `docs/DEPLOYMENT.md`), which turns on Play App Signing. Copy the app
   signing key's SHA-256 for `/.well-known/assetlinks.json`.
3. Create the `app.headpin.pro` product, and try a purchase and Restore
   purchase from the internal build with a license tester account.
4. Promote the build to a **Closed testing** track, add the 12 or more
   testers, and keep them opted in for 14 days.
5. Apply for production access, then publish.
