import Foundation
import Capacitor
import UIKit

/// The tab bar, drawn by UIKit rather than by the page (ADR-161).
///
/// A system tab bar takes whatever look the phone's iOS gives it: the Liquid
/// Glass bar on iOS 26 and later, the frosted one before it, and the next one
/// when Apple changes it again, with nothing here to update. The page keeps what
/// the tabs are, which one is chosen and when the bar steps aside for a sheet or
/// the keyboard; this draws it and reports taps and its own height.
///
/// The bar sits over the web view, which runs edge to edge beneath it, so the
/// page leaves room for the height this reports.
@objc(HeadpinTabBarPlugin)
public class HeadpinTabBarPlugin: CAPPlugin, CAPBridgedPlugin, UITabBarDelegate {
    public let identifier = "HeadpinTabBarPlugin"
    public let jsName = "HeadpinTabBar"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "select", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setHidden", returnType: CAPPluginReturnPromise)
    ]

    private var tabBar: HeadpinTabBar?
    /// The page's id for each item, in tab order.
    private var ids: [String] = []
    /// What each tab is drawn with, by the page's id for it. Here rather than in
    /// the page: a symbol is how this phone draws a tab, and a name the page
    /// sends can only be as new as the page.
    private static let symbols: [String: String] = [
        "dashboard": "house",
        "active": "figure.bowling",
        "history": "clock.arrow.circlepath",
        "stats": "chart.bar",
        "settings": "gearshape"
    ]
    private var lastHeight: CGFloat = 0

    /// Puts the bar on screen with these tabs, or updates it: the same call
    /// restyles it when the app's theme changes. `items` is `[{id, title}]`;
    /// `dark` is the app's own theme, which can differ from the phone's, and
    /// `accent` the color of the chosen tab as `#rrggbb`.
    @objc func configure(_ call: CAPPluginCall) {
        let items = call.getArray("items", JSObject.self) ?? []
        let selected = call.getString("selected")
        let dark = call.getBool("dark") ?? false
        let accent = call.getString("accent")
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let host = self.bridge?.viewController?.view else {
                call.reject("The tab bar has no screen to sit on")
                return
            }
            let bar = self.tabBar ?? self.makeTabBar(on: host)

            var next: [String] = []
            var barItems: [UITabBarItem] = []
            for (index, item) in items.enumerated() {
                guard let id = item["id"] as? String, let title = item["title"] as? String else { continue }
                let symbol = HeadpinTabBarPlugin.symbols[id] ?? "circle"
                // `figure.bowling` is iOS 16 and later; an older phone gets a plain dot.
                let image = UIImage(systemName: symbol) ?? UIImage(systemName: "circle")
                let barItem = UITabBarItem(title: title, image: image, tag: index)
                next.append(id)
                barItems.append(barItem)
            }
            self.ids = next
            bar.items = barItems
            if let selected = selected, let index = next.firstIndex(of: selected) {
                bar.selectedItem = barItems[index]
            }
            bar.overrideUserInterfaceStyle = dark ? .dark : .light
            if let accent = accent, let color = HeadpinTabBarPlugin.color(fromHex: accent) {
                bar.tintColor = color
            }

            host.layoutIfNeeded()
            let height = self.measuredHeight(of: bar)
            self.lastHeight = height
            call.resolve(["height": Double(height)])
        }
    }

    /// Chooses a tab from the page's side, which does not report a tap back.
    @objc func select(_ call: CAPPluginCall) {
        let id = call.getString("id")
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let bar = self.tabBar, let id = id,
                  let index = self.ids.firstIndex(of: id),
                  let items = bar.items, index < items.count else {
                call.resolve()
                return
            }
            bar.selectedItem = items[index]
            call.resolve()
        }
    }

    /// Steps the bar aside for a sheet, a full screen or the keyboard, and back.
    @objc func setHidden(_ call: CAPPluginCall) {
        let hidden = call.getBool("hidden") ?? false
        DispatchQueue.main.async { [weak self] in
            guard let bar = self?.tabBar else {
                call.resolve()
                return
            }
            bar.isUserInteractionEnabled = !hidden
            UIView.animate(withDuration: 0.2) {
                bar.alpha = hidden ? 0 : 1
            }
            call.resolve()
        }
    }

    public func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        guard item.tag >= 0, item.tag < ids.count else { return }
        notifyListeners("select", data: ["id": ids[item.tag]])
    }

    private func makeTabBar(on host: UIView) -> HeadpinTabBar {
        let bar = HeadpinTabBar()
        bar.delegate = self
        HeadpinTabBarPlugin.letPageShowThrough(bar)
        bar.translatesAutoresizingMaskIntoConstraints = false
        bar.onLayout = { [weak self, weak bar] in
            guard let self = self, let bar = bar else { return }
            let height = self.measuredHeight(of: bar)
            // Only a real change is news: layout runs far more often than that.
            guard abs(height - self.lastHeight) > 0.5 else { return }
            self.lastHeight = height
            self.notifyListeners("layout", data: ["height": Double(height)])
        }
        host.addSubview(bar)
        NSLayoutConstraint.activate([
            bar.leadingAnchor.constraint(equalTo: host.leadingAnchor),
            bar.trailingAnchor.constraint(equalTo: host.trailingAnchor),
            bar.bottomAnchor.constraint(equalTo: host.bottomAnchor)
        ])
        tabBar = bar
        return bar
    }

    /// The page scrolls under the bar, as a screen does under the system's own
    /// tab bar. A bar outside a `UITabBarController` has no scroll view to
    /// watch, so iOS 26 kept a solid ground behind its glass capsule and the
    /// page stopped at a hard edge above it. On iOS 26 and later the ground
    /// goes and the capsule floats over the page, which fades itself out
    /// underneath (`.scroll-edge-bottom`). Before iOS 26 the bar keeps its
    /// translucent blur, which is that iOS's own look over moving content.
    private static func letPageShowThrough(_ bar: UITabBar) {
        let appearance = UITabBarAppearance()
        if #available(iOS 26.0, *) {
            appearance.configureWithTransparentBackground()
        } else {
            appearance.configureWithDefaultBackground()
        }
        bar.standardAppearance = appearance
        bar.scrollEdgeAppearance = appearance
    }

    /// From the top of the bar to the bottom of the screen, which is what the
    /// page has to leave clear whatever the bar's own padding and the home
    /// indicator add to it.
    private func measuredHeight(of bar: UITabBar) -> CGFloat {
        guard let host = bar.superview else { return bar.frame.height }
        return max(0, host.bounds.height - bar.frame.minY)
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

/// A tab bar that says when it has been laid out, so the page hears about a
/// change in its height (a rotation, the home indicator) without asking.
final class HeadpinTabBar: UITabBar {
    var onLayout: (() -> Void)?

    override func layoutSubviews() {
        super.layoutSubviews()
        onLayout?()
    }
}
