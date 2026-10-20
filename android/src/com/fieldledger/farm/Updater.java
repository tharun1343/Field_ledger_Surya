package com.fieldledger.farm;

import android.app.AlertDialog;
import android.app.ProgressDialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.text.DateFormat;
import java.util.Date;

/**
 * In-app updater.
 *
 * Reads a small JSON manifest from an HTTPS URL:
 *   { "versionCode": 211, "versionName": "2.1.1", "apkUrl": "https://…/FieldLedger-2.1.1.apk",
 *     "sha256": "<hex>", "size": 123456, "notes": "What changed" }
 * If versionCode is newer than the installed app, it offers the update, downloads the APK into the
 * app cache, checks the SHA-256 and that the APK is FieldLedger with a higher version, and then hands
 * it to Android's package installer. Android itself refuses the update unless it is signed with the
 * same key as the installed app, and app data (the ledger) is kept across updates.
 */
class Updater {
    private static final String PREFS = "fieldledger-updater";
    private static final long AUTO_INTERVAL_MS = 12L * 60 * 60 * 1000;
    private static final long MAX_APK_BYTES = 150L * 1024 * 1024;

    private final MainActivity act;
    private final SharedPreferences prefs;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private volatile boolean checking = false;
    private volatile boolean cancelDownload = false;
    private File pendingInstall;

