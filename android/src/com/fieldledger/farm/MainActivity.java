package com.fieldledger.farm;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** Hosts the FieldLedger web app (assets/www/index.html) in a WebView. */
public class MainActivity extends Activity {
    static final String APP_URL = "file:///android_asset/www/index.html";
    private static final int REQ_FILE = 41;

    private WebView web;
    private Updater updater;
    private ValueCallback<Uri[]> fileCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.parseColor("#6d45d9"));

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#f5f5fb"));
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);        // localStorage holds the ledger
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setTextZoom(100);                  // the app has its own text-size setting
        s.setSupportZoom(false);
        s.setMediaPlaybackRequiresUserGesture(true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url.startsWith("file:///android_asset/")) return false;
                // Anything else (help links etc.) opens in the phone's browser, never inside the app.
                try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception ignored) { }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
                    pick.addCategory(Intent.CATEGORY_OPENABLE);
                    pick.setType("*/*");
                    startActivityForResult(Intent.createChooser(pick, "Choose FieldLedger backup (.json)"), REQ_FILE);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        updater = new Updater(this, web);
        web.addJavascriptInterface(new AppBridge(this, web, updater), "FieldLedgerAndroid");

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(APP_URL);

        updater.autoCheck();
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("(window.FieldLedgerBack && window.FieldLedgerBack()) ? '1' : '0'", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String handled) {
                if ("\"1\"".equals(handled)) return;
                if (web.canGoBack()) web.goBack();
                else MainActivity.super.onBackPressed();
            }
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE) {
            if (fileCallback != null) {
                Uri[] result = null;
                if (resultCode == RESULT_OK && data != null && data.getData() != null) result = new Uri[] { data.getData() };
                fileCallback.onReceiveValue(result);
                fileCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        updater.onResume();
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    /** Sends an event to the web app (window.FieldLedgerNativeEvent). Safe to call from any thread. */
    void sendEvent(final String name, final String data) {
        runOnUiThread(new Runnable() {
            @Override public void run() {
                web.evaluateJavascript("window.FieldLedgerNativeEvent && window.FieldLedgerNativeEvent("
                        + org.json.JSONObject.quote(name) + "," + org.json.JSONObject.quote(data == null ? "" : data) + ")", null);
            }
        });
    }
}
