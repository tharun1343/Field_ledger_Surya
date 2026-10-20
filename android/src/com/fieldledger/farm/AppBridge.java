package com.fieldledger.farm;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;

/** JavaScript interface exposed to the web app as window.FieldLedgerAndroid. */
public class AppBridge {
    private final MainActivity activity;
    private final WebView web;
    private final Updater updater;

    AppBridge(MainActivity activity, WebView web, Updater updater) {
        this.activity = activity;
        this.web = web;
        this.updater = updater;
    }

    @JavascriptInterface
    public String getAppInfo() {
        try {
            JSONObject o = new JSONObject();
            o.put("versionName", updater.versionName());
            o.put("versionCode", updater.versionCode());
            o.put("lastCheck", updater.lastCheck());
            o.put("android", Build.VERSION.RELEASE);
            return o.toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    /** Saves an export. Images go to Pictures/FieldLedger (Gallery); everything else to Download/FieldLedger. */
    @JavascriptInterface
    public String saveFile(String name, String mime, String base64) {
        String safe = safeName(name);
        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            boolean image = mime != null && mime.startsWith("image/");
            if (Build.VERSION.SDK_INT >= 29) {
                ContentResolver cr = activity.getContentResolver();
                ContentValues v = new ContentValues();
                v.put("_display_name", safe);
                v.put("mime_type", mime == null ? "application/octet-stream" : mime);
                v.put("relative_path", (image ? Environment.DIRECTORY_PICTURES : Environment.DIRECTORY_DOWNLOADS) + "/FieldLedger");
                v.put("is_pending", 1);
                Uri collection = image ? MediaStore.Images.Media.EXTERNAL_CONTENT_URI : Uri.parse("content://media/external/downloads");
                Uri item = cr.insert(collection, v);
                if (item == null) throw new IllegalStateException("storage refused the file");
                OutputStream out = cr.openOutputStream(item);
                try { out.write(bytes); } finally { out.close(); }
                ContentValues done = new ContentValues();
                done.put("is_pending", 0);
                cr.update(item, done, null, null);
                return image ? "Saved to Gallery (Pictures/FieldLedger/" + safe + ")." : "Saved to Downloads/FieldLedger/" + safe + ".";
            }
            // Android 7–9: keep a copy in the app's export folder and open the share sheet so it can be saved anywhere.
            File dir = new File(activity.getCacheDir(), "exports");
            if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("cannot create export folder");
            File f = new File(dir, safe);
            FileOutputStream fos = new FileOutputStream(f);
            try { fos.write(bytes); } finally { fos.close(); }
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mime == null ? "application/octet-stream" : mime);
            send.putExtra(Intent.EXTRA_STREAM, Uri.parse("content://" + FilesProvider.AUTHORITY + "/exports/" + Uri.encode(safe)));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(Intent.createChooser(send, "Save or share " + safe).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            return "Choose where to save " + safe + ".";
        } catch (Exception e) {
            return "Could not save " + safe + ": " + e.getMessage();
        }
    }

    /** Opens Android's print dialog for the current statement (choose "Save as PDF"). */
    @JavascriptInterface
    public void print(final String jobName) {
        activity.runOnUiThread(new Runnable() {
            @Override public void run() {
                try {
                    PrintManager pm = (PrintManager) activity.getSystemService(Context.PRINT_SERVICE);
                    final PrintDocumentAdapter inner = web.createPrintDocumentAdapter(jobName);
                    PrintDocumentAdapter wrapper = new PrintDocumentAdapter() {
                        @Override public void onStart() { inner.onStart(); }
                        @Override public void onLayout(PrintAttributes o, PrintAttributes n, CancellationSignal c, LayoutResultCallback cb, Bundle b) { inner.onLayout(o, n, c, cb, b); }
                        @Override public void onWrite(PageRange[] p, ParcelFileDescriptor d, CancellationSignal c, WriteResultCallback cb) { inner.onWrite(p, d, c, cb); }
                        @Override public void onFinish() { inner.onFinish(); activity.sendEvent("print-finished", ""); }
                    };
                    PrintAttributes attrs = new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4.asLandscape()).build();
                    pm.print(jobName, wrapper, attrs);
                } catch (Exception e) {
                    activity.sendEvent("print-finished", "");
                }
            }
        });
    }

