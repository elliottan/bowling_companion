/**
 * What the device check needs from a platform: run script in the app's web
 * view, tap a real point on the screen, type, press the system back, and take
 * a screenshot. Android drives the web view over Chrome's debugging protocol
 * (`android.ts`); iOS drives the simulator through Appium (`ios.ts`). The flow
 * (`flow.ts`) is written once against this.
 */
export interface Driver {
  readonly platform: "android" | "ios";
  /** Evaluate a JavaScript expression in the page; a promise is awaited. */
  evaluate<T>(expression: string): Promise<T>;
  /** A real tap at a point in CSS pixels of the page's viewport. */
  tapAt(x: number, y: number): Promise<void>;
  /** Type into whatever has focus. */
  type(text: string): Promise<void>;
  /** The platform's own back: Android's back button, iOS's edge swipe. */
  systemBack(): Promise<void>;
  /** Whether the app is the one in front, after a back that may leave it. */
  appInForeground(): Promise<boolean>;
  /** Bring the app back to the front after it was left. */
  relaunch(): Promise<void>;
  /** Cut or restore the network, where the platform can. */
  setOnline(online: boolean): Promise<boolean>;
  screenshot(path: string): Promise<void>;
  close(): Promise<void>;
}
