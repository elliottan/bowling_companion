import ActivityKit
import SwiftUI
import WidgetKit

/// The widget extension's entry point. It holds one thing: the Live Activity for
/// the game being scored (ADR-221), started and updated by the app's
/// `HeadpinLiveActivityPlugin`.
@main
struct HeadpinLiveActivityBundle: WidgetBundle {
    var body: some Widget {
        HeadpinGameLiveActivity()
    }
}

struct HeadpinGameLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: HeadpinGameAttributes.self) { context in
            // The Lock Screen, and the banner at the top of the screen.
            LockScreenGameView(state: context.state)
                .activityBackgroundTint(HeadpinPalette.lockScreenBackground)
                .activitySystemActionForegroundColor(HeadpinPalette.lockScreen.accent)
        } dynamicIsland: { context in
            let island = HeadpinPalette.island
            let state = context.state
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 6) {
                        HeadpinMark(size: 24)
                        Text("Game \(state.game)")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(island.ink)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("\(state.total)")
                        .font(.system(size: 30, weight: .bold, design: .rounded).monospacedDigit())
                        .foregroundColor(island.ink)
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(spacing: 0) {
                        Text(state.done ? "Final score" : "Frame \(state.frame)")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(island.accent)
                        if let max = state.max {
                            Text("Max \(max)")
                                .font(.system(size: 11).monospacedDigit())
                                .foregroundColor(island.secondary)
                        }
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    RecentFramesView(state: state)
                }
            } compactLeading: {
                PinShape()
                    .fill(island.accent)
                    .frame(width: 10, height: 18)
                    .accessibilityLabel("Headpin")
            } compactTrailing: {
                Text("\(state.total)")
                    .font(.system(size: 15, weight: .bold, design: .rounded).monospacedDigit())
                    .foregroundColor(island.ink)
            } minimal: {
                Text("\(state.total)")
                    .font(.system(size: 13, weight: .bold, design: .rounded).monospacedDigit())
                    .foregroundColor(island.accent)
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
            }
            .keylineTint(island.accent)
        }
    }
}