    @JavascriptInterface
    public void setThemeColor(final String hex, final boolean dark) {
        activity.runOnUiThread(new Runnable() {
            @Override public void run() {
                try {
                    int c = Color.parseColor(hex);
                    activity.getWindow().setStatusBarColor(c);
                    activity.getWindow().setNavigationBarColor(dark ? Color.parseColor("#111018") : Color.parseColor("#f5f5fb"));
                    View decor = activity.getWindow().getDecorView();
                    int flags = decor.getSystemUiVisibility() & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                    if (!dark && Build.VERSION.SDK_INT >= 26) flags |= 0x00000010; // SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
                    else flags &= ~0x00000010;
                    decor.setSystemUiVisibility(flags);
                    web.setBackgroundColor(dark ? Color.parseColor("#111018") : Color.parseColor("#f5f5fb"));
                } catch (Exception ignored) { }
            }
        });
    }

    @JavascriptInterface
    public void checkForUpdates(boolean manual) {
        updater.check(manual);
    }

    @JavascriptInterface
    public void startUpdate() { activity.runOnUiThread(new Runnable() { @Override public void run() { updater.start(); } }); }

    @JavascriptInterface
    public void cancelUpdate() { updater.cancel(); }

    @JavascriptInterface
    public void openInstallPermission() { activity.runOnUiThread(new Runnable() { @Override public void run() { updater.openInstallPermission(); } }); }

    /** kind = "backup" (JSON text) or "image" (camera or gallery, returned as a small JPEG). Result: event "file-picked". */
    @JavascriptInterface
    public void pickFile(String kind) { activity.pickFile("image".equals(kind) ? "image" : "backup"); }

    // Bill photos: app-private storage files/bills/<id>.jpg (removed with the app, included in JSON backups).
    private File billFile(String id) {
        if (id == null || !id.matches("[A-Za-z0-9_-]{4,60}")) throw new IllegalArgumentException("bad photo id");
        File dir = new File(activity.getFilesDir(), "bills");
        if (!dir.exists()) dir.mkdirs();
        return new File(dir, id + ".jpg");
    }

    @JavascriptInterface
    public String putFile(String id, String base64) {
        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            if (bytes.length == 0 || bytes.length > 12 * 1024 * 1024) return "photo is empty or too large";
            FileOutputStream out = new FileOutputStream(billFile(id));
            try { out.write(bytes); } finally { out.close(); }
            return "ok";
        } catch (Exception e) { return "could not store the photo: " + e.getMessage(); }
    }

    @JavascriptInterface
    public String getFile(String id) {
        try {
            File f = billFile(id);
            if (!f.isFile()) return "";
            byte[] b = new byte[(int) f.length()];
            FileInputStream in = new FileInputStream(f);
            try { int off = 0, n; while (off < b.length && (n = in.read(b, off, b.length - off)) > 0) off += n; } finally { in.close(); }
            return Base64.encodeToString(b, Base64.NO_WRAP);
        } catch (Exception e) { return ""; }
    }

    @JavascriptInterface
    public void deleteFile(String id) { try { billFile(id).delete(); } catch (Exception ignored) { } }

    static String safeName(String name) {
        String n = name == null ? "" : name.replaceAll("[^A-Za-z0-9._-]", "_");
        while (n.startsWith(".")) n = n.substring(1);
        if (n.isEmpty()) n = "fieldledger-export";
        return n.length() > 100 ? n.substring(n.length() - 100) : n;
    }
}
