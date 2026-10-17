import { describe, expect, it } from "vitest";
import { catalogRequestMailto } from "./links";

describe("catalogRequestMailto", () => {
  function parts(url: string) {
    const [head, query] = url.split("?");
    const params = new URLSearchParams(query);
    return { to: head, subject: params.get("subject"), body: params.get("body") };
  }

  it("asks for a ball, with what was searched in the subject and the body", () => {
    const { to, subject, body } = parts(catalogRequestMailto("ball", "  Hy-Road Max "));
    expect(to).toBe("mailto:hello@headpin.app");
    expect(subject).toBe("Ball request: Hy-Road Max");
    expect(body).toContain("Ball: Hy-Road Max");
    expect(body).toContain("Brand:");
  });

  it("asks for a pattern, and asks for the sheet", () => {
    const { subject, body } = parts(catalogRequestMailto("pattern", "Cheetah"));
    expect(subject).toBe("Pattern request: Cheetah");
    expect(body).toContain("Pattern: Cheetah");
    expect(body).toContain("Link to the pattern sheet:");
  });

  it("drops the colon when nothing was typed", () => {
    expect(parts(catalogRequestMailto("ball", "   ")).subject).toBe("Ball request");
  });

  it("caps a pasted paragraph so it cannot become the subject line", () => {
    const { subject } = parts(catalogRequestMailto("ball", "x".repeat(500)));
    expect(subject).toBe(`Ball request: ${"x".repeat(60)}`);
  });

  it("escapes what the bowler typed", () => {
    const url = catalogRequestMailto("ball", "A&B=C?");
    expect(url.split("?").length).toBe(2);
    expect(parts(url).subject).toBe("Ball request: A&B=C?");
  });
});
