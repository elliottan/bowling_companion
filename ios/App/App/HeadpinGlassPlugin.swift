import Foundation
import Capacitor
import UIKit

/// The bars' round buttons and segmented controls, drawn by UIKit over the page
/// (ADR-238, `src/lib/nativeGlass.ts`).
///
/// The page cannot draw Liquid Glass: the real material bends what is behind
/// it and swells under a finger, and a web page can only blur. So on iOS 26 and
/// later the page tells this where each of its bar controls sits, and this lays
/// a `UIButton` in the glass configuration, or a `UISegmentedControl`, exactly
/// over it. The page keeps the layout, the state and what a tap does: a tap
/// here goes back to it as `tap`, a new segment as `change`.
///
/// The page shows a control here only while its own sits still and uncovered,
/// and takes it away the moment the page's moves or something covers it, so a
/// view here never has to follow a scroll or a slide.
///
/// These views are pictures of the page's controls, which stay in the page for
/// VoiceOver, so they are hidden from accessibility.
@objc(HeadpinGlassPlugin)
public class HeadpinGlassPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HeadpinGlassPlugin"
    public let jsName = "HeadpinGlass"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "probe", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise)
    ]

    /// Each control on screen or held hidden, by the page's id for it.
    private var views: [String: UIView] = [:]
    /// What kind each is, so a page control that changes kind is remade.
    private var kinds: [String: String] = [:]

    /// Whether this phone draws glass. Before iOS 26 the page's own controls
    /// are the closer match to the rest of that iOS, so it keeps them.
    @objc func probe(_ call: CAPPluginCall) {
        if #available(iOS 26.0, *) {
            call.resolve(["supported": true])
        } else {
            call.resolve(["supported": false])
        }
    }

    /// Puts a control on screen, moves it, restyles it, or hides it.
    @objc func set(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let kind = call.getString("kind") else {
            call.reject("A glass control needs an id and a kind")
            return
        }
        let visible = call.getBool("visible") ?? false
        let frameObject = call.getObject("frame") ?? [:]
        let frame = CGRect(
            x: HeadpinGlassPlugin.number(frameObject["x"]),
            y: HeadpinGlassPlugin.number(frameObject["y"]),
            width: HeadpinGlassPlugin.number(frameObject["width"]),
            height: HeadpinGlassPlugin.number(frameObject["height"])
        )
        let dark = call.getBool("dark") ?? false
        let accent = call.getString("accent").flatMap(HeadpinGlassPlugin.color(fromHex:))
        let enabled = call.getBool("enabled") ?? true

        DispatchQueue.main.async { [weak self] in
            guard let self = self,
                  let host = self.bridge?.viewController?.view,
                  let webView = self.bridge?.webView else {
                call.reject("The glass has no screen to sit on")
                return
            }
            guard #available(iOS 26.0, *) else {
                call.resolve()
                return
            }

            if !visible {
                // Out of the way at once: the page has already put its own back.
                self.views[id]?.isHidden = true
                call.resolve()
                return
            }

            if self.kinds[id] != kind {
                self.views[id]?.removeFromSuperview()
                self.views[id] = nil
            }
            let view: UIView
            if let existing = self.views[id] {
                view = existing
            } else {
                if kind == "segmented" {
                    view = self.makeSegmented(id: id)
                } else {
                    view = self.makeButton(id: id)
                }
                view.isHidden = true
                view.accessibilityElementsHidden = true
                view.isAccessibilityElement = false
                // Over the page and under the tab bar, which this never overlaps.
                host.insertSubview(view, aboveSubview: webView)
                self.views[id] = view
                self.kinds[id] = kind
            }

            view.overrideUserInterfaceStyle = dark ? .dark : .light
            if let accent = accent { view.tintColor = accent }
            // The page's coordinates are the web view's: the same points, from
            // its top left corner.
            view.frame = webView.convert(frame, to: host)

            if let button = view as? HeadpinGlassButton {
                self.style(button, call: call, enabled: enabled, accent: accent)
            } else if let segmented = view as? UISegmentedControl {
                self.style(segmented, call: call, enabled: enabled)
            }

            if view.isHidden {
                view.alpha = 0
                view.isHidden = false
                UIView.animate(withDuration: 0.12) { view.alpha = 1 }
            }
            call.resolve()
        }
    }

    @objc func remove(_ call: CAPPluginCall) {
        let id = call.getString("id")
        DispatchQueue.main.async { [weak self] in
            if let self = self, let id = id {
                self.views[id]?.removeFromSuperview()
                self.views[id] = nil
                self.kinds[id] = nil
            }
            call.resolve()
        }
    }

    // MARK: Buttons

    @available(iOS 26.0, *)
    private func makeButton(id: String) -> HeadpinGlassButton {
        let button = HeadpinGlassButton(type: .system)
        button.glassId = id
        button.clipsToBounds = false
        button.addTarget(self, action: #selector(tapped(_:)), for: .primaryActionTriggered)
        return button
    }

    @available(iOS 26.0, *)
    private func style(_ button: HeadpinGlassButton, call: CAPPluginCall, enabled: Bool, accent: UIColor?) {
        let prominent = call.getBool("prominent") ?? false
        var configuration: UIButton.Configuration = prominent ? .prominentGlass() : .glass()
        configuration.cornerStyle = .capsule
        configuration.contentInsets = .zero
        configuration.preferredSymbolConfigurationForImage = UIImage.SymbolConfiguration(pointSize: 17, weight: .semibold)
        if let symbol = call.getString("symbol"), let image = UIImage(systemName: symbol) {
            configuration.image = image
        } else if let data = call.getString("image"), let image = HeadpinGlassPlugin.image(fromDataURL: data) {
            configuration.image = image
        }
        if prominent {
            configuration.baseForegroundColor = .white
            if let accent = accent { configuration.baseBackgroundColor = accent }
        } else {
            // The glyph in ink, as a bar button's is: on glass the color
            // belongs to the commit.
            configuration.baseForegroundColor = .label
        }
        button.configuration = configuration
        button.isEnabled = enabled
        button.setBadge(call.getString("badge"), color: accent)
    }

    @objc private func tapped(_ sender: HeadpinGlassButton) {
        guard let id = sender.glassId else { return }
        notifyListeners("tap", data: ["id": id])
    }

    // MARK: Segmented controls

    private func makeSegmented(id: String) -> UISegmentedControl {
        let control = UISegmentedControl(items: [])
        control.accessibilityIdentifier = id
        control.addTarget(self, action: #selector(changed(_:)), for: .valueChanged)
        return control
    }

    private func style(_ control: UISegmentedControl, call: CAPPluginCall, enabled: Bool) {
        let options = call.getArray("options", String.self) ?? []
        let same = control.numberOfSegments == options.count &&
            options.enumerated().allSatisfy { control.titleForSegment(at: $0.offset) == $0.element }
        if !same {
            control.removeAllSegments()
            for (index, title) in options.enumerated() {
                control.insertSegment(withTitle: title, at: index, animated: false)
            }
        }
        let selected = call.getInt("selected") ?? -1
        let wanted = selected >= 0 && selected < options.count ? selected : UISegmentedControl.noSegment
        if control.selectedSegmentIndex != wanted { control.selectedSegmentIndex = wanted }
        control.isEnabled = enabled
    }

    @objc private func changed(_ sender: UISegmentedControl) {
        guard let id = sender.accessibilityIdentifier else { return }
        notifyListeners("change", data: ["id": id, "index": sender.selectedSegmentIndex])
    }

    // MARK: Values from the page

    private static func number(_ value: JSValue?) -> CGFloat {
        if let number = value as? NSNumber { return CGFloat(truncating: number) }
        if let double = value as? Double { return CGFloat(double) }
        if let int = value as? Int { return CGFloat(int) }
        return 0
    }

    /// A glyph the page drew, black on clear, tinted here as a template.
    private static func image(fromDataURL text: String) -> UIImage? {
        guard let comma = text.firstIndex(of: ",") else { return nil }
        let base64 = String(text[text.index(after: comma)...])
        guard let data = Data(base64Encoded: base64), let image = UIImage(data: data, scale: 3) else { return nil }
        return image.withRenderingMode(.alwaysTemplate)
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

/// A glass button that knows which page control it draws, and carries a count
/// on its corner (the filters applied) as the page's does.
final class HeadpinGlassButton: UIButton {
    var glassId: String?
    private var badgeLabel: UILabel?

    func setBadge(_ text: String?, color: UIColor?) {
        guard let text = text, !text.isEmpty else {
            badgeLabel?.removeFromSuperview()
            badgeLabel = nil
            return
        }
        let label = badgeLabel ?? UILabel()
        label.text = text
        label.font = .systemFont(ofSize: 11, weight: .bold)
        label.textColor = .white
        label.textAlignment = .center
        label.backgroundColor = color ?? tintColor
        label.layer.cornerRadius = 10
        label.layer.masksToBounds = true
        label.isUserInteractionEnabled = false
        if badgeLabel == nil {
            addSubview(label)
            badgeLabel = label
        }
        setNeedsLayout()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        guard let label = badgeLabel else { return }
        let width = max(20, label.intrinsicContentSize.width + 8)
        // Flush with the top and a little past the trailing edge, as the page
        // draws it.
        label.frame = CGRect(x: bounds.width - width + 4, y: 0, width: width, height: 20)
        bringSubviewToFront(label)
    }
}
