import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHARED,
  LAYOUT_LAB_HASH,
  decodeLayoutParams,
  encodeLayoutParams,
  layoutSeedFromBall,
  layoutShareUrl
} from "./layoutShare";
import { DEFAULT_ASYMMETRIC, DEFAULT_PAP, DEFAULT_SYMMETRIC } from "./ballLayout";
import type { SharedLayout } from "./layoutShare";

const A_LAYOUT: SharedLayout = {
  layout: { drillingAngle: 70, pinToPap: 5.25, valAngle: 30 },
  ball: { ...DEFAULT_ASYMMETRIC, pinToCore: 6 },
  pap: { over: 4.75, up: -0.5 },
  hand: "left",
  grip: "2h"
};

describe("encode and decode", () => {
  it("round-trips a whole shared layout", () => {
    const back = decodeLayoutParams(encodeLayoutParams(A_LAYOUT));
    expect(back).not.toBeNull();
    expect(back?.layout).toEqual(A_LAYOUT.layout);
    expect(back?.pap).toEqual(A_LAYOUT.pap);
    expect(back?.hand).toBe("left");
    expect(back?.grip).toBe("2h");
    expect(back?.ball.symmetric).toBe(false);
    expect(back?.ball.pinToCore).toBe(6);
  });

  it("round-trips a symmetric ball as symmetric", () => {
    const sym: SharedLayout = { ...A_LAYOUT, ball: DEFAULT_SYMMETRIC };
    const back = decodeLayoutParams(encodeLayoutParams(sym));
    expect(back?.ball.symmetric).toBe(true);
    expect(back?.ball.diff).toBe(DEFAULT_SYMMETRIC.diff);
  });

  it("keeps a PAP below the midline below it", () => {
    // The sign is the whole point of this field and the easiest thing for a
    // URL round trip to lose.
    expect(decodeLayoutParams(encodeLayoutParams(A_LAYOUT))?.pap.up).toBe(-0.5);
  });

  it("writes short numbers, so the link survives being pasted into a chat", () => {
    const params = encodeLayoutParams(DEFAULT_SHARED);
    expect(params).toContain("ptp=4.5");
    expect(params).not.toContain("4.500");
  });
});

describe("decoding a link somebody else made", () => {
  it("returns null when the query says nothing about a layout", () => {
    expect(decodeLayoutParams("")).toBeNull();
    expect(decodeLayoutParams("?utm_source=x&fbclid=y")).toBeNull();
  });

  it("takes the query with or without its leading question mark", () => {
    expect(decodeLayoutParams("?da=20")?.layout.drillingAngle).toBe(20);
    expect(decodeLayoutParams("da=20")?.layout.drillingAngle).toBe(20);
  });

  it("fills anything missing from the defaults rather than failing", () => {
    const partial = decodeLayoutParams("?val=30");
    expect(partial?.layout.valAngle).toBe(30);
    expect(partial?.layout.drillingAngle).toBe(DEFAULT_SHARED.layout.drillingAngle);
    expect(partial?.pap).toEqual(DEFAULT_PAP);
    expect(partial?.hand).toBe("right");
  });

  it("opens a bowling ball on a hand-edited link rather than breaking", () => {
    const junk = decodeLayoutParams("?da=banana&ptp=&val=NaN&over=%20&up=zzz&hand=sideways");
    expect(junk?.layout).toEqual(DEFAULT_SHARED.layout);
    expect(junk?.pap).toEqual(DEFAULT_PAP);
    // An unreadable hand is a right-hander, because one of the two has to be
    // the answer and most bowlers are.
    expect(junk?.hand).toBe("right");
  });

  it("clamps a number that is outside anything drillable", () => {
    const wild = decodeLayoutParams("?da=999&val=-40&ptp=99&over=40&up=-40");
    expect(wild?.layout.drillingAngle).toBe(90);
    expect(wild?.layout.valAngle).toBe(0);
    expect(wild?.pap.over).toBe(6.5);
    expect(wild?.pap.up).toBe(-3);
  });
});

