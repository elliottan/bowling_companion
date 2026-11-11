package app.headpin;

import android.app.Activity;
import androidx.annotation.NonNull;
import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.review.ReviewManager;
import com.google.android.play.core.review.ReviewManagerFactory;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Headpin Pro, bought and restored through Google Play Billing, and Play's
 * rating prompt (ADR-277). The Android twin of
 * {@code ios/App/App/HeadpinStorePlugin.swift} (ADR-158): the same name, the
 * same methods and the same answers, so the page cannot tell them apart.
 *
 * The app's own plugin rather than a purchase service, for the same reason as
 * on iOS: Pro is one one-time product, Google's purchase record is the only
 * record of it, and no server learns who bought it. Play answers ownership
 * from the Play Store's own copy of the account's purchases, so it works
 * offline once the Play Store has seen them.
 */
@CapacitorPlugin(name = "HeadpinStore")
public class HeadpinStorePlugin extends Plugin {

    private static final String TAG = "HeadpinStore";

    private BillingClient billing;
    /** Work waiting for the connection to Play to come up. */
    private final List<Runnable> waiting = new ArrayList<>();
    private boolean connecting = false;
    /** The purchase the page is waiting on: Play answers it in
     *  {@link #onPurchasesUpdated}, away from the call that started it. */
    private PluginCall purchaseCall;

    @Override
    public void load() {
        billing = BillingClient.newBuilder(getContext())
            .setListener(this::onPurchasesUpdated)
            // A purchase paid in cash at a shop, say, waits as pending; the
            // page shows "Waiting for approval" until Play says it cleared.
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .enableAutoServiceReconnection()
            .build();
    }

    @Override
    protected void handleOnDestroy() {
        if (billing != null) billing.endConnection();
    }

    /** Runs {@code work} once Play is connected, or reports why it is not. */
    private void whenConnected(Runnable work, PluginCall call) {
        if (billing.isReady()) {
            work.run();
            return;
        }
        synchronized (waiting) {
            waiting.add(() -> {
                if (billing.isReady()) work.run();
                else call.reject("Google Play is not available right now");
            });
            if (connecting) return;
            connecting = true;
        }
        billing.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(@NonNull BillingResult result) {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    Logger.warn(TAG, "Play Billing did not connect: " + result.getDebugMessage());
                }
                drain();
            }

