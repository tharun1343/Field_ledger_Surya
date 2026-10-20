package com.fieldledger.farm;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;

/** Hosts the FieldLedger web app (assets/www/index.html) in a WebView. */
public class MainActivity extends Activity {
    static final String APP_URL = "file:///android_asset/www/index.html";
    private static final int REQ_FILE = 41;
    private static final int REQ_PICK = 42;
    private static final long MAX_PICK_BYTES = 60L * 1024 * 1024;
    private String pickKind = "backup";
    private File captureFile;

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

        updater = new Updater(this);
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

    /** Native picker: backups are read as text; photos come from the camera or gallery and are shrunk to ≤1600 px JPEG. */
    void pickFile(final String kind) {
        runOnUiThread(new Runnable() {
            @Override public void run() {
                pickKind = kind; captureFile = null;
                try {
                    Intent get = new Intent(Intent.ACTION_GET_CONTENT);
                    get.addCategory(Intent.CATEGORY_OPENABLE);
                    Intent chooser;
                    if ("image".equals(kind)) {
                        get.setType("image/*");
                        chooser = Intent.createChooser(get, "Add bill photo");
                        try {
                            File dir = new File(getCacheDir(), "captures");
                            if (!dir.exists()) dir.mkdirs();
                            File[] old = dir.listFiles();
                            if (old != null) for (File f : old) f.delete();
                            captureFile = new File(dir, "bill-" + System.currentTimeMillis() + ".jpg");
                            captureFile.createNewFile();
                            Uri out = Uri.parse("content://" + FilesProvider.AUTHORITY + "/captures/" + captureFile.getName());
                            Intent cam = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                            cam.putExtra(MediaStore.EXTRA_OUTPUT, out);
                            cam.setClipData(ClipData.newRawUri("", out));
                            cam.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                            chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[] { cam });
                        } catch (Exception e) { captureFile = null; }
                    } else {
                        get.setType("*/*");
                        chooser = Intent.createChooser(get, "Choose your FieldLedger backup (.json)");
                    }
                    startActivityForResult(chooser, REQ_PICK);
                } catch (Exception e) {
                    sendPicked(kind, "error", "Could not open the file picker on this phone.");
                }
            }
        });
    }

    private void sendPicked(String kind, String key, Object value) {
        try { JSONObject o = new JSONObject(); o.put("kind", kind); if (key != null) o.put(key, value); sendEvent("file-picked", o.toString()); } catch (Exception ignored) { }
    }

    private String displayName(Uri uri) {
        Cursor c = null;
        try {
            c = getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null);
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception ignored) {
        } finally { if (c != null) c.close(); }
        String last = uri.getLastPathSegment();
        return last == null ? "file" : last;
    }

    private File copyToCache(InputStream in, String name) throws Exception {
        File f = new File(getCacheDir(), name);
        FileOutputStream out = new FileOutputStream(f);
        try {
            byte[] buf = new byte[64 * 1024]; long total = 0; int n;
            while ((n = in.read(buf)) > 0) { total += n; if (total > MAX_PICK_BYTES) throw new IllegalStateException("The file is larger than 60 MB."); out.write(buf, 0, n); }
        } finally { out.close(); in.close(); }
        return f;
    }

    private String photoDataUrl(File src) throws Exception {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(src.getPath(), bounds);
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw new IllegalStateException("That file is not a photo.");
        int sample = 1;
        while (Math.max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= 1600) sample *= 2;
        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inSampleSize = sample;
        Bitmap bmp = BitmapFactory.decodeFile(src.getPath(), opts);
        if (bmp == null) throw new IllegalStateException("This photo could not be opened.");
        int rotate = 0;
        try {
            int o = new ExifInterface(src.getPath()).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            rotate = o == ExifInterface.ORIENTATION_ROTATE_90 ? 90 : o == ExifInterface.ORIENTATION_ROTATE_180 ? 180 : o == ExifInterface.ORIENTATION_ROTATE_270 ? 270 : 0;
        } catch (Exception ignored) { }
        float k = Math.min(1f, 1600f / Math.max(bmp.getWidth(), bmp.getHeight()));
        Matrix m = new Matrix();
        if (k < 1f) m.postScale(k, k);
        if (rotate != 0) m.postRotate(rotate);
        Bitmap out = (k < 1f || rotate != 0) ? Bitmap.createBitmap(bmp, 0, 0, bmp.getWidth(), bmp.getHeight(), m, true) : bmp;
        ByteArrayOutputStream jpg = new ByteArrayOutputStream();
        out.compress(Bitmap.CompressFormat.JPEG, 74, jpg);
        if (out != bmp) out.recycle();
        bmp.recycle();
        return "data:image/jpeg;base64," + Base64.encodeToString(jpg.toByteArray(), Base64.NO_WRAP);
    }

    private void handlePicked(final int resultCode, final Intent data) {
        final String kind = pickKind;
        final File cap = captureFile;
        captureFile = null;
        final Uri picked = resultCode == RESULT_OK && data != null ? data.getData() : null;
        final boolean fromCamera = picked == null && resultCode == RESULT_OK && cap != null && cap.isFile() && cap.length() > 0;
        if (picked == null && !fromCamera) { if (cap != null) cap.delete(); sendPicked(kind, "cancelled", true); return; }
        new Thread(new Runnable() {
            @Override public void run() {
                File tmp = null;
                try {
                    if ("image".equals(kind)) {
                        tmp = fromCamera ? cap : copyToCache(getContentResolver().openInputStream(picked), "pick-photo.tmp");
                        JSONObject o = new JSONObject(); o.put("kind", kind); o.put("dataUrl", photoDataUrl(tmp));
                        sendEvent("file-picked", o.toString());
                    } else {
                        tmp = copyToCache(getContentResolver().openInputStream(picked), "pick-backup.tmp");
                        byte[] b = new byte[(int) tmp.length()];
                        FileInputStream in = new FileInputStream(tmp);
                        try { int off = 0, n; while (off < b.length && (n = in.read(b, off, b.length - off)) > 0) off += n; } finally { in.close(); }
                        JSONObject o = new JSONObject(); o.put("kind", kind); o.put("name", displayName(picked)); o.put("text", new String(b, "UTF-8"));
                        sendEvent("file-picked", o.toString());
                    }
                } catch (Exception e) {
                    String m = e.getMessage();
                    sendPicked(kind, "error", ("image".equals(kind) ? "Could not add that photo" : "Could not read that file") + (m == null || m.isEmpty() ? "." : ": " + m));
                } finally {
                    if (tmp != null) tmp.delete();
                }
            }
        }).start();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_PICK) { handlePicked(resultCode, data); return; }
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
