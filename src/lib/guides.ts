/**
 * The guide list: how to use the app, then layout and equipment articles that
 * do not change between sessions, kept in the app because the alley is where
 * they get read and the app is offline there.
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
import { FREE_APP_PATH } from "./pro";

export type GuideBlock =
  | { kind: "heading"; text: string }
  | { kind: "text"; text: string }
  | { kind: "list"; items: string[] }
  /** A term and what it means, for the words a layout conversation
   *  assumes you already have. */
  | { kind: "terms"; items: Array<{ term: string; text: string; aliases?: string[] }> }
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

export type GuideTopic = "Getting started" | "Bowling terms" | "Layouts" | "Equipment";

/** Order the shelves appear in. The words come before the layouts, since the
 *  layout articles assume them. */
export const GUIDE_TOPICS: readonly GuideTopic[] = ["Getting started", "Bowling terms", "Layouts", "Equipment"];

/** What the search offers before anything is typed, after the bowler's own
 *  pattern and alley: words a bowler hears in the first week of a league,
 *  each one defined below. English, as the guides are (docs/I18N.md). */
export const SUGGESTED_TERMS: readonly string[] = ["Pocket", "Brooklyn", "Carry-down", "Turkey", "Rev rate"];

const GLOSSARY_SOURCE: GuideSource = {
  label: "Wikipedia: glossary of bowling",
  url: "https://en.wikipedia.org/wiki/Glossary_of_bowling"
};

