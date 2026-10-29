import { describe, expect, it, vi } from "vitest";
import {
  FINAL_SCORE_LINGER_SECONDS,
  createLiveActivityController,
  readLiveActivityStatus,
  type LiveActivityPlugin
} from "./nativeLiveActivity";
import type { LiveActivityPayload, LiveActivityState } from "./liveActivity";

const STATE: LiveActivityState = {
  label: "Practice",
  location: "",
  game: 1,
  total: 20,
  frame: 2,
  done: false,
  max: 300,
  frames: []
};
const payload = (gameId: number, total = 20): LiveActivityPayload => ({ gameId, state: { ...STATE, total } });

function fake(active = true) {
  const live = {
    status: vi.fn().mockResolvedValue({ supported: true, enabled: true }),
    start: vi.fn().mockResolvedValue({ active }),
    update: vi.fn().mockResolvedValue({ active }),
    end: vi.fn().mockResolvedValue(undefined)
  };
  return { live, load: async () => live as unknown as LiveActivityPlugin };
}

/** Lets the controller's queue run to the end. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the live activity controller", () => {
  it("starts an activity on the first ball and updates it after", async () => {
    const { live, load } = fake();
    const controller = createLiveActivityController(load, () => true);
    controller.show(payload(7));
    await settle();
    expect(live.start).toHaveBeenCalledWith(payload(7));
    controller.show(payload(7, 48));
    await settle();
    expect(live.update).toHaveBeenCalledWith(payload(7, 48));
    expect(live.start).toHaveBeenCalledTimes(1);
  });

  it("starts again when the phone has dropped the activity", async () => {
    const { live, load } = fake();
    const controller = createLiveActivityController(load, () => true);
    controller.show(payload(7));
    await settle();
    live.update.mockResolvedValueOnce({ active: false });
    controller.show(payload(7, 48));
    await settle();
    expect(live.start).toHaveBeenCalledTimes(2);
  });

  it("starts, not updates, when the next game begins", async () => {
    const { live, load } = fake();
    const controller = createLiveActivityController(load, () => true);
    controller.show(payload(7));
    await settle();
    controller.show(payload(8));
    await settle();
    expect(live.update).not.toHaveBeenCalled();
    expect(live.start).toHaveBeenLastCalledWith(payload(8));
  });

  it("keeps a finished game's score up for a few minutes", async () => {
    const { live, load } = fake();
    const controller = createLiveActivityController(load, () => true);
    controller.show(payload(7));
    await settle();
    controller.finish(payload(7, 187));
    await settle();
    expect(live.end).toHaveBeenCalledWith({
      gameId: 7,
      state: payload(7, 187).state,
      dismissAfter: FINAL_SCORE_LINGER_SECONDS
    });
  });

  it("takes the activity down at once when the game is gone", async () => {
    const { live, load } = fake();
    const controller = createLiveActivityController(load, () => true);
    controller.show(payload(7));
    await settle();
    controller.stop(7);
    await settle();
    expect(live.end).toHaveBeenCalledWith({ gameId: 7 });
  });

  it("leaves another game's activity alone when this one is deleted", async () => {
    const { live, load } = fake();
    const controller = createLiveActivityController(load, () => true);
    controller.show(payload(7));
    await settle();
    controller.stop(3);
    await settle();
    expect(live.end).not.toHaveBeenCalled();
  });

  it("stops whatever is showing when no game is named", async () => {
    const { live, load } = fake();
    const controller = createLiveActivityController(load, () => true);
    controller.stop();
    await settle();
    expect(live.end).toHaveBeenCalledWith({});
  });

  it("sends only the newest of the balls that arrived while it was busy", async () => {
    const { live, load } = fake();
    let release: () => void = () => {};
    live.start.mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve({ active: true }))));
    const controller = createLiveActivityController(load, () => true);
    controller.show(payload(7, 10));
    await settle();
    controller.show(payload(7, 20));
    controller.show(payload(7, 30));
    controller.show(payload(7, 40));
    release();
    await settle();
    await settle();
    expect(live.update).toHaveBeenCalledTimes(1);
    expect(live.update).toHaveBeenCalledWith(payload(7, 40));
  });

  it("does nothing where there is no phone to draw it", async () => {
    const { live, load } = fake();
    const loader = vi.fn(load);
    const controller = createLiveActivityController(loader, () => false);
    controller.show(payload(7));
    controller.finish(payload(7));
    controller.stop(7);
    await settle();
    expect(loader).not.toHaveBeenCalled();
    expect(live.start).not.toHaveBeenCalled();
  });

  it("swallows a phone that says no, and carries on with the next ball", async () => {
    const { live, load } = fake();
    live.start.mockRejectedValueOnce(new Error("Live Activities are off"));
    const controller = createLiveActivityController(load, () => true);
    controller.show(payload(7));
    await settle();
    controller.show(payload(7, 48));
    await settle();
    expect(live.start).toHaveBeenCalledTimes(2);
  });

  it("does not go on trying to update an activity the phone never made", async () => {
    const { live, load } = fake(false);
    const controller = createLiveActivityController(load, () => true);
    controller.show(payload(7));
    await settle();
    controller.show(payload(7, 48));
    await settle();
    expect(live.update).not.toHaveBeenCalled();
    expect(live.start).toHaveBeenCalledTimes(2);
  });
});

describe("readLiveActivityStatus", () => {
  it("is null off the iPhone app, without asking", async () => {
    const { live, load } = fake();
    expect(await readLiveActivityStatus(load, false)).toBeNull();
    expect(live.status).not.toHaveBeenCalled();
  });

  it("is what the phone says", async () => {
    const { load } = fake();
    expect(await readLiveActivityStatus(load, true)).toEqual({ supported: true, enabled: true });
  });

  it("is null when the plugin is missing", async () => {
    expect(await readLiveActivityStatus(() => Promise.reject(new Error("gone")), true)).toBeNull();
  });
});
