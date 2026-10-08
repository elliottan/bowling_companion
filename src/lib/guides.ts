/**
 * The guide list: layout and equipment articles that do not change between
 * sessions, kept in the app because the alley is where they get read and the
 * app is offline there.
 *
 * Static data rather than a Dexie table. Nothing here is the bowler's, so
 * nothing here has to survive a restore, migrate across a schema version or
 * appear in a backup file. It ships with the bundle and updates when the app
 * does. A guide the user writes is a different feature, and would be a table.
 *
 * The body is a small block union rather than markdown so the renderer stays a
 * switch over known shapes: no parser to pull in, no HTML to sanitise, and the
 * design language decides what a heading looks like rather than a stylesheet
 * for someone else's output.
 */

import { formatRoute } from "./appRoute";

export type GuideBlock =
  | { kind: "heading"; text: string }
  | { kind: "text"; text: string }
  | { kind: "list"; items: string[] }
  /** A term and what it means, for the words a layout conversation
   *  assumes you already have. */
  | { kind: "terms"; items: Array<{ term: string; text: string }> }
  /** A drawing. The id names one of the figures in `components/GuideFigure`,
   *  which owns the geometry: `lib` cannot import a component, and a figure is
   *  markup rather than content. The caption is also its spoken name. */
  | { kind: "figure"; figure: GuideFigureId; caption: string };

/** Kept in step with `GuideFigureId` in `components/GuideFigure.tsx` by hand,
 *  because importing it here would point `lib` at a component. A figure named
 *  here and missing there fails `guides.test.ts` rather than rendering blank. */
export type GuideFigureId = "ball-points" | "dual-angles" | "pin-buffer";

export interface GuideSource {
  label: string;
  url: string;
}

export interface Guide {
  id: string;
  title: string;
  /** One line on the list row, so it has to say who the guide is for. */
  summary: string;
  /** The topic it sits under. Guides are grouped by this, in TOPICS order. */
  topic: GuideTopic;
  /** Rounded reading time, for deciding whether this fits before the squad. */
  minutes: number;
  body: GuideBlock[];
  /** Where the claims come from. A layout article that cannot be checked is
   *  worth less than one that can, since the bowler is about to spend money. */
  sources?: GuideSource[];
}

export type GuideTopic = "Setting up" | "Layouts" | "Equipment";

/** Order the shelves appear in. */
export const GUIDE_TOPICS: readonly GuideTopic[] = ["Setting up", "Layouts", "Equipment"];

