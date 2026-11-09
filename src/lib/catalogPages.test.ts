import { describe, expect, it } from "vitest";
import { kinListPage, parseKinListPage } from "./catalogPages";

describe("catalog pages (ADR-264)", () => {
  it("round-trips a list of one core or one cover, colons and all", () => {
    expect(parseKinListPage(kinListPage({ kind: "core", name: "Hadron" }))).toEqual({ kind: "core", name: "Hadron" });
    expect(parseKinListPage(kinListPage({ kind: "cover", name: "R2S: Pearl" }))).toEqual({ kind: "cover", name: "R2S: Pearl" });
  });

  it("reads a ball's id, or anything malformed, as no list", () => {
    expect(parseKinListPage("storm-phaze-ii-2018")).toBeNull();
    expect(parseKinListPage("~shape:round")).toBeNull();
    expect(parseKinListPage("~core")).toBeNull();
  });
});
