import { legalBody } from "./legalPage";
import page from "../../legal/index.html?raw";

describe("legalBody", () => {
  it("keeps the page's text and drops its site chrome", () => {
    const body = legalBody(page);
    expect(body).toContain('id="privacy"');
    expect(body).toContain('id="terms"');
    expect(body).toContain("hello@headpin.app");
    expect(body).not.toContain("<h1>");
    expect(body).not.toContain('class="back"');
    expect(body).not.toContain("<footer>");
    expect(body).not.toContain("<!--");
  });

  it("is empty for a page with no main", () => {
    expect(legalBody("<p>nothing</p>")).toBe("");
  });
});
