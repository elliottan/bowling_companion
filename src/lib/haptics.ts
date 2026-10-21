import { isNativeApp } from "./platform";

/**
 * A tap the bowler feels, in the store apps (ADR-160). The web has no haptics
 * worth the name, so it stays silent there and loads nothing.
 *
 * - `pin`: a pin knocked down or stood back up on the deck.
 * - `shot`: a ball recorded.
 * - `mark`: a ball that cleared the deck, a strike or a spare.
 * - `select`: the tick a picker gives as its choice moves, a segmented
 *   control's segment (ADR-168), as UIKit's own segmented control does.
 */
export type HapticKind = "pin" | "shot" | "mark" | "select";

let plugin: Promise<typeof import("@capacitor/haptics")> | null = null;

export function haptic(kind: HapticKind, native = isNativeApp()): Promise<void> {
  if (!native) return Promise.resolve();
  plugin ??= import("@capacitor/haptics");
  return plugin
    .then(({ Haptics, ImpactStyle, NotificationType }) =>
      kind === "select"
        ? // iOS keeps a selection generator only between start and end.
          Haptics.selectionStart()
            .then(() => Haptics.selectionChanged())
            .then(() => Haptics.selectionEnd())
        : kind === "pin"
        ? Haptics.impact({ style: ImpactStyle.Light })
        : kind === "shot"
          ? Haptics.impact({ style: ImpactStyle.Medium })
          : Haptics.notification({ type: NotificationType.Success })
    )
    .catch(() => {
      // A phone with haptics off, or none to give, is not an error.
    });
}
