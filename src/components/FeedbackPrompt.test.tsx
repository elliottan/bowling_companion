import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { FeedbackPrompt } from "./FeedbackPrompt";
import { db } from "../db/bowlingDb";
import { FEEDBACK_PROMPT_KEY } from "../lib/feedbackPrompt";

async function bowl(nights: number) {
  for (let i = 0; i < nights; i++) {
    await db.sessions.add({ date: `2026-09-0${i + 1}`, alley_name: "Lucky Strike" });
  }
}

beforeEach(async () => {
  await Promise.all([db.sessions.clear(), db.settings.clear()]);
});

const ask = () => screen.findByText("How is Headpin treating you?");

describe("FeedbackPrompt", () => {
  it("says nothing before three nights out", async () => {
    await bowl(2);
    render(<FeedbackPrompt />);
    await waitFor(() => expect(db.sessions.count()).resolves.toBe(2));
    expect(screen.queryByText("How is Headpin treating you?")).not.toBeInTheDocument();
  });

  it("asks once the habit has stuck, and never again after No thanks", async () => {
    await bowl(3);
    render(<FeedbackPrompt />);
    await ask();

    fireEvent.click(screen.getByRole("button", { name: "No thanks" }));

    await waitFor(async () =>
      expect(await db.settings.get(FEEDBACK_PROMPT_KEY)).toBeDefined()
    );
    await waitFor(() =>
      expect(screen.queryByText("How is Headpin treating you?")).not.toBeInTheDocument()
    );
  });

  it("counts opening the form as an answer, so it does not come back", async () => {
    await bowl(4);
    render(<FeedbackPrompt />);
    await ask();

    fireEvent.click(screen.getByRole("link", { name: "Tell me" }));

    await waitFor(async () =>
      expect(await db.settings.get(FEEDBACK_PROMPT_KEY)).toBeDefined()
    );
  });
});