            @Override
            public void onBillingServiceDisconnected() {
                // The next call reconnects (enableAutoServiceReconnection).
                drain();
            }
        });
    }

    private void drain() {
        List<Runnable> ready;
        synchronized (waiting) {
            connecting = false;
            ready = new ArrayList<>(waiting);
            waiting.clear();
        }
        for (Runnable r : ready) r.run();
    }

    /** The product's name and its price in the bowler's own currency, or
     *  nothing when Play does not offer it here. */
    @PluginMethod
    public void product(PluginCall call) {
        String id = call.getString("id");
        if (id == null) {
            call.reject("An id is required");
            return;
        }
        whenConnected(() -> details(id, call, (product) -> {
            JSObject out = new JSObject();
            if (product != null) {
                out.put("id", product.getProductId());
                out.put("name", product.getName());
                ProductDetails.OneTimePurchaseOfferDetails offer = product.getOneTimePurchaseOfferDetails();
                if (offer != null) out.put("price", offer.getFormattedPrice());
            }
            call.resolve(out);
        }), call);
    }

    /** Buys the product. Resolves with {@code purchased}, {@code cancelled} or
     *  {@code pending}; only a store failure rejects. */
    @PluginMethod
    public void purchase(PluginCall call) {
        String id = call.getString("id");
        if (id == null) {
            call.reject("An id is required");
            return;
        }
        if (purchaseCall != null) {
            call.reject("A purchase is already open");
            return;
        }
        whenConnected(() -> details(id, call, (product) -> {
            if (product == null) {
                Logger.warn(TAG, "Play offers no product " + id);
                call.reject("Headpin Pro is not available from Google Play right now");
                return;
            }
            Activity activity = getActivity();
            BillingFlowParams params = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(Collections.singletonList(
                    BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(product).build()))
                .build();
            call.setKeepAlive(true);
            purchaseCall = call;
            activity.runOnUiThread(() -> {
                BillingResult launched = billing.launchBillingFlow(activity, params);
                int code = launched.getResponseCode();
                if (code == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) {
                    // Bought already, on this account: say so as a purchase,
                    // and let the page hear the receipt.
                    finishPurchase("purchased", null);
                    announceEntitlements();
                } else if (code != BillingClient.BillingResponseCode.OK) {
                    finishPurchase(null, launched.getDebugMessage());
                }
            });
        }), call);
    }

    /** Play's answer to the purchase sheet, and to purchases that finish away
     *  from it (a pending payment that clears later). */
    private void onPurchasesUpdated(@NonNull BillingResult result, List<Purchase> purchases) {
        int code = result.getResponseCode();
        if (code == BillingClient.BillingResponseCode.OK && purchases != null) {
            boolean bought = false;
            boolean pending = false;
            for (Purchase p : purchases) {
                if (p.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                    acknowledge(p);
                    bought = true;
                } else if (p.getPurchaseState() == Purchase.PurchaseState.PENDING) {
                    pending = true;
                }
            }
            finishPurchase(bought ? "purchased" : pending ? "pending" : "cancelled", null);
            announceEntitlements();
        } else if (code == BillingClient.BillingResponseCode.USER_CANCELED) {
            finishPurchase("cancelled", null);
        } else if (code == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) {
            finishPurchase("purchased", null);
            announceEntitlements();
        } else {
            finishPurchase(null, result.getDebugMessage());
        }
    }

    /** Settles the page's open purchase, if there is one: a status, or a
     *  failure with Play's reason. */
    private void finishPurchase(String status, String failure) {
        PluginCall call = purchaseCall;
        purchaseCall = null;
        if (call == null) return;
        call.setKeepAlive(false);
        if (status != null) {
            JSObject out = new JSObject();
            out.put("status", status);
            call.resolve(out);
        } else {
            call.reject(failure == null || failure.isEmpty() ? "Google Play could not complete the purchase" : failure);
        }
    }

    /** Play refunds a purchase nobody acknowledges within three days, so every
     *  completed one is acknowledged as soon as the app sees it. */
    private void acknowledge(Purchase p) {
        if (p.isAcknowledged()) return;
        billing.acknowledgePurchase(
            AcknowledgePurchaseParams.newBuilder().setPurchaseToken(p.getPurchaseToken()).build(),
            (result) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    Logger.warn(TAG, "Could not acknowledge a purchase: " + result.getDebugMessage());
                }
            });
    }

    /** The products this Google account owns. */
    @PluginMethod
    public void entitlements(PluginCall call) {
        whenConnected(() -> owned(call), call);
    }

    /** Restore purchases. Play keeps no separate restore: asking for the
     *  account's purchases asks Play itself when there is a connection. */
    @PluginMethod
    public void restore(PluginCall call) {
        whenConnected(() -> owned(call), call);
    }

    /** Asks for Play's rating prompt (ADR-218, ADR-277). Play decides whether
     *  it shows and never says which; this resolves either way. */
    @PluginMethod
    public void requestReview(PluginCall call) {
        Activity activity = getActivity();
        ReviewManager manager = ReviewManagerFactory.create(getContext());
        manager.requestReviewFlow().addOnCompleteListener((request) -> {
            if (!request.isSuccessful()) {
                call.resolve();
                return;
            }
            manager.launchReviewFlow(activity, request.getResult()).addOnCompleteListener((shown) -> call.resolve());
        });
    }

    private interface DetailsAnswer {
        void answer(ProductDetails product);
    }

    private void details(String id, PluginCall call, DetailsAnswer then) {
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
            .setProductList(Collections.singletonList(
                QueryProductDetailsParams.Product.newBuilder()
                    .setProductId(id)
                    .setProductType(BillingClient.ProductType.INAPP)
                    .build()))
            .build();
        billing.queryProductDetailsAsync(params, (result, found) -> {
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                call.reject(result.getDebugMessage().isEmpty() ? "Google Play did not answer" : result.getDebugMessage());
                return;
            }
            List<ProductDetails> list = found.getProductDetailsList();
            then.answer(list.isEmpty() ? null : list.get(0));
        });
    }

    private void owned(PluginCall call) {
        queryOwned((ids, failure) -> {
            if (ids == null) {
                call.reject(failure);
                return;
            }
            JSObject out = new JSObject();
            out.put("ids", ids);
            call.resolve(out);
        });
    }

    private interface OwnedAnswer {
        void answer(JSArray ids, String failure);
    }

    /** The account's completed purchases, acknowledging any the app has not
     *  yet (one bought while the app was closed). Pending ones own nothing. */
    private void queryOwned(OwnedAnswer then) {
        billing.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(),
            (result, purchases) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    then.answer(null, result.getDebugMessage().isEmpty() ? "Google Play did not answer" : result.getDebugMessage());
                    return;
                }
                JSArray ids = new JSArray();
                for (Purchase p : purchases) {
                    if (p.getPurchaseState() != Purchase.PurchaseState.PURCHASED) continue;
                    acknowledge(p);
                    for (String product : p.getProducts()) ids.put(product);
                }
                then.answer(ids, null);
            });
    }

    private void announceEntitlements() {
        if (!billing.isReady()) return;
        queryOwned((ids, failure) -> {
            if (ids == null) return;
            JSObject data = new JSObject();
            data.put("ids", ids);
            notifyListeners("entitlements", data);
        });
    }
}