describe("the shareable URL", () => {
  it("carries the layout in the search and the screen in the hash", () => {
    const url = layoutShareUrl(DEFAULT_SHARED, "https://headpin.app", "/score");
    expect(url.startsWith("https://headpin.app/score?")).toBe(true);
    expect(url.endsWith(LAYOUT_LAB_HASH)).toBe(true);
    // The hash stays a pure navigation route: appRoute is a projection of
    // navigation state, and a drilling angle is not navigation.
    expect(url.slice(url.indexOf("#"))).toBe("#/home/layout-lab");
  });

  it("opens wherever it was shared from, not a hardcoded host", () => {
    // A link shared out of a preview build must open that preview.
    expect(layoutShareUrl(DEFAULT_SHARED, "https://preview.example", "/score")).toContain(
      "https://preview.example/score?"
    );
  });

  it("round-trips through its own search string", () => {
    const url = layoutShareUrl(A_LAYOUT, "https://headpin.app", "/score");
    const search = url.slice(url.indexOf("?"), url.indexOf("#"));
    expect(decodeLayoutParams(search)?.layout).toEqual(A_LAYOUT.layout);
  });
});

describe("grip style", () => {
  it("rides the link, because a layout belongs to a bowler and not just a hand", () => {
    expect(encodeLayoutParams(A_LAYOUT)).toContain("grip=2h");
  });

  it("opens one-handed on a link that says nothing about the grip", () => {
    // Every link shared before the toggle existed is such a link, and the
    // common grip is the right thing to open them on.
    const older = decodeLayoutParams("?da=45&ptp=4.5&val=45&hand=right");
    expect(older?.grip).toBe("1h");
  });

  it("reads an unrecognised grip as one-handed rather than failing", () => {
    expect(decodeLayoutParams("?da=45&grip=three-handed")?.grip).toBe("1h");
  });

  it("is enough on its own to make a query a shared layout", () => {
    expect(decodeLayoutParams("?grip=2h")).not.toBeNull();
    expect(decodeLayoutParams("?utm_source=chat")).toBeNull();
  });
});

describe("a ball's own layout, handed to the lab", () => {
  const bowler = { pap: { over: 4.75, up: -0.5 }, hand: "left" as const, grip: "2h" as const };

  it("reads the ball's numbers against the bowler's own axis", () => {
    const seed = layoutSeedFromBall(
      {
        name: "Phaze II",
        layout_spec: {
          drillingAngle: 50,
          pinToPap: 4.5,
          valAngle: 40,
          symmetric: false,
          pinToCore: 6.75
        }
      },
      bowler,
      "dual"
    );
    expect(seed?.layout).toEqual({ drillingAngle: 50, pinToPap: 4.5, valAngle: 40 });
    expect(seed?.ball.pinToCore).toBe(6.75);
    expect(seed?.pap).toEqual(bowler.pap);
    expect(seed?.hand).toBe("left");
    expect(seed?.grip).toBe("2h");
    expect(seed?.ballName).toBe("Phaze II");
  });

  it("opens in the ball's own notation where it has one, else the app's", () => {
    const spec = {
      drillingAngle: 50,
      pinToPap: 4.5,
      valAngle: 40,
      symmetric: false,
      pinToCore: 6.75
    };
    expect(layoutSeedFromBall({ name: "A", layout_spec: spec }, bowler, "vls")?.system).toBe("vls");
    expect(
      layoutSeedFromBall({ name: "A", layout_spec: { ...spec, system: "dual" } }, bowler, "vls")
        ?.system
    ).toBe("dual");
  });

  it("has nothing to show for a ball with no layout", () => {
    expect(layoutSeedFromBall({ name: "A" }, bowler, "dual")).toBeNull();
  });
});
