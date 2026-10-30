import Foundation
import Capacitor
import ActivityKit

/// The game being scored, on the Lock Screen and in the Dynamic Island (ADR-221).
///
/// The page decides what it says (`src/lib/liveActivity.ts` turns frames into
/// marks and totals) and when (it calls `start` after a ball is saved, `update`
/// on later ones, `end` when the game finishes or goes). This starts, updates
/// and ends the ActivityKit activity, and nothing more: the drawing is the
/// `HeadpinLiveActivity` widget extension's.
///
/// The app runs on iOS 15 and Live Activities arrive in 16.1, so every use of
/// ActivityKit is behind an availability check, and an older phone answers
/// `supported: false` and nothing else. One activity at a time: starting a game
/// ends whichever other one is showing.
@objc(HeadpinLiveActivityPlugin)
public class HeadpinLiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HeadpinLiveActivityPlugin"
    public let jsName = "HeadpinLiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showing", returnType: CAPPluginReturnPromise)
    ]

    /// Whether this phone can show one, and whether the bowler has allowed it
    /// for Headpin in the phone's own Settings. The page hides its switch when
    /// `supported` is false and says where to allow it when `enabled` is.
    @objc func status(_ call: CAPPluginCall) {
        if #available(iOS 16.1, *) {
            call.resolve([
                "supported": HeadpinLiveActivities.extensionIsBundled,
                "enabled": ActivityAuthorizationInfo().areActivitiesEnabled
            ])
        } else {
            call.resolve(["supported": false, "enabled": false])
        }
    }

    /// Shows the game: updates its activity if it has one, else ends any other
    /// and starts one. `active` says whether an activity is showing it.
    @objc func start(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.resolve(["active": false])
            return
        }
        guard let gameId = call.getInt("gameId"), let state = HeadpinLiveActivities.state(in: call) else {
            call.reject("start needs a gameId and a state")
            return
        }
        Task {
            let active = await HeadpinLiveActivities.start(gameId: gameId, state: state)
            call.resolve(["active": active])
        }
    }

    /// Updates the game's activity. `active: false` when it has none, which is
    /// the page's cue to start one: the app may have been closed and opened
    /// since, and the page does not remember what the phone was showing.
    @objc func update(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.resolve(["active": false])
            return
        }
        guard let gameId = call.getInt("gameId"), let state = HeadpinLiveActivities.state(in: call) else {
            call.reject("update needs a gameId and a state")
            return
        }
        Task {
            let active = await HeadpinLiveActivities.update(gameId: gameId, state: state)
            call.resolve(["active": active])
        }
    }

    /// Ends the game's activity, or every one when no game is named. With a
    /// `state` and `dismissAfter` it leaves that state up for that many
    /// seconds (the final score), else it goes at once.
    @objc func end(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.resolve()
            return
        }
        let gameId = call.getInt("gameId")
        let state = HeadpinLiveActivities.state(in: call)
        let seconds = call.getDouble("dismissAfter") ?? 0
        Task {
            await HeadpinLiveActivities.end(gameId: gameId, state: state, after: seconds)
            call.resolve()
        }
    }

    /// The games whose activities are still showing. The page asks on launch,
    /// because an app closed mid-game leaves its activity up and the page that
    /// opens next does not remember it (ADR-222).
    @objc func showing(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.resolve(["gameIds": []])
            return
        }
        call.resolve(["gameIds": HeadpinLiveActivities.showingGameIds])
    }
}

/// ActivityKit, in one place that is wholly iOS 16.1 and later.
@available(iOS 16.1, *)
enum HeadpinLiveActivities {
    typealias Attributes = HeadpinGameAttributes
    typealias State = HeadpinGameAttributes.ContentState

    /// The widget extension is a plug-in inside the app. A build without it
    /// (an old project file, a hand-made archive) cannot show an activity, and
    /// would only throw when asked, so the page is told there is nothing to turn on.
    static var extensionIsBundled: Bool {
        guard let folder = Bundle.main.builtInPlugInsURL,
              let names = try? FileManager.default.contentsOfDirectory(atPath: folder.path) else {
            return false
        }
        return names.contains("HeadpinLiveActivity.appex")
    }

    /// The page's `state`, read through JSON so the Swift type is the only
    /// place its shape is written down.
    static func state(in call: CAPPluginCall) -> State? {
        guard let object = call.options["state"] as? [String: Any],
              JSONSerialization.isValidJSONObject(object),
              let data = try? JSONSerialization.data(withJSONObject: object) else {
            return nil
        }
        return try? JSONDecoder().decode(State.self, from: data)
    }

    /// Only the ones still showing: a finished game's score lingers as an
    /// ended activity for a few minutes, and a new game must not adopt it.
    private static var showing: [Activity<Attributes>] {
        Activity<Attributes>.activities.filter { $0.activityState == .active }
    }

    static var showingGameIds: [Int] {
        showing.map { $0.attributes.gameId }
    }

    static func start(gameId: Int, state: State) async -> Bool {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return false }
        let current = showing
        if let same = current.first(where: { $0.attributes.gameId == gameId }) {
            await push(state, to: same)
            for other in current where other.id != same.id {
                await finish(other, state: nil, after: 0)
            }
            return true
        }
        for other in current {
            await finish(other, state: nil, after: 0)
        }
        do {
            let attributes = Attributes(gameId: gameId)
            if #available(iOS 16.2, *) {
                _ = try Activity<Attributes>.request(
                    attributes: attributes,
                    content: ActivityContent(state: state, staleDate: nil),
                    pushType: nil
                )
            } else {
                _ = try Activity<Attributes>.request(attributes: attributes, contentState: state, pushType: nil)
            }
            return true
        } catch {
            CAPLog.print("⚡️  Headpin Live Activity not started: \(error.localizedDescription)")
            return false
        }
    }

    static func update(gameId: Int, state: State) async -> Bool {
        guard let activity = showing.first(where: { $0.attributes.gameId == gameId }) else { return false }
        await push(state, to: activity)
        return true
    }

    static func end(gameId: Int?, state: State?, after seconds: Double) async {
        for activity in showing where gameId == nil || activity.attributes.gameId == gameId {
            await finish(activity, state: state, after: seconds)
        }
    }

    private static func push(_ state: State, to activity: Activity<Attributes>) async {
        if #available(iOS 16.2, *) {
            await activity.update(ActivityContent(state: state, staleDate: nil))
        } else {
            await activity.update(using: state)
        }
    }

    private static func finish(_ activity: Activity<Attributes>, state: State?, after seconds: Double) async {
        let policy: ActivityUIDismissalPolicy = seconds > 0
            ? .after(Date().addingTimeInterval(seconds))
            : .immediate
        if #available(iOS 16.2, *) {
            let content = state.map { ActivityContent(state: $0, staleDate: nil) }
            await activity.end(content, dismissalPolicy: policy)
        } else {
            await activity.end(using: state, dismissalPolicy: policy)
        }
    }
}
