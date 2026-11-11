import { describe, expect, it } from "vitest";
import { storeAsking, storeDidNotAnswer, storeNotBought } from "./storeWords";

describe("storeWords", () => {
  it("names the App Store and an Apple ID outside the Android app", () => {
    expect(storeAsking(false)).toBe("Asking the App Store…");
    expect(storeDidNotAnswer("offline", false)).toBe("The App Store did not answer: offline");
    expect(storeDidNotAnswer("", false)).toBe("The App Store did not answer. Try again in a moment.");
    expect(storeNotBought(false)).toBe("This Apple ID has not bought Headpin Pro.");
  });

  it("names Google Play and a Google account in the Android app", () => {
    expect(storeAsking(true)).toBe("Asking Google Play…");
    expect(storeDidNotAnswer("offline", true)).toBe("Google Play did not answer: offline");
    expect(storeDidNotAnswer("", true)).toBe("Google Play did not answer. Try again in a moment.");
    expect(storeNotBought(true)).toBe("This Google account has not bought Headpin Pro.");
  });
});
