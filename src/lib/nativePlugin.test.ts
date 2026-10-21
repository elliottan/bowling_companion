import { describe, expect, it } from "vitest";
import { unthenable } from "./nativePlugin";

/** Capacitor's `registerPlugin` object: every property is a method, `then` too,
 *  and that one never settles anything. */
function capacitorLike() {
  return new Proxy(
    {},
    {
      get: (_target, prop) =>
        prop === "then" ? () => new Promise(() => {}) : () => Promise.resolve(`called ${String(prop)}`)
    }
  ) as { purchase(): Promise<string> };
}

const settlesWithin = (promise: Promise<unknown>, ms: number) =>
  Promise.race([promise.then(() => true), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms))]);

describe("unthenable", () => {
  it("shows why it is needed: awaiting a Capacitor-like plugin never finishes", async () => {
    const plugin = capacitorLike();
    expect(await settlesWithin(Promise.resolve(plugin), 50)).toBe(false);
  });

  it("lets a promise resolve with the plugin, and still calls its methods", async () => {
    const plugin = unthenable(capacitorLike());
    expect(await settlesWithin(Promise.resolve(plugin), 50)).toBe(true);
    expect(await plugin.purchase()).toBe("called purchase");
  });
});
