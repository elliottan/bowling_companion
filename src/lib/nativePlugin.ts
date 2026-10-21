/**
 * A Capacitor plugin that is safe to hand back from a promise.
 *
 * `registerPlugin` returns an object that answers to every property name with a
 * method that calls the native side, `then` included. Resolve a promise with
 * one, or return one from an async function, and JavaScript reads `then`, takes
 * it for a promise, calls it, and waits for an answer that never comes. The
 * `await` hangs for good and nothing is thrown, so the purchase button and the
 * tab bar both sat there doing nothing while their native code was fine.
 *
 * This hides `then` and passes every other name through.
 */
export function unthenable<T extends object>(plugin: T): T {
  return new Proxy(plugin, {
    get: (target, prop) => (prop === "then" ? undefined : Reflect.get(target, prop))
  });
}
