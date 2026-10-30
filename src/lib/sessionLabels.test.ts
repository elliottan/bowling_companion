import { describe, expect, it } from "vitest";
import { alleyLabel, unnamedAlley } from "./sessionLabels";

describe("alleyLabel", () => {
  it("prints the alley when there is one", () => {
    expect(alleyLabel("Pinecrest Lanes")).toBe("Pinecrest Lanes");
  });

  it("names a session started without one, rather than leaving a blank row", () => {
    expect(alleyLabel("")).toBe(unnamedAlley());
    expect(alleyLabel("   ")).toBe(unnamedAlley());
    expect(alleyLabel(undefined)).toBe(unnamedAlley());
  });
});
