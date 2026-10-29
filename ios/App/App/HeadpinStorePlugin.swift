import Foundation
import Capacitor
import StoreKit
import UIKit

/// Headpin Pro, bought and restored through StoreKit 2 (ADR-158), and Apple's
/// rating prompt (ADR-218).
///
/// The app's own plugin rather than a purchase service: Pro is one
/// non-consumable product, Apple's receipt is the only record of it, and no
/// server learns who bought it. The page asks three things: what Pro costs,
/// buy it, and which products this Apple ID owns. `Transaction.currentEntitlements`
/// answers the last from the device's own copy, so it works offline.
@objc(HeadpinStorePlugin)
public class HeadpinStorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HeadpinStorePlugin"
    public let jsName = "HeadpinStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "product", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "entitlements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestReview", returnType: CAPPluginReturnPromise)
    ]

    private var updates: Task<Void, Never>?

    /// Purchases that finish away from a tap (Ask to Buy approved later, a
    /// refund, a purchase on another device) arrive here; the page hears the
    /// new answer as an `entitlements` event.
    public override func load() {
        updates = Task { [weak self] in
            for await result in Transaction.updates {
                if case .verified(let transaction) = result {
                    await transaction.finish()
                }
                await self?.announceEntitlements()
            }
        }
    }

    deinit {
        updates?.cancel()
    }

    /// The product's name and its price in the bowler's own currency, or
    /// nothing when the store does not offer it here.
    @objc func product(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else {
            call.reject("An id is required")
            return
        }
        Task {
            do {
                guard let product = try await Product.products(for: [id]).first else {
                    call.resolve([:])
                    return
                }
                call.resolve(["id": product.id, "name": product.displayName, "price": product.displayPrice])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    /// Buys the product. Resolves with `purchased`, `cancelled` or `pending`
    /// (Ask to Buy, a payment still clearing); only a store failure rejects.
    @objc func purchase(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else {
            call.reject("An id is required")
            return
        }
        Task {
            do {
                CAPLog.print("⚡️  HeadpinStore: looking up \(id)")
                guard let product = try await Product.products(for: [id]).first else {
                    CAPLog.print("⚡️  HeadpinStore: the store offers no product \(id)")
                    call.reject("Headpin Pro is not available from the App Store right now")
                    return
                }
                CAPLog.print("⚡️  HeadpinStore: buying \(product.id) at \(product.displayPrice)")
                switch try await HeadpinStorePlugin.buy(product) {
                case .success(let verification):
                    guard case .verified(let transaction) = verification else {
                        call.reject("The App Store could not verify the purchase")
                        return
                    }
                    await transaction.finish()
                    call.resolve(["status": "purchased"])
                case .userCancelled:
                    call.resolve(["status": "cancelled"])
                case .pending:
                    call.resolve(["status": "pending"])
                @unknown default:
                    call.resolve(["status": "cancelled"])
                }
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    /// Buys the product, asking the active scene to show the App Store's sheet.
    /// From iOS 17 an app built on scenes is meant to name the scene that shows
    /// it; a purchase started with no scene can wait on a sheet that never
    /// comes, which reads as a button that does nothing.
    private static func buy(_ product: Product) async throws -> Product.PurchaseResult {
        if #available(iOS 17.0, *) {
            let scene = await MainActor.run {
                UIApplication.shared.connectedScenes.first { $0.activationState == .foregroundActive }
            }
            if let scene = scene {
                CAPLog.print("⚡️  HeadpinStore: asking the active scene to show the purchase")
                return try await product.purchase(confirmIn: scene)
            }
            CAPLog.print("⚡️  HeadpinStore: no active scene, buying without one")
        }
        return try await product.purchase()
    }

    /// The products this Apple ID owns, from the device's copy of its receipts.
    @objc func entitlements(_ call: CAPPluginCall) {
        Task {
            call.resolve(["ids": await HeadpinStorePlugin.owned()])
        }
    }

    /// Restore purchases: asks the App Store for this Apple ID's receipts
    /// (which may ask the bowler to sign in), then answers as `entitlements`.
    @objc func restore(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
            } catch {
                call.reject(error.localizedDescription)
                return
            }
            call.resolve(["ids": await HeadpinStorePlugin.owned()])
        }
    }

    /// Asks for Apple's rating prompt (ADR-218). The page picks the moment, a
    /// good game just finished; Apple decides whether it shows, at most three
    /// times a year, and never says which. Resolves either way.
    @objc func requestReview(_ call: CAPPluginCall) {
        Task { @MainActor [weak self] in
            if let scene = self?.bridge?.viewController?.view.window?.windowScene {
                if #available(iOS 16.0, *) {
                    AppStore.requestReview(in: scene)
                } else {
                    SKStoreReviewController.requestReview(in: scene)
                }
            }
            call.resolve()
        }
    }

    private static func owned() async -> [String] {
        var ids: [String] = []
        for await result in Transaction.currentEntitlements {
            if case .verified(let transaction) = result, transaction.revocationDate == nil {
                ids.append(transaction.productID)
            }
        }
        return ids
    }

    private func announceEntitlements() async {
        notifyListeners("entitlements", data: ["ids": await HeadpinStorePlugin.owned()])
    }
}
