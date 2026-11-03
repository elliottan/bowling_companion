import Foundation
import Capacitor
import UIKit

/// A confirm, asked by UIKit rather than drawn by the page (ADR-231).
///
/// `UIAlertController` is the phone's own: its material, its type, the red of a
/// destructive action, the bold of the preferred one, and whatever the next iOS
/// does to all of them, with nothing here to update. The page decides what to
/// ask and what each answer does; this only asks. A confirm the page draws
/// itself (a typed phrase, a count in bold) never comes here.
@objc(HeadpinAlertPlugin)
public class HeadpinAlertPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HeadpinAlertPlugin"
    public let jsName = "HeadpinAlert"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "confirm", returnType: CAPPluginReturnPromise)
    ]

    /// Asks `title` (and `message`) with a cancel and a confirm, and resolves
    /// `{confirmed}`. `destructive` draws the confirm in the system red; without
    /// it the confirm is the preferred action, in bold and the accent. `dark` is
    /// the app's own theme, which can differ from the phone's.
    @objc func confirm(_ call: CAPPluginCall) {
        let title = call.getString("title") ?? ""
        let message = call.getString("message")
        let confirmLabel = call.getString("confirmLabel") ?? "OK"
        let cancelLabel = call.getString("cancelLabel") ?? "Cancel"
        let destructive = call.getBool("destructive") ?? true
        let dark = call.getBool("dark")
        let accent = call.getString("accent").flatMap(HeadpinAlertPlugin.color(fromHex:))
        DispatchQueue.main.async { [weak self] in
            guard var top = self?.bridge?.viewController else {
                call.reject("The alert has no screen to sit on")
                return
            }
            while let presented = top.presentedViewController { top = presented }

            let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
            if let dark = dark { alert.overrideUserInterfaceStyle = dark ? .dark : .light }
            if let accent = accent { alert.view.tintColor = accent }
            alert.addAction(UIAlertAction(title: cancelLabel, style: .cancel) { _ in
                call.resolve(["confirmed": false])
            })
            let confirm = UIAlertAction(title: confirmLabel, style: destructive ? .destructive : .default) { _ in
                call.resolve(["confirmed": true])
            }
            alert.addAction(confirm)
            if !destructive { alert.preferredAction = confirm }
            top.present(alert, animated: true)
        }
    }

    private static func color(fromHex hex: String) -> UIColor? {
        var text = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.hasPrefix("#") { text.removeFirst() }
        guard text.count == 6, let value = UInt32(text, radix: 16) else { return nil }
        return UIColor(
            red: CGFloat((value >> 16) & 0xFF) / 255,
            green: CGFloat((value >> 8) & 0xFF) / 255,
            blue: CGFloat(value & 0xFF) / 255,
            alpha: 1
        )
    }
}
