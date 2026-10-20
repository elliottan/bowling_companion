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
        guard let webView = webView else { return }
        webView.allowsBackForwardNavigationGestures = false
        // The page never scrolls as a whole (its screens scroll inside it), so
        // the rubber band at the top and bottom of the web view only showed
        // the app as a page being dragged about (ADR-160).
        webView.scrollView.bounces = false
        paintBackground(HeadpinViewController.launchBackground)
        // The page says what its background is, and again when its theme changes.
        let content = webView.configuration.userContentController
        content.add(BackgroundMessageHandler { [weak self] css in
            if let color = HeadpinViewController.color(fromCSS: css) { self?.paintBackground(color) }
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

    /// Reports the page's background color, now and whenever its theme changes.
    /// `--color-surface-sunken` is the app's background in both themes, and is
    /// set before the first paint, so a poll for the first few seconds only
    /// covers the stylesheet arriving late.
    private static let backgroundScript = """
    (function () {
      var last = "";
      function post() {
        var v = getComputedStyle(document.documentElement).getPropertyValue("--color-surface-sunken").trim();
        if (!v || v === last) return;
        last = v;
        window.webkit.messageHandlers.headpinBackground.postMessage("rgb(" + v.replace(/ +/g, ",") + ")");
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
        guard gesture.state == .ended, let view = gesture.view else { return }
        // A pull far enough, or quick enough, to mean it; a graze is not back.
        let distance = gesture.translation(in: view).x
        let speed = gesture.velocity(in: view).x
        guard distance > 60 || speed > 500 else { return }
        // The page slides its screen out and then steps history back, as its own
        // chevron does; a bare `history.back()` unmounted the screen with no motion.
        webView?.evaluateJavaScript("window.dispatchEvent(new Event('headpin:back'))", completionHandler: nil)
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
    private let onColor: (String) -> Void

    init(_ onColor: @escaping (String) -> Void) {
        self.onColor = onColor
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if let css = message.body as? String { onColor(css) }
    }
}
