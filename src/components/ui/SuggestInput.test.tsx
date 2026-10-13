import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ChoiceInput, SuggestInput } from "./SuggestInput";

function Free({ initial = "" }: { initial?: string }) {
  const [v, setV] = useState(initial);
  return <SuggestInput ariaLabel="Pattern" value={v} onChange={setV} suggestions={["Main Street", "Chromium", "Wall Street"]} />;
}

describe("SuggestInput", () => {
  it("offers everything on focus, narrows anywhere in the words, and fills in a tap", () => {
    render(<Free />);
    const field = screen.getByRole("combobox", { name: "Pattern" });
    fireEvent.focus(field);
    expect(screen.getAllByRole("option")).toHaveLength(3);

    fireEvent.change(field, { target: { value: "street" } });
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Main Street", "Wall Street"]);

    fireEvent.click(screen.getByRole("button", { name: "Wall Street" }));
    expect(field).toHaveValue("Wall Street");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("does not offer the entry already typed in full", () => {
    render(<Free initial="Chromium" />);
    fireEvent.focus(screen.getByRole("combobox"));
    expect(screen.queryByRole("button", { name: "Chromium" })).toBeNull();
  });

  it("matches on the label too, and shows it", () => {
    render(
      <SuggestInput value="41" onChange={() => {}} suggestions={[{ value: "Chromium", label: "(41 ft) Chromium" }]} />
    );
    fireEvent.focus(screen.getByRole("combobox"));
    expect(screen.getByRole("button", { name: "(41 ft) Chromium" })).toBeInTheDocument();
  });
});

describe("ChoiceInput", () => {
  function Choice({ onChange }: { onChange: (v: string) => void }) {
    const [v, setV] = useState("");
    return (
      <ChoiceInput
        ariaLabel="Pattern"
        value={v}
        onChange={(next) => {
          setV(next);
          onChange(next);
        }}
        options={["Main Street", "Chromium"]}
        placeholder="All patterns"
        clearLabel="Clear"
      />
    );
  }

  it("takes a tapped option, and clears back to none", () => {
    const onChange = vi.fn();
    render(<Choice onChange={onChange} />);
    const field = screen.getByRole("combobox", { name: "Pattern" });
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: "chro" } });
    fireEvent.click(screen.getByRole("button", { name: "Chromium" }));
    expect(onChange).toHaveBeenLastCalledWith("Chromium");
    expect(field).toHaveValue("Chromium");

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenLastCalledWith("");
    expect(field).toHaveValue("");
  });

  it("puts back a value nobody has when the field is left, and takes a name typed in full", () => {
    vi.useFakeTimers();
    try {
      const onChange = vi.fn();
      render(<Choice onChange={onChange} />);
      const field = screen.getByRole("combobox", { name: "Pattern" });

      fireEvent.change(field, { target: { value: "nothing like it" } });
      fireEvent.blur(field);
      act(() => vi.runAllTimers());
      expect(onChange).not.toHaveBeenCalled();
      expect(field).toHaveValue("");

      fireEvent.change(field, { target: { value: "main street" } });
      fireEvent.blur(field);
      act(() => vi.runAllTimers());
      expect(onChange).toHaveBeenLastCalledWith("Main Street");
      expect(field).toHaveValue("Main Street");
    } finally {
      vi.useRealTimers();
    }
  });
});