    Updater(MainActivity act, WebView web) {
        this.act = act;
        this.prefs = act.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // ------------------------------------------------------------------ info
    int versionCode() {
        try { return act.getPackageManager().getPackageInfo(act.getPackageName(), 0).versionCode; } catch (Exception e) { return 0; }
    }

    String versionName() {
        try { return act.getPackageManager().getPackageInfo(act.getPackageName(), 0).versionName; } catch (Exception e) { return "?"; }
    }

    String getUpdateUrl() {
        return prefs.getString("updateUrl", Config.UPDATE_URL);
    }

    String setUpdateUrl(String url) {
        String u = url == null ? "" : url.trim();
        if (u.isEmpty()) { prefs.edit().remove("updateUrl").apply(); return "Update source reset to the default."; }
        if (!u.startsWith("https://")) return "The update URL must start with https://";
        prefs.edit().putString("updateUrl", u).apply();
        return "Update source saved.";
    }

    String lastCheckLabel() {
        long t = prefs.getLong("lastCheck", 0);
        return t == 0 ? "" : DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(new Date(t));
    }

    // ------------------------------------------------------------------ check
    void autoCheck() {
        long last = prefs.getLong("lastCheck", 0);
        if (System.currentTimeMillis() - last < AUTO_INTERVAL_MS) return;
        ui.postDelayed(new Runnable() { @Override public void run() { check(false); } }, 4000);
    }

    void check(final boolean manual) {
        if (checking) return;
        checking = true;
        status("Checking for updates…");
        new Thread(new Runnable() {
            @Override public void run() {
                try {
                    JSONObject m = new JSONObject(new String(httpGet(getUpdateUrl(), 256 * 1024), "UTF-8"));
                    prefs.edit().putLong("lastCheck", System.currentTimeMillis()).apply();
                    final int latest = m.getInt("versionCode");
                    final String name = m.optString("versionName", String.valueOf(latest));
                    final String apkUrl = m.getString("apkUrl");
                    final String sha = m.optString("sha256", "").trim().toLowerCase();
                    final String notes = m.optString("notes", "");
                    if (latest > versionCode()) {
                        if (!apkUrl.startsWith("https://")) throw new IllegalStateException("update link is not HTTPS");
                        status("Version " + name + " is available.");
                        ui.post(new Runnable() { @Override public void run() { offer(name, notes, apkUrl, sha, latest); } });
                    } else {
                        status("You have the latest version (v" + versionName() + ").");
                        if (manual) toast("FieldLedger is up to date (v" + versionName() + ").");
                    }
                } catch (final Exception e) {
                    String why = describe(e);
                    if (why.contains("404")) {
                        status("No update has been published at the update address yet (v" + versionName() + " installed).");
                        if (manual) toast("No update published yet. You have v" + versionName() + ".");
                    } else if (e instanceof java.io.IOException) {
                        status("Could not reach the update server. Check your internet connection.");
                        if (manual) toast("Could not reach the update server. Check your internet connection.");
                    } else {
                        status("Could not check for updates: " + why);
                        if (manual) toast("Could not check for updates: " + why);
                    }
                } finally {
                    checking = false;
                }
            }
        }).start();
    }

    private void offer(String name, String notes, final String apkUrl, final String sha, final int code) {
        if (act.isFinishing()) return;
        new AlertDialog.Builder(act)
                .setTitle("Update available — v" + name)
                .setMessage((notes.isEmpty() ? "A new version of FieldLedger is ready." : notes)
                        + "\n\nYour saved records stay on this phone and are kept after updating.")
                .setPositiveButton("Download & install", new DialogInterface.OnClickListener() {
                    @Override public void onClick(DialogInterface d, int w) { download(apkUrl, sha, code); }
                })
                .setNegativeButton("Later", null)
                .show();
    }

    // --------------------------------------------------------------- download
    private void download(final String apkUrl, final String sha, final int code) {
        cancelDownload = false;
        final ProgressDialog pd = new ProgressDialog(act);
        pd.setTitle("Downloading update");
        pd.setMessage("Please keep the app open…");
        pd.setProgressStyle(ProgressDialog.STYLE_HORIZONTAL);
        pd.setIndeterminate(true);
        pd.setCancelable(false);
        pd.setButton(DialogInterface.BUTTON_NEGATIVE, "Cancel", new DialogInterface.OnClickListener() {
            @Override public void onClick(DialogInterface d, int w) { cancelDownload = true; }
        });
        pd.show();
        status("Downloading update…");
        new Thread(new Runnable() {
            @Override public void run() {
                File dir = new File(act.getCacheDir(), "updates");
                File apk = new File(dir, "FieldLedger-update-" + code + ".apk");
                HttpURLConnection c = null;
                try {
                    if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("cannot create update folder");
                    File[] old = dir.listFiles();
                    if (old != null) for (File f : old) f.delete();
                    c = open(apkUrl);
                    final long total = c.getContentLength();
                    if (total > MAX_APK_BYTES) throw new IllegalStateException("update file is too large");
                    MessageDigest md = MessageDigest.getInstance("SHA-256");
                    InputStream in = c.getInputStream();
                    FileOutputStream out = new FileOutputStream(apk);
                    long done = 0; byte[] buf = new byte[32 * 1024]; int n;
                    try {
                        while ((n = in.read(buf)) > 0) {
                            if (cancelDownload) throw new InterruptedException("cancelled");
                            out.write(buf, 0, n); md.update(buf, 0, n); done += n;
                            if (done > MAX_APK_BYTES) throw new IllegalStateException("update file is too large");
                            final long d = done;
                            if (total > 0) ui.post(new Runnable() { @Override public void run() {
                                pd.setIndeterminate(false); pd.setMax((int) (total / 1024)); pd.setProgress((int) (d / 1024)); } });
                        }
                    } finally { out.close(); in.close(); }
                    String got = hex(md.digest());
                    if (!sha.isEmpty() && !sha.equals(got)) throw new SecurityException("download is damaged (checksum mismatch)");
                    PackageInfo info = act.getPackageManager().getPackageArchiveInfo(apk.getPath(), 0);
                    if (info == null || !act.getPackageName().equals(info.packageName)) throw new SecurityException("downloaded file is not FieldLedger");
                    if (info.versionCode <= versionCode()) throw new IllegalStateException("downloaded version is not newer");
                    final File ready = apk;
                    ui.post(new Runnable() { @Override public void run() { pd.dismiss(); install(ready); } });
                } catch (final Exception e) {
                    apk.delete();
                    final boolean cancelled = e instanceof InterruptedException;
                    status(cancelled ? "Update download cancelled." : "Update failed: " + describe(e));
                    ui.post(new Runnable() { @Override public void run() {
                        pd.dismiss();
                        if (!cancelled) toast("Update failed: " + describe(e));
                    } });
                } finally {
                    if (c != null) c.disconnect();
                }
            }
        }).start();
    }

    // ---------------------------------------------------------------- install
    private boolean canInstall() {
        if (Build.VERSION.SDK_INT < 26) return true;
        try { return (Boolean) PackageManager.class.getMethod("canRequestPackageInstalls").invoke(act.getPackageManager()); }
        catch (Exception e) { return true; }
    }

    private void install(final File apk) {
        if (!canInstall()) {
            pendingInstall = apk;
            new AlertDialog.Builder(act)
                    .setTitle("Allow FieldLedger to install updates")
                    .setMessage("Android asks once for permission. On the next screen turn on “Allow from this source”, then come back — the update will continue.")
                    .setPositiveButton("Open settings", new DialogInterface.OnClickListener() {
                        @Override public void onClick(DialogInterface d, int w) {
                            try {
                                act.startActivity(new Intent("android.settings.MANAGE_UNKNOWN_APP_SOURCES", Uri.parse("package:" + act.getPackageName())));
                            } catch (Exception e) { toast("Open Settings → Apps → FieldLedger → Install unknown apps."); }
                        }
                    })
                    .setNegativeButton("Not now", new DialogInterface.OnClickListener() {
                        @Override public void onClick(DialogInterface d, int w) { pendingInstall = null; status("Update downloaded but not installed."); }
                    })
                    .show();
            return;
        }
        pendingInstall = null;
        try {
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(Uri.parse("content://" + FilesProvider.AUTHORITY + "/updates/" + apk.getName()), "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            act.startActivity(i);
            status("Installing update… follow Android's prompt.");
        } catch (Exception e) {
            status("Could not start the installer: " + describe(e));
            toast("Could not start the installer.");
        }
    }

    /** Called from MainActivity.onResume: continue an install that was waiting for permission. */
    void onResume() {
        if (pendingInstall != null && pendingInstall.isFile() && canInstall()) install(pendingInstall);
    }

    // ---------------------------------------------------------------- helpers
    private HttpURLConnection open(String url) throws Exception {
        if (!url.startsWith("https://")) throw new IllegalStateException("only HTTPS update links are allowed");
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setInstanceFollowRedirects(true);
        c.setRequestProperty("User-Agent", "FieldLedger-Android/" + versionName());
        c.setRequestProperty("Cache-Control", "no-cache");
        int code = c.getResponseCode();
        if (code != 200) { c.disconnect(); throw new IllegalStateException("server answered " + code); }
        return c;
    }

    private byte[] httpGet(String url, int max) throws Exception {
        HttpURLConnection c = open(url + (url.contains("?") ? "&" : "?") + "t=" + System.currentTimeMillis());
        try {
            InputStream in = c.getInputStream();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192]; int n;
            while ((n = in.read(buf)) > 0) { out.write(buf, 0, n); if (out.size() > max) throw new IllegalStateException("manifest too large"); }
            in.close();
            return out.toByteArray();
        } finally { c.disconnect(); }
    }

    private static String hex(byte[] b) {
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format("%02x", x));
        return sb.toString();
    }

    private static String describe(Exception e) {
        String m = e.getMessage();
        return m == null || m.isEmpty() ? e.getClass().getSimpleName() : m;
    }

    private void status(String msg) { act.sendEvent("update-status", msg); }

    private void toast(final String msg) {
        ui.post(new Runnable() { @Override public void run() { Toast.makeText(act, msg, Toast.LENGTH_LONG).show(); } });
    }
}
