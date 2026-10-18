import UIKit
import Capacitor

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
        guard let webView = webView else { return }
        webView.allowsBackForwardNavigationGestures = false
        // The page never scrolls as a whole (its screens scroll inside it), so
        // the rubber band at the top and bottom of the web view only showed
        // the app as a page being dragged about (ADR-160).
        webView.scrollView.bounces = false
        let edge = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(edgeSwiped(_:)))
        edge.edges = .left
        edge.delegate = self
        webView.addGestureRecognizer(edge)
    }

    @objc private func edgeSwiped(_ gesture: UIScreenEdgePanGestureRecognizer) {
        guard gesture.state == .ended, let view = gesture.view else { return }
        // A pull far enough, or quick enough, to mean it; a graze is not back.
        let distance = gesture.translation(in: view).x
        let speed = gesture.velocity(in: view).x
        guard distance > 60 || speed > 500 else { return }
        webView?.evaluateJavaScript("history.back()", completionHandler: nil)
    }

    // The page's own scrolling and taps keep working alongside the edge pan.
    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
        true
    }
}
