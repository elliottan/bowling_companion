import ActivityKit
import Foundation

/// The game on the Lock Screen and in the Dynamic Island (ADR-221).
///
/// Compiled into both the app, which starts and updates the activity
/// (`HeadpinLiveActivityPlugin`), and the `HeadpinLiveActivity` widget
/// extension, which draws it. The two have to agree on this shape exactly, which
/// is why it is one file in both targets and not two copies.
///
/// Nothing here is bowling. The page sends every mark and every running total
/// ready to draw (`src/lib/liveActivity.ts`), so the phone cannot score a game
/// differently from the card. The field names are the page's, and ActivityKit
/// refuses a state over 4 KB: a full game is about 0.6 KB.
@available(iOS 16.1, *)
struct HeadpinGameAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        /// One frame as the scorecard draws it.
        struct Frame: Codable, Hashable {
            /// Two boxes, or three in the tenth: "X", "/", "-", "7", "F", or "".
            var marks: [String]
            /// The running total under the frame, or "" while it is not scored.
            var score: String
        }

        /// The session's event ("Tuesday league"), else its alley.
        var label: String
        /// The bowling centre, or "" when the label is already it.
        var location: String
        var game: Int
        var total: Int
        /// The frame being bowled, 1 to 10.
        var frame: Int
        /// Every ball is in: show the final score.
        var done: Bool
        /// The highest score still possible, or nil once the game is over.
        var max: Int?
        /// Always ten.
        var frames: [Frame]
        /// The palette the app is showing: "felt", "ocean", "sunset", "grape"
        /// or "rose".
        var palette: String
        /// "light" or "dark" as the bowler chose in the app, or "system".
        var theme: String
    }

    /// The game's id in the app's database, so the app can tell which game an
    /// activity belongs to after it has been closed and opened again.
    var gameId: Int
}
