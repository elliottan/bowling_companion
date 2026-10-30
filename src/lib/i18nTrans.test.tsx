import { render } from "@testing-library/react";
import { Trans } from "@lingui/react/macro";
import { i18n } from "@lingui/core";
import { describe, expect, it } from "vitest";
import { Trans as RuntimeTrans } from "./i18nTrans";

describe("Trans without a provider (ADR-223)", () => {
  it("renders a sentence with markup from the global i18n", () => {
    const leave = "2-4-5-8";
    const { container } = render(
      <p>
        <Trans>
          You leave <strong>{leave}</strong> most often.
        </Trans>
      </p>
    );
    expect(container.innerHTML).toBe("<p>You leave <strong>2-4-5-8</strong> most often.</p>");
  });

  it("reads the active catalog, so a translation keeps the markup", () => {
    const id = "test.trans";
    i18n.load("en", { [id]: "<0>Bold</0> first" });
    const { container } = render(
      <p>
        <RuntimeTrans id={id} message="Plain <0>bold</0>" components={{ 0: <strong /> }} />
      </p>
    );
    expect(container.innerHTML).toBe("<p><strong>Bold</strong> first</p>");
  });
});
