import { afterEach, describe, expect, it, vi } from "vitest";
import { askNativeConfirm, nativeAlertMissing, resetNativeAlert, type AlertPlugin } from "./nativeAlert";

const ASK = { title: "Delete this game?", message: "It cannot be undone.", confirmLabel: "Delete", cancelLabel: "Cancel", destructive: true };

function plugin(answer: Promise<{ confirmed: boolean }>) {
  const confirm = vi.fn(() => answer);
  return { load: async () => ({ confirm }) as unknown as AlertPlugin, confirm };
}

describe("askNativeConfirm (ADR-232)", () => {
  afterEach(() => resetNativeAlert());

  it("hands the phone the question, with the app's theme and accent, and reads its answer", async () => {
    const yes = plugin(Promise.resolve({ confirmed: true }));
    await expect(askNativeConfirm(ASK, yes.load)).resolves.toBe("confirm");
    expect(yes.confirm).toHaveBeenCalledWith(expect.objectContaining({ ...ASK, dark: false, accent: expect.stringMatching(/^#[0-9a-f]{6}$/) }));

    const no = plugin(Promise.resolve({ confirmed: false }));
    await expect(askNativeConfirm(ASK, no.load)).resolves.toBe("cancel");
  });

  it("asks once while an alert is up, rather than stacking a second", async () => {
    let answer!: (v: { confirmed: boolean }) => void;
    const p = plugin(new Promise((r) => (answer = r)));
    const first = askNativeConfirm(ASK, p.load);
    const second = askNativeConfirm(ASK, p.load);
    answer({ confirmed: true });
    await expect(first).resolves.toBe("confirm");
    await expect(second).resolves.toBe("confirm");
    expect(p.confirm).toHaveBeenCalledTimes(1);
  });

  it("answers unavailable when the build has no plugin, and stops asking", async () => {
    const broken = plugin(Promise.reject(new Error("not implemented")));
    await expect(askNativeConfirm(ASK, broken.load)).resolves.toBe("unavailable");
    expect(nativeAlertMissing()).toBe(true);
    const later = plugin(Promise.resolve({ confirmed: true }));
    await expect(askNativeConfirm(ASK, later.load)).resolves.toBe("unavailable");
    expect(later.confirm).not.toHaveBeenCalled();
  });
});