export const GUIDES: readonly Guide[] = [
  {
    // The long form of the Settings captions, which are one line each (ADR-115).
    id: "your-settings",
    title: "Your bowling profile",
    summary: "What your hand, grip, PAP and drift change in the app.",
    topic: "Setting up",
    minutes: 2,
    body: [
      { kind: "heading", text: "Hand" },
      {
        kind: "text",
        text: "Board 1 is the one on your side of the lane, so every board number in the app depends on which hand you bowl with. Switch hands and every board flips to the other side. Sessions you already saved keep the numbers they had."
      },
      { kind: "heading", text: "Grip" },
      {
        kind: "text",
        text: "One-handed has a thumb, two-handed doesn't. Pick two-handed and the ball is drawn without a thumb hole."
      },
      { kind: "heading", text: "PAP" },
      {
        kind: "text",
        text: "Your positive axis point: how far over from the center of your grip, then how far up or down. The layouts screen uses it for every number. Your pro shop can measure it for you."
      },
      { kind: "heading", text: "Release offset and drift" },
      {
        kind: "text",
        text: "Release offset is how many boards from your slide foot the ball lands."
      },
      {
        kind: "text",
        text: "Drift is how far you move sideways on the approach. It can depend on where you start: outside, middle or inside."
      },
      {
        kind: "text",
        text: "The lane view uses both to work out your slide and laydown from the stance you enter."
      }
    ]
  },
  {
    id: "layout-vocabulary",
    title: "Layout vocabulary",
    summary: "PAP, VAL, pin, PSA and flare, before the numbers make sense.",
    topic: "Layouts",
    minutes: 3,
    body: [
      {
        kind: "text",
        text: "Every layout system names the same few points on the ball."
      },
      {
        kind: "figure",
        figure: "ball-points",
        caption: "The ball seen straight down the PAP. The midline, the VAL and the pin line all run through it, so they look straight from here. Distances are not to scale."
      },
      {
        kind: "terms",
        items: [
          {
            term: "PAP, the positive axis point",
            text: "The spot on the ball that stays still at release, so the ball spins around it. It belongs to you, not the ball. The pro shop measures it once from your track and uses it for every ball after. It's written as a distance over from the grip center and a distance up or down, like 5 and 1/4 over, 3/8 up."
          },
          {
            term: "VAL, the vertical axis line",
            text: "The line through your PAP that crosses the grip midline square, and carries on around the ball. (The midline runs through the grip center, and your PAP distance is measured along it.) Layouts measure the pin against the VAL, because where the pin sits against it shapes the move at the breakpoint."
          },
          {
            term: "Pin",
            text: "The colored dot on the ball, marking the top of the core. How far it sits from your PAP sets how far the ball's axis moves as it rolls."
          },
          {
            term: "PSA, the preferred spin axis",
            text: "The core's strong axis. On an asymmetric ball the mass bias marks it. Symmetric balls have one too, but it's weak enough that most layouts ignore it. It sets how fast the ball loses side roll."
          },
          {
            term: "Track flare",
            text: "The oil rings on a rolled ball. The axis shifts a little every revolution, so each turn puts fresh dry coverstock on the lane and leaves another ring. More flare means more traction in oil. Most balls flare about 6 inches at most, and flare peaks when the pin sits about 3 and 3/8 inches from your PAP."
          },
          {
            term: "Pin up and pin down",
            text: "Where the pin ends up, above or below the finger holes. Pin up delays the roll and keeps a sharper shape on the backend. Pin down starts the roll earlier and smooths it out. The layout numbers give you either one. Neither is a system of its own."
          }
        ]
      }
    ],
    sources: [
      {
        label: "BowlersMart: bowling ball drilling layouts",
        url: "https://www.bowlersmart.com/bowling-tips-coaching-education/bowling-ball-drilling-layouts/"
      }
    ]
  },
  {
    id: "dual-angle-layouts",
    title: "Dual angle layouts",
    summary: "The 45 x 4 1/2 x 35 system, and what each number does.",
    topic: "Layouts",
    minutes: 3,
    body: [
      {
        kind: "text",
        text: "Mo Pinel's dual angle system is the one most pro shops use. A layout is three numbers in a fixed order, like 45 x 4 1/2 x 35."
      },
      {
        kind: "terms",
        items: [
          {
            term: "Drilling angle, in degrees",
            text: "The angle at the PAP between the line to the grip center and the line to the pin. It sets how fast the ball revs up and starts to roll. A smaller angle shifts the core toward your grip, so the ball reads the lane earlier. A larger one holds the skid longer. The usual range is about 20 to 70."
          },
          {
            term: "Pin to PAP distance, in inches",
            text: "How far the pin sits from your PAP. It sets flare, so it sets traction. Anything from 0 to 6 and 3/4 is possible. Flare peaks near 3 and 3/8 and drops toward both ends, so a pin to PAP of 1 or 6 gives a low flare, low traction ball on purpose."
          },
          {
            term: "VAL angle, in degrees",
            text: "The angle at the PAP between the pin to PAP line and the VAL. It shapes the transition at the breakpoint. A smaller angle changes direction sharply. A larger one, up to about 70, raises the drilled RG and lowers the drilled differential, so the ball revs up slower and reads smoother. Roughly 30 to 45 lands pin up, and 65 and above lands pin down."
          }
        ]
      },
      {
        kind: "figure",
        figure: "dual-angles",
        caption: "Both angles are measured at the PAP and share the pin line. The drilling angle opens off the midline toward the grip, the VAL angle off the VAL."
      },
      { kind: "heading", text: "What the two angles add up to" },
      {
        kind: "text",
        text: "Add the drilling angle and the VAL angle. The sum sets how fast the ball goes from skid to hook to roll, and neither number sets it alone. Near 30 is as fast as the system allows. Near 160 is as slow."
      },
      {
        kind: "list",
        items: [
          "Speed dominant bowlers (fast ball speed for their rev rate) want a smaller sum, so the ball gets rolling in time.",
          "Rev dominant bowlers want a larger sum, so the ball doesn't burn its energy before the pins.",
          "Two layouts with the same sum can still differ. Shifting the split trades early rev up against backend shape."
        ]
      },
      { kind: "heading", text: "Reading one off a drill sheet" },
      {
        kind: "text",
        text: "45 x 4 1/2 x 35 is the middle of the road benchmark: a moderate rev up, a pin to PAP near peak flare, and a sum of 80 that puts the transition in the middle. Measure anything you're offered against it."
      },
      {
        kind: "text",
        text: "A 30 x 5 x 30 is quicker and more angular. A 60 x 5 x 65 is much smoother and later."
      }
    ],
    sources: [
      {
        label: "Mo Pinel, dual angle layout technique (PDF)",
        url: "https://www.buddiesproshop.com/content/DualAngle.pdf"
      },
      {
        label: "BowlersMart with MDM Coaching: dual angle layouts explained",
        url: "https://www.bowlersmart.com/2022/01/28/dual-angle-bowling-ball-drilling-layouts-explained-by-mdm-coaching/"
      },
      {
        label: "bowlingball.com: how to lay out a bowling ball",
        url: "https://www.bowlingball.com/BowlVersity/how-to-layout-a-bowling-ball-dual-angle-layout-technique"
      }
    ]
  },
  {
    id: "pin-buffer-layouts",
    title: "Pin buffer layouts, the 6 x 4 x 4 kind",
    summary: "Storm's VLS, three distances in inches instead of two angles.",
    topic: "Layouts",
    minutes: 3,
    body: [
      {
        kind: "text",
        text: "Storm's vector layout system, VLS, writes the same layout in inches instead of degrees: three distances, like 6 x 4 x 4 or 5 x 4 x 3. A shop works it with a tape measure instead of a protractor."
      },
      {
        kind: "terms",
        items: [
          {
            term: "Pin to PAP, the first number",
            text: "The same measurement, doing the same job as in dual angle. It sets flare, so it sets traction. It runs from 0 to 6 and 3/4 inches and peaks near 3 and 3/8."
          },
          {
            term: "PSA to PAP, the second number",
            text: "How far the core's strong axis sits from your PAP. It sets how fast the ball loses side roll. A shorter distance gets it into forward roll sooner, which reads as control. A longer one holds the side roll further down the lane."
          },
          {
            term: "Pin buffer, the third number",
            text: "The distance from the pin to your VAL. It shapes the move at the breakpoint. It runs from 0 up to your pin to PAP distance, so the third number is never bigger than the first."
          }
        ]
      },
      {
        kind: "figure",
        figure: "pin-buffer",
        caption: "The buffer is the square distance from the pin across to the VAL, not the distance along the pin line."
      },
      { kind: "heading", text: "How it lines up with dual angle" },
      {
        kind: "text",
        text: "The two systems describe one layout, so a shop can convert between them. A bigger pin buffer puts the pin further off the VAL. That's a bigger VAL angle, the smoother, slower transition from the dual angle guide. A small buffer is the sharper move."
      },
      {
        kind: "text",
        text: "So 6 x 4 x 4 is a long pin to PAP, well past peak flare, with a big buffer. It makes a low flare, smooth, controllable ball: good for a dry or burnt lane, or for a bowler with plenty of revs who needs the ball to hold a line."
      }
    ],
    sources: [
      {
        label: "Storm: a crash course in the VLS layout system",
        url: "https://www.stormbowling.com/read/drilling-layouts-explained-vls-layout-system"
      },
      {
        label: "Bowling This Month: Storm introduces the vector layout system",
        url: "https://www.bowlingthismonth.com/bowling-tips/storm-introduces-the-vector-layout-system/"
      }
    ]
  },
  {
    id: "picking-a-layout",
    title: "Picking a layout for your game",
    summary: "What to know and what to ask before you buy the next ball.",
    topic: "Equipment",
    minutes: 3,
    body: [
      {
        kind: "text",
        text: "Your release, the ball you're buying and the gap in your bag decide the layout. Know all three before you talk to the pro shop."
      },
      { kind: "heading", text: "Know your numbers" },
      {
        kind: "list",
        items: [
          "PAP. Get it measured rather than guessing. Every layout number is measured from it.",
          "Rev rate and ball speed, and which one wins out. Speed dominant wants a faster transition, rev dominant a slower one.",
          "Axis tilt. A high tilt (a spinner release) gets less out of flare, so a high flare layout does less than its numbers say.",
          "Your usual shot: the pattern you bowl most, at the alley you bowl it at."
        ]
      },
      { kind: "heading", text: "The ball matters more than the layout" },
      {
        kind: "text",
        text: "The coverstock does most of the work. The core and the layout shape the rest. A solid reactive drilled smooth and a pearl drilled sharp do different jobs."
      },
      {
        kind: "text",
        text: "The mistake that costs the most is buying a ball that repeats one you already own, then asking the layout to fix the overlap."
      },
      { kind: "heading", text: "Questions for the pro shop" },
      {
        kind: "list",
        items: [
          "What are the dual angle numbers, even if the shop works in inches?",
          "Where does it sit against my strongest and my weakest ball?",
          "What does it do that my other balls don't?",
          "What surface is it leaving the shop with, and what should I do when it wears down?",
          "If it's too strong, what's the cheapest fix: surface, or a plug and redrill?"
        ]
      }
    ],
    sources: [
      {
        label: "BowlersMart: bowling ball drilling layouts",
        url: "https://www.bowlersmart.com/bowling-tips-coaching-education/bowling-ball-drilling-layouts/"
      }
    ]
  }
];

