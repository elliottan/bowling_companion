import UIKit
import Capacitor
import WebKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = HeadpinViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)

        // Launched from a Home Screen quick action. The bridge is not up yet,
        // so the address waits as the launch URL, which the page asks for as
        // it starts (`listenForLinks`).
        if let item = connectionOptions.shortcutItem {
            _ = open(item)
        }
    }

    /// A quick action chosen while the app was already running.
    func windowScene(_ windowScene: UIWindowScene, performActionFor shortcutItem: UIApplicationShortcutItem, completionHandler: @escaping (Bool) -> Void) {
        completionHandler(open(shortcutItem))
    }

    /// The Home Screen's quick actions (ADR-168) are listed in Info.plist, each
    /// with the headpin.app address of the screen it opens. They take the same
    /// way in as a shared link (ADR-159): Capacitor hands the address to the
    /// page as an opened URL, and the page turns it into its own route. So the
    /// screens a quick action can reach are the page's to say, as a link's are.
    private func open(_ item: UIApplicationShortcutItem) -> Bool {
        guard let address = item.userInfo?["url"] as? String, let url = URL(string: address) else { return false }
        return ApplicationDelegateProxy.shared.application(UIApplication.shared, open: url, options: [:])
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

/// Capacitor's view controller, with back on the left-edge swipe. Back in
/// Headpin goes through the page's history (ADR-041): every screen and sheet is
/// a history entry, and the page's own `popstate` handling closes one per step.
///
/// WebKit's own swipe (`allowsBackForwardNavigationGestures`) is off: it skips
/// the entries a page adds with `pushState` outside a tap's own event, which is
/// every entry Headpin adds, since they are written from React effects. On a
/// simulator it moved nothing at all. So the swipe here asks the page to go
/// back, exactly as Android's back button does in MainActivity (ADR-157).
///
/// It also registers the app's own Pro purchase plugin, which lives in this
/// target rather than in a package (ADR-158).
class HeadpinViewController: CAPBridgeViewController, UIGestureRecognizerDelegate {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(HeadpinStorePlugin())
        bridge?.registerPluginInstance(HeadpinTabBarPlugin())
        // Seen in the Xcode console at launch: proof that this controller, and
        // not the storyboard's plain one, is the one running.
        CAPLog.print("⚡️  HeadpinViewController: registered HeadpinStore and HeadpinTabBar")
        guard let webView = webView else { return }
        webView.allowsBackForwardNavigationGestures = false
        // The page never scrolls as a whole (its screens scroll inside it), so
        // the rubber band at the top and bottom of the web view only showed
        // the app as a page being dragged about (ADR-160).
        webView.scrollView.bounces = false
        // A long press on a link shows nothing: WebKit's preview of the page
        // behind a link is a browser's, and an app's links are its own (ADR-180).
        webView.allowsLinkPreview = false
        paintBackground(HeadpinViewController.launchBackground)
        // The page says what its background is, and again when its theme changes.
        let content = webView.configuration.userContentController
        content.add(BackgroundMessageHandler { [weak self] css, followsPhone in
            guard let color = HeadpinViewController.color(fromCSS: css) else { return }
            self?.paintBackground(color)
            self?.followTheme(of: color, followsPhone: followsPhone)
        }, name: "headpinBackground")
        content.addUserScript(WKUserScript(
            source: HeadpinViewController.backgroundScript,
            injectionTime: .atDocumentEnd,
            forMainFrameOnly: true
        ))
        let edge = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(edgeSwiped(_:)))
        edge.edges = .left
        edge.delegate = self
        webView.addGestureRecognizer(edge)
    }

    /// What the native view behind the web view is painted until the page says
    /// otherwise: the dark or the light theme's background, by the phone's own
    /// setting, which is what the page follows unless the bowler chose a theme.
    private static let launchBackground = UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 15 / 255, green: 23 / 255, blue: 42 / 255, alpha: 1)
            : UIColor(red: 255 / 255, green: 248 / 255, blue: 237 / 255, alpha: 1)
    }

    /// Reports the page's background color, now and whenever its theme changes,
    /// and whether the bowler left the theme on System (no "theme" stored).
    /// `--color-surface-sunken` is the app's background in both themes, and is
    /// set before the first paint, so a poll for the first few seconds only
    /// covers the stylesheet arriving late.
    private static let backgroundScript = """
    (function () {
      var last = "";
      function followsPhone() {
        try { return !localStorage.getItem("theme"); } catch (e) { return true; }
      }
      function post() {
        var v = getComputedStyle(document.documentElement).getPropertyValue("--color-surface-sunken").trim();
        var phone = followsPhone();
        if (!v || v + phone === last) return;
        last = v + phone;
        window.webkit.messageHandlers.headpinBackground.postMessage({ color: "rgb(" + v.replace(/ +/g, ",") + ")", followsPhone: phone });
      }
      post();
      new MutationObserver(post).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      var tries = 0;
      var timer = setInterval(function () { post(); if (++tries > 20) clearInterval(timer); }, 250);
    })();
    """

    /// The native view shows wherever the page does not reach: below a page the
    /// keyboard has shrunk, and under the translucent status bar, where iOS blurs
    /// it into a fade. Painted once from `capacitor.config.ts` in the light
    /// theme's cream, it showed as a white band behind the keys and a gray
    /// haze behind the clock on a dark page. So it takes the page's own color.
    private func paintBackground(_ color: UIColor) {
        view.backgroundColor = color
        webView?.scrollView.backgroundColor = color
        webView?.underPageBackgroundColor = color
    }

    /// The app's theme is the page's, which a bowler can set apart from the
    /// phone's (ADR-168). The window takes it, so everything the system draws
    /// for the app matches the page rather than the phone: the status bar's
    /// clock, the keyboard, the share sheet, the App Store's purchase sheet and
    /// any alert. Read from the page's own background, which the page already
    /// reports, so there is no second message to keep in step.
    ///
    /// On System the window holds no theme of its own. The web view reads the
    /// phone's setting through the window, so a window still held to Light
    /// after the bowler went back to System told the page the phone was light,
    /// and the page stayed light on a dark phone.
    private func followTheme(of background: UIColor, followsPhone: Bool) {
        var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
        guard background.getRed(&red, green: &green, blue: &blue, alpha: &alpha) else { return }
        let luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
        let style: UIUserInterfaceStyle = followsPhone ? .unspecified : luminance < 0.5 ? .dark : .light
        guard let window = view.window, window.overrideUserInterfaceStyle != style else { return }
        window.overrideUserInterfaceStyle = style
        setNeedsStatusBarAppearanceUpdate()
    }

    /// `rgb(15, 23, 42)` or `rgba(15, 23, 42, 1)`, as `getComputedStyle` gives
    /// it. A transparent color answers nothing, so the last paint stays.
    private static func color(fromCSS css: String) -> UIColor? {
        let numbers = css
            .components(separatedBy: CharacterSet(charactersIn: "0123456789.").inverted)
            .filter { !$0.isEmpty }
            .compactMap { Double($0) }
        guard numbers.count >= 3 else { return nil }
        let alpha = numbers.count >= 4 ? numbers[3] : 1
        guard alpha > 0 else { return nil }
        return UIColor(red: numbers[0] / 255, green: numbers[1] / 255, blue: numbers[2] / 255, alpha: 1)
    }

    @objc private func edgeSwiped(_ gesture: UIScreenEdgePanGestureRecognizer) {
        guard let view = gesture.view else { return }
        let distance = gesture.translation(in: view).x
        switch gesture.state {
        case .began, .changed:
            // The screen in front follows the finger, as a native pop does.
            let x = max(0, distance)
            webView?.evaluateJavaScript(
                "window.dispatchEvent(new CustomEvent('headpin:back-drag', { detail: \(x) }))",
                completionHandler: nil
            )
        case .ended:
            // Past halfway, or flicked toward the trailing edge, means back; a
            // graze, or a pull carried back toward the edge, is not.
            let speed = gesture.velocity(in: view).x
            let back = speed > 500 || (distance > view.bounds.width / 2 && speed > -100)
            // The page slides its screen out from where the finger left it and
            // then steps history back, as its own chevron does; a bare
            // `history.back()` unmounted the screen with no motion.
            let event = back ? "headpin:back" : "headpin:back-cancel"
            webView?.evaluateJavaScript("window.dispatchEvent(new Event('\(event)'))", completionHandler: nil)
        case .cancelled, .failed:
            webView?.evaluateJavaScript("window.dispatchEvent(new Event('headpin:back-cancel'))", completionHandler: nil)
        default:
            break
        }
    }

    // The page's own scrolling and taps keep working alongside the edge pan.
    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
        true
    }
}

/// Hands a message from the page to a closure. The web view holds its message
/// handlers, so a handler that held the view controller back would keep both
/// alive; the closure holds it weakly instead.
private final class BackgroundMessageHandler: NSObject, WKScriptMessageHandler {
    private let onColor: (String, Bool) -> Void

    init(_ onColor: @escaping (String, Bool) -> Void) {
        self.onColor = onColor
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let css = body["color"] as? String else { return }
        onColor(css, body["followsPhone"] as? Bool ?? true)
    }
}