export const GUIDES: readonly Guide[] = [
  {
    id: "start-here",
    title: "Start here",
    summary: "Scoring a game, the boards you can note, and keeping your scores safe.",
    topic: "Getting started",
    minutes: 3,
    body: [
      {
        kind: "text",
        text: "Headpin keeps your score, and if you want, the ball and line behind every shot. Only the score is needed. Everything else can be added later, or never."
      },
      { kind: "heading", text: "Scoring a shot" },
      {
        kind: "list",
        items: [
          "On the first ball every pin starts down. Tap the pins still standing after your shot, then tap Next. Strike records a strike in one tap.",
          "On the second ball the pins you left are up. Tap the ones you knocked down, or tap Spare if you got them all.",
          "Under Next, in brackets, is what it's about to record, so you can check before you tap.",
          "Drag across several pins to set them all in one stroke.",
          "Foul and Undo last shot are under More."
        ]
      },
      { kind: "heading", text: "Games and sessions" },
      {
        kind: "text",
        text: "A session is one trip to the alley, and it holds every game you bowl there. The + beside the game tabs starts the next game. The pencil at the top adds the alley, the oil pattern and notes, any time."
      },
      { kind: "heading", text: "Boards, if you track them" },
      {
        kind: "text",
        text: "A lane is 39 boards wide, counted from the gutter on your throwing side. Board 1 is the right edge for a right-hander and the left edge for a left-hander. The arrows sit on every fifth board."
      },
      {
        kind: "terms",
        items: [
          {
            term: "Stance",
            text: "The board you line up on before your approach, read from the dots on the approach."
          },
          {
            term: "Target",
            text: "The board you roll the ball over at the arrows."
          },
          {
            term: "Slide",
            text: "The board your slide foot finishes on at the foul line."
          },
          {
            term: "Intended and actual",
            text: "Intended is the shot you meant to throw, and actual is where it went. Noting both is how a miss shows up in your numbers."
          }
        ]
      },
      {
        kind: "text",
        text: "The ball you pick stays picked for the shots after it, so you only change it when you change balls."
      },
      { kind: "heading", text: "Spare lines and lane notes" },
      {
        kind: "text",
        text: "Shoot a spare with a line entered, and Headpin offers to save it as your line for that leave. The next time you leave it, the line is filled in for you. Lane notes hold how a lane plays at an alley, for the next time you're on it."
      },
      { kind: "heading", text: "Keep your scores safe" },
      {
        kind: "text",
        text: "Your games live on this phone and nowhere else. Add Headpin to your home screen so the browser doesn't clear it, and save a copy now and then from Settings, under Backup & restore."
      }
    ]
  },
  {
    id: "strike-words",
    title: "The pocket and strike words",
    summary: "Where the ball should hit, and the pins a good hit can still leave.",
    topic: "Bowling terms",
    minutes: 2,
    body: [
      {
        kind: "terms",
        items: [
          {
            term: "Pocket",
            text: "Where the ball has the best chance of a strike. For a right-hander it's between the 1 and 3 pins. For a left-hander it's between the 1 and 2.",
            aliases: ["Strike pocket"]
          },
          {
            term: "Flush",
            text: "A pocket hit that knocks all ten pins into the pit."
          },
          {
            term: "High hit",
            text: "The ball catches too much of the headpin.",
            aliases: ["High"]
          },
          {
            term: "Light hit",
            text: "The ball catches too little of the headpin. Some bowlers call it low.",
            aliases: ["Light", "Low"]
          },
          {
            term: "Brooklyn",
            text: "A ball that crosses to the other side of the headpin. A right-hander's Brooklyn hits the 1 and 2, and a left-hander's hits the 1 and 3.",
            aliases: ["Crossover"]
          },
          {
            term: "Carry",
            text: "How many pins a hit takes down, with the ball and with pins knocking into other pins."
          },
          {
            term: "Messenger",
            text: "A pin that slides across the deck and knocks down a pin on the far side. It's often the headpin.",
            aliases: ["Bird dog"]
          },
          {
            term: "Tap",
            text: "A hit that looked good and left one pin."
          }
        ]
      },
      { kind: "heading", text: "Corner pins" },
      {
        kind: "terms",
        items: [
          {
            term: "Corner pins",
            text: "The 7 and the 10, at the back corners of the rack. The 10 is a right-hander's, and the 7 is a left-hander's."
          },
          {
            term: "Ringing 10",
            text: "For a right-hander, the 6 pin flies around the 10 and leaves it standing. Some call it a solid 10 or a wrap 10. A left-hander's is the ringing 7, where the 4 pin goes around the 7.",
            aliases: ["Ringing 7", "Solid 10", "Wrap 10", "Solid 7", "Pocket 10"]
          },
          {
            term: "Flat 10",
            text: "For a right-hander, the 6 pin drops into the gutter in front of the 10 and never touches it. A left-hander's is the flat 7, with the 4 pin lying in front of the 7.",
            aliases: ["Flat 7", "Weak 10"]
          }
        ]
      },
      {
        kind: "text",
        text: "A ringing 10 often comes from a ball that reaches the pocket at too steep an angle, or one still skidding when it gets there. A flat 10 usually means the ball ran out of energy before the pins and deflected. For a left-hander, read the 4 and 7 for the 6 and 10."
      }
    ],
    sources: [
      GLOSSARY_SOURCE,
      {
        label: "Storm: why the 10 pin haunts bowlers",
        url: "https://www.stormbowling.com/read/demystifying-the-mystery-why-the-10-pin-haunts-bowlers"
      },
      {
        label: "Bowling This Month: kicking out the corners",
        url: "https://www.bowlingthismonth.com/bowling-tips/kicking-out-the-corners-part-1"
      }
    ]
  },
  {
    id: "leave-words",
    title: "Spare and split names",
    summary: "The leaves that have names, and which pins each one is.",
    topic: "Bowling terms",
    minutes: 2,
    body: [
      {
        kind: "terms",
        items: [
          {
            term: "Leave",
            text: "The pins still standing after your first ball."
          },
          {
            term: "Split",
            text: "The headpin is down, and the pins left standing aren't next to each other."
          },
          {
            term: "Baby split",
            text: "A split with the pins close enough to hit both with the ball, like the 3-10 or the 2-7."
          },
          {
            term: "7-10 split",
            text: "Both corner pins. It's one of the hardest spares to make."
          },
          {
            term: "Big four",
            text: "The 4, 6, 7 and 10."
          },
          {
            term: "Greek church",
            text: "The 4-6-7-9-10 or the 4-6-7-8-10."
          },
          {
            term: "Washout",
            text: "It looks like a split, but the headpin is still up, as in the 1-2-10."
          },
          {
            term: "Bucket",
            text: "The 2-4-5-8 or the 3-5-6-9."
          },
          {
            term: "Sleeper",
            text: "A pin hidden straight behind another one, so it's hard to see from the approach."
          },
          {
            term: "Double wood",
            text: "Two pins in a line, one behind the other. The 2-8, 3-9 and 1-5 are the usual ones."
          }
        ]
      }
    ],
    sources: [GLOSSARY_SOURCE]
  },
  {
    id: "scoring-words",
    title: "Scoring words",
    summary: "What a mark, a turkey or a Dutch 200 means on a scoresheet.",
    topic: "Bowling terms",
    minutes: 2,
    body: [
      {
        kind: "terms",
        items: [
          {
            term: "Strike",
            text: "All ten pins down with the first ball of a frame. It's written X."
          },
          {
            term: "Spare",
            text: "Every pin left after the first ball knocked down with the second. It's written /."
          },
          {
            term: "Open frame",
            text: "A frame with no strike and no spare.",
            aliases: ["Open"]
          },
          {
            term: "Mark",
            text: "A strike or a spare."
          },
          {
            term: "Double",
            text: "Two strikes in a row."
          },
          {
            term: "Turkey",
            text: "Three strikes in a row."
          },
          {
            term: "Hambone",
            text: "Four strikes in a row."
          },
          {
            term: "Bagger",
            text: "A run of strikes named by how long it is, like a five-bagger or a six-bagger.",
            aliases: ["Five-bagger", "Six-bagger", "Six-pack"]
          },
          {
            term: "Clean game",
            text: "A game with a mark in every frame."
          },
          {
            term: "Perfect game",
            text: "Twelve strikes in a row, for a score of 300.",
            aliases: ["300"]
          },
          {
            term: "Dutch 200",
            text: "Strikes and spares in turn for the whole game. It always scores exactly 200."
          },
          {
            term: "Fill ball",
            text: "The extra ball in the tenth frame after a spare. A strike in the tenth gets two."
          },
          {
            term: "Foul",
            text: "Crossing the foul line as you deliver the ball. The ball scores zero, and it's written F."
          }
        ]
      }
    ],
    sources: [GLOSSARY_SOURCE]
  },
  {
    id: "lane-words",
    title: "Lane and oil words",
    summary: "The parts of a lane, and how the oil on it changes as you bowl.",
    topic: "Bowling terms",
    minutes: 3,
    body: [
      { kind: "heading", text: "The lane" },
      {
        kind: "terms",
        items: [
          {
            term: "Approach",
            text: "The floor you walk on up to the foul line."
          },
          {
            term: "Foul line",
            text: "The line where the approach ends and the lane begins."
          },
          {
            term: "Boards",
            text: "A lane is 39 boards wide. They're counted from your throwing side, so board 1 is the right edge for a right-hander and the left edge for a left-hander."
          },
          {
            term: "Arrows",
            text: "Seven arrows about 15 feet past the foul line, one on every fifth board. Most bowlers aim at them.",
            aliases: ["Targets"]
          },
          {
            term: "Spots",
            text: "A row of dots about 6 feet past the foul line.",
            aliases: ["Dots"]
          },
          {
            term: "Heads",
            text: "The front of the lane, from the foul line to about the arrows."
          },
          {
            term: "Mids",
            text: "The middle of the lane, between the heads and the backend."
          },
          {
            term: "Backend",
            text: "About the last third of the lane. There's little or no oil on it, so it's where the ball hooks.",
            aliases: ["Back end"]
          },
          {
            term: "Breakpoint",
            text: "Where the ball turns hardest toward the pins. It's usually a few feet past the end of the oil."
          }
        ]
      },
      { kind: "heading", text: "The oil" },
      {
        kind: "terms",
        items: [
          {
            term: "Oil pattern",
            text: "How the oil is laid on the lane: how far down it goes, and how much is on each board."
          },
          {
            term: "House shot",
            text: "The pattern most alleys put down for leagues and open bowling. It has more oil in the middle than on the outside, so a ball that misses a little gets steered back toward the pocket."
          },
          {
            term: "Sport shot",
            text: "A flatter pattern used in tournaments. A missed shot gets much less help on it."
          },
          {
            term: "Breakdown",
            text: "Each ball wipes a little oil off the path it rolls on. Where lots of balls go, the lane dries out and balls hook sooner.",
            aliases: ["Burn"]
          },
          {
            term: "Carry-down",
            text: "Oil that balls drag onto the dry backend. Later balls skid further before they hook."
          },
          {
            term: "Transition",
            text: "How the lane changes over a session as the oil breaks down and carries down."
          }
        ]
      }
    ],
    sources: [GLOSSARY_SOURCE]
  },
  {
    id: "bowler-words",
    title: "Bowler and ball words",
    summary: "Styles of bowler, and the words for how a ball spins.",
    topic: "Bowling terms",
    minutes: 2,
    body: [
      { kind: "heading", text: "Styles" },
      {
        kind: "terms",
        items: [
          {
            term: "Cranker",
            text: "A bowler with a high rev rate who goes for power over control."
          },
          {
            term: "Stroker",
            text: "A bowler with a smoother, straighter ball who goes for accuracy over power."
          },
          {
            term: "Tweener",
            text: "Somewhere between a stroker and a cranker."
          }
        ]
      },
      { kind: "heading", text: "Spin" },
      {
        kind: "terms",
        items: [
          {
            term: "Rev rate",
            text: "How fast the ball spins, in revolutions per minute.",
            aliases: ["Revs", "RPM"]
          },
          {
            term: "Axis rotation",
            text: "How far the ball's spin axis is turned sideways. More rotation means more hook."
          },
          {
            term: "Axis tilt",
            text: "How far the spin axis leans up from flat. A ball with a lot of tilt skids further before it hooks."
          }
        ]
      },
      { kind: "heading", text: "The ball" },
      {
        kind: "terms",
        items: [
          {
            term: "Coverstock",
            text: "The ball's outer shell, which decides how much it grips the lane. Reactive resin grips the most and plastic the least, which is why plastic is the usual spare ball. Urethane sits between them.",
            aliases: ["Cover", "Plastic", "Urethane", "Reactive", "Reactive resin", "Polyester"]
          },
          {
            term: "Grit",
            text: "How rough the abrasive was that finished the ball's surface. A lower number is rougher and grips the lane sooner.",
            aliases: ["Surface", "Abralon"]
          },
          {
            term: "Asymmetric core",
            text: "A core with a strong side, the PSA, that a layout has to place. A symmetric core has one too, but it's weak enough that most layouts ignore it.",
            aliases: ["Asymmetric", "Symmetric core", "Symmetric"]
          },
          {
            term: "Conventional grip",
            text: "Fingers in to the second knuckle. Most house balls are drilled this way.",
            aliases: ["Conventional"]
          },
          {
            term: "Fingertip grip",
            text: "Fingers in to the first knuckle only. The ball leaves your fingers later, which lets you put more spin on it.",
            aliases: ["Fingertip"]
          }
        ]
      }
    ],
    sources: [GLOSSARY_SOURCE]
  },
  {
    id: "layout-vocabulary",
    title: "Layout vocabulary",
    summary: "PAP, VAL, pin, PSA and flare, before the numbers make sense.",
    topic: "Layouts",
    minutes: 3,
    body: [
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
            text: "How far the pin sits from your PAP. It sets flare, and flare sets traction. It can be anything from 0 to 6 and 3/4. Flare is highest near 3 and 3/8, so a pin to PAP of 1 or 6 is a low flare ball on purpose."
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
  return `${FREE_APP_PATH}${formatRoute({ view: "dashboard", overlays: ["guides"], guideId })}`;
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
 * The store app passes headpin.app instead (`shareOrigin`, ADR-155).
 */
export function guideShareUrl(guideId: string, origin: string): string {
  return `${origin}/guides/${encodeURIComponent(guideId)}`;
}
