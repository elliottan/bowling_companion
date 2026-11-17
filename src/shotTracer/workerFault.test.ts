import { describe, expect, it } from "vitest";
import { breakFlags, brokenScript, faultNote, faultOf, firstStackLine, loadFailureNote, reportFaults } from "./workerFault";

describe("worker faults", () => {
  it("reads an error's message and the first line of its stack, in V8's form and Safari's", () => {
    const v8 = Object.assign(new Error("boom"), { stack: "Error: boom\n    at push (https://headpin.app/assets/search.worker-x.js:1:200)\n    at y" });
    expect(faultOf(v8)).toEqual({ message: "boom", at: "push (https://headpin.app/assets/search.worker-x.js:1:200)" });
    const safari = Object.assign(new TypeError("undefined is not an object"), { stack: "push@https://headpin.app/assets/search.worker-x.js:1:200\nonmessage@x" });
    expect(faultOf(safari)).toEqual({ message: "undefined is not an object", at: "push@https://headpin.app/assets/search.worker-x.js:1:200" });
    expect(faultOf(Object.assign(new RangeError(""), { stack: "" }))).toEqual({ message: "RangeError" });
  });

  it("reads what was thrown when it is not an error", () => {
    expect(faultOf("out of memory")).toEqual({ message: "out of memory" });
    expect(faultOf(undefined)).toEqual({ message: "undefined" });
    expect(faultOf(42)).toEqual({ message: "42" });
  });

  it("finds no place in an empty stack or one with only the message", () => {
    expect(firstStackLine(undefined)).toBeUndefined();
    expect(firstStackLine("Error: x\n\n", "x")).toBeUndefined();
    expect(firstStackLine("\n  f@a.js:1:2")).toBe("f@a.js:1:2");
  });

  it("writes a fault as one line", () => {
    expect(faultNote({ message: "boom" })).toBe("boom");
    expect(faultNote({ message: "boom", at: "f@a.js:1:2" })).toBe("boom; at f@a.js:1:2");
  });

  it("says where a worker that never loaded came from, with what Safari left out said as such", () => {
    expect(loadFailureNote({ message: "", filename: "", lineno: 0, colno: 0 }, "/assets/search.worker-x.js")).toBe(
      "did not load: no message (file none, line 0, column 0), from /assets/search.worker-x.js"
    );
    expect(loadFailureNote({ message: "SyntaxError: Unexpected token", filename: "https://headpin.app/assets/w.js", lineno: 3, colno: 9 }, "/assets/w.js")).toBe(
      "did not load: SyntaxError: Unexpected token (file https://headpin.app/assets/w.js, line 3, column 9), from /assets/w.js"
    );
    expect(loadFailureNote(null, "w.js")).toBe("did not load: no message (file none, line 0, column 0), from w.js");
  });

  it("reports a worker's uncaught errors and unhandled rejections", () => {
    const scope = new EventTarget();
    const seen: unknown[] = [];
    reportFaults(scope, (f) => seen.push(f));
    scope.dispatchEvent(Object.assign(new Event("error"), { error: Object.assign(new Error("thrown"), { stack: "f@w.js:1:1" }) }));
    scope.dispatchEvent(Object.assign(new Event("error"), { message: "Script error." }));
    scope.dispatchEvent(new Event("error"));
    scope.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: "nope" }));
    expect(seen).toEqual([{ message: "thrown", at: "f@w.js:1:1" }, { message: "Script error." }, { message: "error" }, { message: "nope" }]);
  });

  it("breaks the workers the address names, and nothing in a normal address", () => {
    expect(breakFlags("")).toEqual({});
    expect(breakFlags("?pro&tracerWorkers=2")).toEqual({});
    expect(breakFlags("?pro&tracerBreak=search-load")).toEqual({ search: "load" });
    expect(breakFlags("?tracerBreak=search-silent,%20pool-throw,pool-explode,lane-load")).toEqual({ search: "silent", pool: "throw" });
  });

  it("writes the script of a worker broken on purpose", () => {
    expect(brokenScript("load")).toBeNull();
    expect(brokenScript("silent")).toBe("");
    expect(brokenScript("throw")).toContain('postMessage({ kind: "ready" })');
  });
});
