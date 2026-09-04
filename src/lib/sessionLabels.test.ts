import { describe, expect, it } from "vitest";
import { alleyLabel, UNNAMED_ALLEY } from "./sessionLabels";

describe("alleyLabel", () => {
  it("prints the alley when there is one", () => {
    expect(alleyLabel("Pinecrest Lanes")).toBe("Pinecrest Lanes");
  });

  it("names a session started without one, rather than leaving a blank row", () => {
    expect(alleyLabel("")).toBe(UNNAMED_ALLEY);
    expect(alleyLabel("   ")).toBe(UNNAMED_ALLEY);
    expect(alleyLabel(undefined)).toBe(UNNAMED_ALLEY);
  });
});
