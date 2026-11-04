import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { SearchField } from "./SearchField";

function Harness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <SearchField value={value} onChange={setValue} label="Search things" />;
}

const box = () => screen.getByRole("searchbox", { name: "Search things" });
const cancel = () => screen.getByText("Cancel");

describe("SearchField", () => {
  it("shows no clear button and no Cancel until the search is live", () => {
    render(<Harness />);
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
    expect(cancel()).toHaveAttribute("aria-hidden", "true");
    expect(cancel()).toHaveAttribute("tabindex", "-1");
  });

  it("brings Cancel in on focus, and takes it away on blur while empty", () => {
    render(<Harness />);
    fireEvent.focus(box());
    expect(cancel()).toHaveAttribute("aria-hidden", "false");
    fireEvent.blur(box());
    expect(cancel()).toHaveAttribute("aria-hidden", "true");
  });

  it("keeps Cancel while there is text, focused or not", () => {
    render(<Harness />);
    fireEvent.change(box(), { target: { value: "phaze" } });
    fireEvent.blur(box());
    expect(cancel()).toHaveAttribute("aria-hidden", "false");
  });

  it("clears the text and keeps the keyboard with the clear button", () => {
    render(<Harness initial="phaze" />);
    box().focus();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(box()).toHaveValue("");
    expect(box()).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
  });

  it("clears the text and lets the keyboard go with Cancel", () => {
    render(<Harness initial="phaze" />);
    box().focus();
    fireEvent.click(cancel());
    expect(box()).toHaveValue("");
    expect(box()).not.toHaveFocus();
    expect(cancel()).toHaveAttribute("aria-hidden", "true");
  });

  it("takes Escape as Cancel, without letting it reach the sheet behind", () => {
    let reachedParent = false;
    render(
      <div onKeyDown={() => { reachedParent = true; }}>
        <Harness initial="phaze" />
      </div>
    );
    fireEvent.keyDown(box(), { key: "Escape" });
    expect(box()).toHaveValue("");
    expect(reachedParent).toBe(false);
  });

  it("lets the keyboard go on its Search key and keeps the text", () => {
    render(<Harness initial="phaze" />);
    box().focus();
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(box()).not.toHaveFocus();
    expect(box()).toHaveValue("phaze");
  });
});
