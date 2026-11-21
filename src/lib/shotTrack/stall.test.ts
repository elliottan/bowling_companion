import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Stalled, Watchdog, within } from "./stall";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const never = () => new Promise<never>(() => {});

describe("within", () => {
  it("passes an answer that comes in time through", async () => {
    const p = within(new Promise((r) => setTimeout(() => r(7), 100)), 1000, "x");
    await vi.advanceTimersByTimeAsync(100);
    await expect(p).resolves.toBe(7);
  });

  it("passes a plain value and a rejection in time through", async () => {
    await expect(within(3, 1000, "x")).resolves.toBe(3);
    await expect(within(Promise.reject(new Error("bad")), 1000, "x")).rejects.toThrow("bad");
  });

  it("ends a wait that never answers with what stalled", async () => {
    const p = within(never(), 5000, "isConfigSupported");
    const seen = expect(p).rejects.toThrow("isConfigSupported stalled: no answer in 5 s");
    await vi.advanceTimersByTimeAsync(5000);
    await seen;
    await expect(p).rejects.toBeInstanceOf(Stalled);
  });

  it("drops an answer or a failure that comes after the timeout", async () => {
    let answer!: (v: number) => void;
    const p = within(new Promise<number>((r) => (answer = r)), 1500, "copyTo");
    const seen = expect(p).rejects.toThrow("copyTo stalled: no answer in 1.5 s");
    await vi.advanceTimersByTimeAsync(1500);
    answer(1);
    await seen;
    let fail!: (e: Error) => void;
    const q = within(new Promise<number>((_, r) => (fail = r)), 10, "read");
    const seenQ = expect(q).rejects.toBeInstanceOf(Stalled);
    await vi.advanceTimersByTimeAsync(10);
    fail(new Error("late"));
    await seenQ;
  });
});

describe("Watchdog", () => {
  it("lets a stage that keeps moving run past its window", async () => {
    const dog = new Watchdog(1000, "the look");
    let done!: (v: string) => void;
    const p = dog.guard(new Promise<string>((r) => (done = r)));
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(900);
      dog.poke(`frame ${i}`);
    }
    done("ok");
    await expect(p).resolves.toBe("ok");
    // Pokes after the end are harmless.
    dog.poke("late");
    await vi.advanceTimersByTimeAsync(5000);
  });

  it("bites a stage that stops moving, saying what it last did", async () => {
    const dog = new Watchdog(2000, "the look");
    dog.poke("before the guard");
    const p = dog.guard(never());
    const seen = expect(p).rejects.toThrow("the look (last: frame 3) stalled: no answer in 2 s");
    dog.poke("frame 3");
    await vi.advanceTimersByTimeAsync(1999);
    await vi.advanceTimersByTimeAsync(1);
    await seen;
  });

  it("says nothing yet when it was never poked, and passes a failure through", async () => {
    const dog = new Watchdog(100, "the read");
    const p = dog.guard(never());
    const seen = expect(p).rejects.toThrow("the read (last: nothing yet)");
    await vi.advanceTimersByTimeAsync(100);
    await seen;
    await expect(new Watchdog(100, "x").guard(Promise.reject(new Error("bad")))).rejects.toThrow("bad");
  });

  it("drops what the stage gives after it was bitten", async () => {
    for (const late of ["answer", "failure"] as const) {
      const dog = new Watchdog(100, "the read");
      let answer!: (v: number) => void;
      let fail!: (e: Error) => void;
      const p = dog.guard(
        new Promise<number>((r, j) => {
          answer = r;
          fail = j;
        })
      );
      const seen = expect(p).rejects.toBeInstanceOf(Stalled);
      await vi.advanceTimersByTimeAsync(100);
      if (late === "answer") answer(1);
      else fail(new Error("late"));
      await seen;
    }
  });
});
