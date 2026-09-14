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

export type GuideBlock =
  | { kind: "heading"; text: string }
  | { kind: "text"; text: string }
  | { kind: "list"; items: string[] }
  /** A term and what it means, for the words a layout conversation
   *  assumes you already have. */
  | { kind: "terms"; items: Array<{ term: string; text: string }> }
  /** Set apart: a caveat, or the one line to remember off the screen. */
  | { kind: "note"; text: string }
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

export type GuideTopic = "Layouts" | "Equipment";

/** Order the shelves appear in. */
export const GUIDE_TOPICS: readonly GuideTopic[] = ["Layouts", "Equipment"];

export const GUIDES: readonly Guide[] = [
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
        caption: "The ball seen straight down the PAP. A line drawn on a ball curves away from you unless it runs through the point you are looking at, and the midline, the VAL and the pin line all run through the PAP. Distances are not to scale."
      },
      {
        kind: "terms",
        items: [
          {
            term: "PAP, the positive axis point",
            text: "The point on the ball that stays still at the moment of release, so the ball spins around it. It belongs to you rather than to the ball. The pro shop measures it once from your track and uses it on every ball after that. It is written as a distance right or left of the grip center and a distance up or down, for example 5 and 1/4 over, 3/8 up."
          },
          {
            term: "VAL, the vertical axis line",
            text: "The line through your PAP that crosses the grip midline square, and carries on around the ball. The midline is the line drawn through the grip center that your PAP distance is measured along. Layouts measure the pin against the VAL, because where the pin sits against it sets the shape of the ball at the breakpoint."
          },
          {
            term: "Pin",
            text: "The colored dot on the ball. It marks the top of the core, the axis the core is lightest around. How far the pin sits from your PAP sets how far the ball's axis moves as it rolls."
          },
          {
            term: "PSA, the preferred spin axis",
            text: "The core's strong axis. On an asymmetric ball the mass bias marks it. Symmetric balls have one too, but it is weak enough that most layouts ignore it. It sets how fast the ball loses side roll."
          },
          {
            term: "Track flare",
            text: "The oil rings on a rolled ball. The axis moves a little on every revolution, so each rotation puts fresh dry coverstock on the lane and leaves a ring of its own. More flare means more traction in oil. Most balls flare about 6 inches at most, and flare peaks when the pin sits about 3 and 3/8 inches from your PAP."
          },
          {
            term: "Pin up and pin down",
            text: "Where the pin ends up, above or below the finger holes. Pin up delays the roll and keeps the shape sharper at the back. Pin down starts the roll earlier and smooths it out. The numbers below produce both. Neither is a system of its own."
          }
        ]
      },
      {
        kind: "note",
        text: "Layout numbers only mean something next to your PAP, your rev rate and your ball speed. A layout that is strong for one bowler is unusable for another, so copying a layout off a review is a guess."
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
    minutes: 5,
    body: [
      {
        kind: "text",
        text: "Mo Pinel's dual angle technique is the layout system most pro shops use. It writes a layout as three numbers in a fixed order, for example 45 x 4 1/2 x 35."
      },
      {
        kind: "terms",
        items: [
          {
            term: "Drilling angle, in degrees",
            text: "The angle at the PAP between the line to the grip center and the line to the pin. It sets how fast the ball revs up and starts to roll. Smaller angles shift the core toward your grip, so the ball revs up and reads the lane earlier. Larger angles delay that, so the ball keeps its skid longer. The usual working range is about 20 to 70 degrees."
          },
          {
            term: "Pin to PAP distance, in inches",
            text: "How far the pin sits from your PAP. It sets flare, which is traction. Anywhere from 0 to 6 and 3/4 inches is possible. Flare peaks around 3 and 3/8 inches and falls away toward both ends, so a 1 inch or a 6 inch pin to PAP makes a low flare, low traction ball on purpose."
          },
          {
            term: "VAL angle, in degrees",
            text: "The angle at the PAP between the pin to PAP line and the vertical axis line. It sets the shape of the transition at the breakpoint. A smaller VAL angle transitions faster, so the ball changes direction sharply. A larger one, up to about 70 degrees, raises the drilled RG and lowers the drilled differential, so the ball revs up slower and reads smoother. About 30 to 45 degrees lands pin up, and 65 degrees and above lands pin down."
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
        text: "Add the drilling angle and the VAL angle together. That sum sets how fast the ball transitions from skid to hook to roll, and neither number sets it alone. A sum near 30 degrees transitions as fast as the system allows. A sum near 160 degrees transitions as slow as it allows."
      },
      {
        kind: "list",
        items: [
          "Speed dominant bowlers, meaning ball speed that is high for their rev rate, want a smaller sum so the ball gets into a roll in time.",
          "Rev dominant bowlers want a larger sum so the ball does not burn up its energy before the pins.",
          "Two layouts with the same sum can still differ. Moving the split between the two angles trades early rev up against backend shape."
        ]
      },
      { kind: "heading", text: "Reading one off a drill sheet" },
      {
        kind: "text",
        text: "45 x 4 1/2 x 35 is a middle of the road benchmark. The core revs up at a moderate rate, the pin to PAP sits near peak flare, and the sum of 80 degrees puts the transition in the middle. Compare anything you are offered against it. A 30 x 5 x 30 is quicker and more angular. A 60 x 5 x 65 is much smoother and later."
      },
      {
        kind: "note",
        text: "Ask your driller for the dual angle numbers even when the shop works in another system. They convert. Writing them down makes your next ball a decision instead of a fresh guess."
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
    minutes: 4,
    body: [
      {
        kind: "text",
        text: "Storm's vector layout system, VLS, describes the same layout in inches rather than degrees. It writes a layout as three distances, for example 6 x 4 x 4 or 5 x 4 x 3. A shop working this way measures every number on the ball with a tape instead of setting it with a protractor."
      },
      {
        kind: "terms",
        items: [
          {
            term: "Pin to PAP, the first number",
            text: "The same measurement as in dual angle, doing the same job. It sets total flare, so it sets traction. The range runs from 0 to 6 and 3/4 inches, and flare peaks near 3 and 3/8."
          },
          {
            term: "PSA to PAP, the second number",
            text: "How far the core's strong axis sits from your PAP. It sets how fast the ball loses axis rotation, meaning side roll. A shorter distance gets the ball out of side roll and into forward roll sooner, which reads as control. A longer one holds the side roll further down the lane."
          },
          {
            term: "Pin buffer, the third number",
            text: "The distance from the pin to your vertical axis line. It shapes the move at the breakpoint, by setting how the flare passes the grip. It runs from 0 up to the pin to PAP distance you picked, so the third number is never larger than the first."
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
        text: "The two systems describe one layout, so a shop can convert between them. A larger pin buffer puts the pin further off the VAL, which is a larger VAL angle, which is the smoother and slower transition from the dual angle guide. A small buffer makes the sharper move."
      },
      {
        kind: "text",
        text: "So 6 x 4 x 4 is a long pin to PAP, well past peak flare, with a large buffer. That makes a low flare, smooth, controllable ball, for a dry or burnt lane, or for a bowler with plenty of revs who needs the ball to hold a line."
      },
      {
        kind: "note",
        text: "Shops state the buffer's effect in both directions, so ask which one yours means before the drill. The measurement itself is clear. The shorthand for what it does is not."
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
    summary: "What to measure and what to ask before you buy the next ball.",
    topic: "Equipment",
    minutes: 4,
    body: [
      {
        kind: "text",
        text: "Three things decide a layout: your release, the ball you are buying, and the gap in your bag. Take all three to the counter."
      },
      { kind: "heading", text: "Know your own numbers" },
      {
        kind: "list",
        items: [
          "PAP. Have the shop measure it rather than guessing at it. Every number in every layout is measured from it.",
          "Rev rate and ball speed, and which of the two dominates. Speed dominant wants a faster transition, rev dominant wants a slower one.",
          "Axis tilt. High tilt, meaning a spinner release, gets less out of flare, so a strong flare layout buys less than its numbers suggest.",
          "The shot you bowl most weeks, at the alley you bowl it at."
        ]
      },
      { kind: "heading", text: "The ball decides more than the layout" },
      {
        kind: "text",
        text: "Coverstock decides most of ball motion. The core and the layout shape what is left. A solid reactive ball drilled smooth and a pearl drilled sharp do different jobs. The common and expensive mistake is buying a ball that repeats the shape of one already in the bag, then asking the layout to fix the overlap."
      },
      { kind: "heading", text: "Questions worth asking at the counter" },
      {
        kind: "list",
        items: [
          "What are the dual angle numbers, even if you work in inches?",
          "Where does this sit against my strongest and my weakest ball?",
          "What does this ball do that the others do not?",
          "How much surface is it going out of the shop with, and what do I do when it burns in?",
          "If it is too strong, what is the cheapest fix, surface or a plug and redrill?"
        ]
      },
      {
        kind: "note",
        text: "Write the layout and the surface down the day you get the ball, in the arsenal, beside what you paid. You make the next decision from the last three, and nobody remembers a drill sheet a year later."
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
