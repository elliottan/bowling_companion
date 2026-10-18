package app.headpin;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

/**
 * Capacitor's activity, with the back button going through the page's history.
 *
 * Back in Headpin is the page's own history (ADR-041): every screen and sheet
 * is a history entry, and the page closes whatever is on top when one is
 * popped. Left alone, Android's back button would close the whole app from any
 * screen. So it steps back through the web view's history, and only leaves the
 * app from the first entry, as the system back does in a browser tab.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge() == null ? null : getBridge().getWebView();
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                    return;
                }
                // Nothing left to go back to: hand the press to the system,
                // which sends the app to the background.
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);
            }
        });
    }
}