/** Lookup by id, for the route and the article screen. Undefined for an id
 *  that is not in the list: a stale bookmark opens the list, not an error. */
export function findGuide(id: string | null | undefined): Guide | undefined {
  return id ? GUIDES.find((g) => g.id === id) : undefined;
}

/** The guides, grouped and in `GUIDE_TOPICS` order, skipping empty topics. */
export function guidesByTopic(): Array<{ topic: GuideTopic; guides: Guide[] }> {
  return GUIDE_TOPICS.map((topic) => ({
    topic,
    guides: GUIDES.filter((g) => g.topic === topic)
  })).filter((group) => group.guides.length > 0);
}

/** Where a guide lives inside the app: the guides list with this article on
 *  top, which is what back returns to. Built from the route formatter rather
 *  than written out by hand, so it can only ever name a screen the app can
 *  open. */
export function guideAppPath(guideId: string): string {
  return `/score${formatRoute({ view: "dashboard", overlays: ["guides"], guideId })}`;
}

/**
 * The link a shared guide carries.
 *
 * It points at a small page of the guide's own rather than at the app, because
 * a chat app builds its preview from the page behind the link, ignores the
 * `#`, and runs no script: the app's one URL could only ever preview as "the
 * app". That page (`lib/guidePage`) carries the guide's title, summary and card,
 * then sends the visitor to `guideAppPath`. `origin` comes from the running
 * page, so a link shared from a preview build opens that preview.
 */
export function guideShareUrl(guideId: string, origin: string): string {
  return `${origin}/guides/${encodeURIComponent(guideId)}`;
}
