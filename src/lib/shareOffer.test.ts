import { describe, expect, it } from "vitest";
import {
  EMPTY_SHARE_OFFER,
  answerShareOffer,
  parseShareOffer,
  shouldOfferShare
} from "./shareOffer";

describe("the share offer", () => {
  it("is made only for a game finished on screen", () => {
    expect(shouldOfferShare(EMPTY_SHARE_OFFER, 1, true)).toBe(true);
    expect(shouldOfferShare(EMPTY_SHARE_OFFER, 1, false)).toBe(false);
  });

  it("is made once per session, whether shared or dismissed", () => {
    const shared = answerShareOffer(EMPTY_SHARE_OFFER, 1, "share");
    expect(shouldOfferShare(shared, 1, true)).toBe(false);
    expect(shouldOfferShare(shared, 2, true)).toBe(true);

    const dismissed = answerShareOffer(EMPTY_SHARE_OFFER, 1, "dismiss");
    expect(shouldOfferShare(dismissed, 1, true)).toBe(false);
  });

  it("stops for good after three dismissals in a row", () => {
    let state = EMPTY_SHARE_OFFER;
    for (const id of [1, 2, 3]) state = answerShareOffer(state, id, "dismiss");
    expect(shouldOfferShare(state, 4, true)).toBe(false);
  });

  it("counts the streak again from a share", () => {
    let state = EMPTY_SHARE_OFFER;
    state = answerShareOffer(state, 1, "dismiss");
    state = answerShareOffer(state, 2, "dismiss");
    state = answerShareOffer(state, 3, "share");
    state = answerShareOffer(state, 4, "dismiss");
    expect(shouldOfferShare(state, 5, true)).toBe(true);
  });

  it("forgets old sessions rather than growing without end", () => {
    let state = EMPTY_SHARE_OFFER;
    for (let id = 1; id <= 60; id++) state = answerShareOffer(state, id, "share");
    expect(state.answered).toHaveLength(50);
    expect(state.answered[0]).toBe(11);
  });

  it("survives a round trip and junk in storage", () => {
    const state = answerShareOffer(EMPTY_SHARE_OFFER, 7, "dismiss");
    expect(parseShareOffer(JSON.stringify(state))).toEqual(state);
    expect(parseShareOffer(undefined)).toEqual(EMPTY_SHARE_OFFER);
    expect(parseShareOffer("{not json")).toEqual(EMPTY_SHARE_OFFER);
    expect(parseShareOffer('{"answered":[1,"x"],"dismissStreak":"2"}')).toEqual({
      answered: [1],
      dismissStreak: 0
    });
  });
});
