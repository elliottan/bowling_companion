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
    title: "The pocket, a Brooklyn and other strike words",
    summary: "Where the ball should hit, and what bowlers call it when it doesn't.",
    topic: "Bowling terms",
    minutes: 2,
    body: [
      {
        kind: "text",
        text: "Most of what gets said after a first ball is about where it hit the pins. These are the words you'll hear from the bench behind you."
      },
      {
        kind: "terms",
        items: [
          {
            term: "Pocket",
            text: "The spot that gives the best chance of a strike. For a right-hander it's between the 1 and 3 pins, and for a left-hander between the 1 and 2.",
            aliases: ["Strike pocket"]
          },
          {
            term: "Flush",
            text: "A solid pocket hit that sends all ten pins into the pit. The strike everyone is trying to throw."
          },
          {
            term: "High and light",
            text: "High is a ball that hits too much of the headpin, inside the pocket. Light, or low, is one that catches too little of it. Each leaves its own kind of spare."
          },
          {
            term: "Brooklyn",
            text: "A ball that crosses over the headpin and hits the pocket on the other side: the 1 and 2 for a right-hander, the 1 and 3 for a left-hander. Around New York it's also a Jersey, and around Detroit a Windsor.",
            aliases: ["Jersey", "Jersey side", "Windsor", "Crossover"]
          },
          {
            term: "Carry",
            text: "How well a hit knocks the pins down, by the ball itself and by pins hitting other pins. A ball that carries well turns near misses into strikes."
          },
          {
            term: "Messenger",
            text: "A pin, usually the headpin, that flies across the deck and takes out a pin on the far side. Also called a bird dog.",
            aliases: ["Bird dog"]
          },
          {
            term: "Ringing 10",
            text: "On a good-looking pocket hit, the 6 pin flies around the 10 to the outside and leaves it standing."
          },
          {
            term: "Tap",
            text: "A good hit that leaves one pin standing, most often one in the back row."
          },
          {
            term: "Corner pins",
            text: "The 7 and the 10, at the back corners of the rack. The single pins a bowler leaves most."
          }
        ]
      }
    ],
    sources: [GLOSSARY_SOURCE]
  },
  {
    id: "leave-words",
    title: "Splits, buckets and the leaves with names",
    summary: "The spares bowlers name, so you know what a teammate means.",
    topic: "Bowling terms",
    minutes: 2,
    body: [
      {
        kind: "text",
        text: "A leave is whatever's standing after the first ball. The common ones have names, and the names say how hard the spare is."
      },
      {
        kind: "terms",
        items: [
          {
            term: "Split",
            text: "A leave with the headpin down and at least two pins standing that aren't next to each other, with a gap between them."
          },
          {
            term: "Baby split",
            text: "A split close enough that the ball can hit both pins, like the 3-10 or the 2-7."
          },
          {
            term: "7-10 split",
            text: "Both corner pins, as far apart as two pins can be. The hardest spare in the game, and made only now and then."
          },
          {
            term: "Big four",
            text: "The 4, 6, 7 and 10: two pins standing in each back corner."
          },
          {
            term: "Greek church",
            text: "Five pins in two groups, the 4-6-7-9-10 or the 4-6-7-8-10."
          },
          {
            term: "Washout",
            text: "Looks like a split, but the headpin is still standing, like the 1-2-10. It's a spare you can make by hitting the headpin into the rest."
          },
          {
            term: "Bucket",
            text: "A diamond of four, the 2-4-5-8 or the 3-5-6-9."
          },
          {
            term: "Sleeper",
            text: "A pin hidden directly behind another, so it's easy to miss from the approach."
          },
          {
            term: "Double wood",
            text: "Two pins, one straight behind the other: the 2-8, the 3-9 or the 1-5. The back one is a sleeper."
          }
        ]
      },
      {
        kind: "text",
        text: "Headpin keeps the spare lines you shoot for each leave under Spare lines, so the next time it comes up, the boards are already filled in."
      }
    ],
    sources: [GLOSSARY_SOURCE]
  },
  {
    id: "scoring-words",
    title: "Turkeys, marks and scoring words",
    summary: "What a double, a turkey, a clean game and a Dutch 200 are.",
    topic: "Bowling terms",
    minutes: 2,
    body: [
      {
        kind: "terms",
        items: [
          {
            term: "Strike",
            text: "All ten pins down on the first ball of a frame. Written X."
          },
          {
            term: "Spare",
            text: "The pins left after the first ball all knocked down with the second. Written /."
          },
          {
            term: "Open frame",
            text: "A frame with neither a strike nor a spare.",
            aliases: ["Open"]
          },
          {
            term: "Mark",
            text: "A strike or a spare. A game with more marks is a higher game, so a bowler counting marks is counting how few frames went open."
          },
          {
            term: "Double, turkey and hambone",
            text: "Strikes in a row in one game: two is a double and three is a turkey. Four is usually called a hambone, though it once meant two.",
            aliases: ["Double", "Turkey", "Hambone"]
          },
          {
            term: "Bagger",
            text: "A run of strikes named by its length, like a five-bagger or a six-bagger. Six in a row is also a six-pack.",
            aliases: ["Five-bagger", "Six-bagger", "Six-pack"]
          },
          {
            term: "Clean game",
            text: "A mark in every one of the ten frames, so no open frame at all."
          },
          {
            term: "Perfect game",
            text: "Twelve strikes in a row, for a 300.",
            aliases: ["300"]
          },
          {
            term: "Dutch 200",
            text: "A game of strikes and spares in turn, frame after frame. It always scores exactly 200."
          },
          {
            term: "Fill ball",
            text: "The extra ball in the tenth frame after a spare, or the two after a strike, thrown only to count toward that frame."
          },
          {
            term: "Foul",
            text: "Any part of the body crossing the foul line during the delivery. The ball still knocks pins down, but it scores zero. Written F."
          }
        ]
      },
      {
        kind: "text",
        text: "Headpin scores all of this for you as you tap in the pins, and a foul is under More on the scorer."
      }
    ],
    sources: [GLOSSARY_SOURCE]
  },
  {
    id: "lane-words",
    title: "Heads, backends and lane words",
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
            text: "The floor you walk up on before the foul line. It's also the name for the steps of your delivery up to the release."
          },
          {
            term: "Boards",
            text: "The 39 strips that make up a lane's width. They're counted from your throwing side's gutter, so board 1 is the right edge for a right-hander."
          },
          {
            term: "Arrows",
            text: "The seven arrowheads about 15 feet past the foul line, on every fifth board. Most bowlers aim at them rather than at the pins.",
            aliases: ["Targets"]
          },
          {
            term: "Spots",
            text: "The row of dots about six feet past the foul line, for lining up closer in than the arrows.",
            aliases: ["Dots"]
          },
          {
            term: "Heads, mids and backend",
            text: "The lane in three parts. The heads run from the foul line to about the arrows, the mids are the middle stretch, and the backend is roughly the last third, which has little or no oil. The backend is where the ball hooks.",
            aliases: ["Heads", "Mids", "Backend", "Back end"]
          },
          {
            term: "Breakpoint",
            text: "Where the ball stops sliding and turns hardest toward the pins, at its furthest point out. It's usually a few feet past the end of the oil."
          }
        ]
      },
      { kind: "heading", text: "The oil" },
      {
        kind: "terms",
        items: [
          {
            term: "Oil pattern",
            text: "How the oil is laid on the lane: how far it goes, how much there is and where across the boards. It shapes every shot, which is why Headpin keeps one on each session."
          },
          {
            term: "House shot",
            text: "The pattern most alleys run for leagues and open bowling. It holds more oil in the middle than on the outside, which steers a slightly missed ball back toward the pocket."
          },
          {
            term: "Sport shot",
            text: "A flatter, harder pattern, used in tournaments and on the pro tours, that gives a missed shot far less help."
          },
          {
            term: "Burn and breakdown",
            text: "Every ball takes a little oil off the path it rolls. Down a busy part of the lane the oil wears thin, and balls there grip and hook sooner.",
            aliases: ["Burn", "Breakdown"]
          },
          {
            term: "Carry-down",
            text: "Oil that balls pick up and carry onto the dry backend, so later balls skid further before they hook."
          },
          {
            term: "Transition",
            text: "How a lane changes over a session, from burn, breakdown and carry-down together. Moving to stay in the pocket as it changes is most of reading a lane."
          }
        ]
      }
    ],
    sources: [GLOSSARY_SOURCE]
  },
  {
    id: "bowler-words",
    title: "Crankers, strokers and ball words",
    summary: "Styles of bowler, how a ball spins, and what it's made of.",
    topic: "Bowling terms",
    minutes: 3,
    body: [
      { kind: "heading", text: "Kinds of bowler" },
      {
        kind: "terms",
        items: [
          {
            term: "Cranker",
            text: "A bowler with a high rev rate who throws a big hook, trading some control and repeatability for power."
          },
          {
            term: "Stroker",
            text: "A bowler who keeps the ball smoother and straighter, trading power for control and accuracy they can repeat."
          },
          {
            term: "Tweener",
            text: "Somewhere between the two, the style of most league bowlers."
          }
        ]
      },
      { kind: "heading", text: "How the ball turns" },
      {
        kind: "terms",
        items: [
          {
            term: "Rev rate",
            text: "How fast the ball spins, in revolutions per minute. More revs means more hook, and only makes sense next to your ball speed.",
            aliases: ["Revs", "RPM"]
          },
          {
            term: "Axis rotation",
            text: "How far the ball's spin axis is turned sideways, like a wheel turning to steer. It's the main thing that makes a ball hook."
          },
          {
            term: "Axis tilt",
            text: "How far the spin axis leans up from flat. A high tilt, like a spinner's, makes the ball skid further before it hooks."
          }
        ]
      },
      { kind: "heading", text: "The ball itself" },
      {
        kind: "terms",
        items: [
          {
            term: "Coverstock",
            text: "The outer shell, which decides how much the ball grips the lane. Plastic (polyester) grips least and makes a good spare ball. Urethane grips more and hooks smoothly. Reactive resin grips most and hooks hardest.",
            aliases: ["Cover", "Plastic", "Urethane", "Reactive", "Reactive resin", "Polyester"]
          },
          {
            term: "Grit",
            text: "How rough the abrasive was that the surface was sanded with. A lower number is rougher, grabs the lane sooner and hooks earlier.",
            aliases: ["Surface", "Abralon"]
          },
          {
            term: "Asymmetric core",
            text: "A core that isn't the same all the way round, so it has a strong side, the PSA, that a layout has to place. A symmetric core has one too, weak enough that most layouts ignore it.",
            aliases: ["Asymmetric", "Symmetric core", "Symmetric"]
          },
          {
            term: "Conventional and fingertip grip",
            text: "Conventional puts your fingers in to the second knuckle, as on most balls at an alley's rack. Fingertip stops at the first knuckle, which lets the ball come off the fingers later and spin more.",
            aliases: ["Conventional grip", "Fingertip grip", "Fingertip"]
          }
        ]
      },
      {
        kind: "text",
        text: "For the words on a drill sheet, PAP, pin and VAL, the layout vocabulary guide picks up from here."
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
