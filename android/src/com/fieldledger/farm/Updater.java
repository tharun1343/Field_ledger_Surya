package com.fieldledger.farm;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.ref.WeakReference;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * In-app updater. All screens are drawn by the web app; this class only reports states to it as
 * window.FieldLedgerNativeEvent("update", {state: …}).
 *
 * Check: the GitHub Releases API first, then release/version.json on raw.githubusercontent.com, then the
 * GitHub Pages copy — the first one that answers wins, so one blocked host (some mobile networks block
 * raw.githubusercontent.com) does not stop updates.
 * Download: tries every APK address in the manifest until one passes the SHA-256 check.
 * Install: Android's PackageInstaller session (the app stays in front; Android shows only its short
 * "Update this app?" confirmation, and on Android 12+ later updates can install without it).
 */
class Updater {
    private static final String PREFS = "fieldledger-updater";
    private static final long AUTO_INTERVAL_MS = 30L * 60 * 1000;
    private static final long MAX_APK_BYTES = 150L * 1024 * 1024;
    private static final Pattern MANIFEST_IN_NOTES = Pattern.compile("<!--\\s*fl-manifest\\s*(\\{.*?\\})\\s*-->", Pattern.DOTALL);

    private static WeakReference<Updater> current = new WeakReference<Updater>(null);

    private final MainActivity act;
    private final SharedPreferences prefs;
    private volatile boolean checking = false;
    private volatile boolean downloading = false;
    private volatile boolean cancelDownload = false;
    private volatile JSONObject offer;
    private File pendingInstall;
    private long lastAutoAttempt = 0;
    private long lastProgress = 0;

    Updater(MainActivity act) {
        this.act = act;
        this.prefs = act.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        current = new WeakReference<Updater>(this);
    }

    // ------------------------------------------------------------------ info
    int versionCode() {
        try { return act.getPackageManager().getPackageInfo(act.getPackageName(), 0).versionCode; } catch (Exception e) { return 0; }
    }

    String versionName() {
        try { return act.getPackageManager().getPackageInfo(act.getPackageName(), 0).versionName; } catch (Exception e) { return "?"; }
    }

    long lastCheck() { return prefs.getLong("lastCheck", 0); }

    // ------------------------------------------------------------------ check
    void autoCheck() {
        long now = System.currentTimeMillis();
        if (downloading || now - lastAutoAttempt < AUTO_INTERVAL_MS) return;
        lastAutoAttempt = now;
        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(new Runnable() { @Override public void run() { check(false); } }, 2500);
    }

    void check(final boolean manual) {
        if (checking || downloading) return;
        checking = true;
        if (manual) emit(state("checking"));
        new Thread(new Runnable() {
            @Override public void run() {
                try {
                    JSONObject m = fetchManifest();
                    prefs.edit().putLong("lastCheck", System.currentTimeMillis()).apply();
                    int latest = m.getInt("versionCode");
                    if (latest > versionCode()) {
                        offer = m;
                        JSONObject e = state("available");
                        e.put("versionCode", latest);
                        e.put("versionName", m.optString("versionName", String.valueOf(latest)));
                        e.put("notes", m.optString("notes", ""));
                        e.put("size", m.optLong("size", 0));
                        e.put("auto", !manual);
                        emit(e);
                    } else {
                        JSONObject e = state("latest");
                        e.put("versionName", versionName());
                        e.put("manual", manual);
                        emit(e);
                    }
                } catch (Exception e) {
                    if (manual) emit(error("error", friendly(e, "Could not check for updates")).put2("manual", true));
                } finally {
                    checking = false;
                }
            }
        }).start();
    }

    private JSONObject fetchManifest() throws Exception {
        Exception last = null;
        if (!Config.GITHUB_REPO.isEmpty()) {
            try { return fromReleaseApi(); } catch (Exception e) { last = e; }
        }
        for (String url : new String[] { Config.UPDATE_URL, Config.UPDATE_MIRROR_URL }) {
            if (url == null || url.isEmpty()) continue;
            try {
                JSONObject m = new JSONObject(new String(httpGet(url + (url.contains("?") ? "&" : "?") + "t=" + System.currentTimeMillis(), 256 * 1024), "UTF-8"));
                m.getInt("versionCode");
                return m;
            } catch (Exception e) { last = e; }
        }
        throw last != null ? last : new IllegalStateException("no update address");
    }

    /** Latest GitHub Release: the manifest is embedded in the release notes as <!-- fl-manifest {...} -->. */
    private JSONObject fromReleaseApi() throws Exception {
        JSONObject rel = new JSONObject(new String(httpGet("https://api.github.com/repos/" + Config.GITHUB_REPO + "/releases/latest", 512 * 1024), "UTF-8"));
        Matcher mt = MANIFEST_IN_NOTES.matcher(rel.optString("body", ""));
        if (!mt.find()) throw new IllegalStateException("release has no manifest");
        JSONObject m = new JSONObject(mt.group(1));
        m.getInt("versionCode");
        // Prefer this release's own asset first.
        JSONArray assets = rel.optJSONArray("assets");
        JSONArray urls = new JSONArray();
        if (assets != null) {
            for (int i = 0; i < assets.length(); i++) {
                JSONObject a = assets.getJSONObject(i);
                if (a.optString("name").endsWith(".apk")) { urls.put(a.optString("browser_download_url")); break; }
            }
        }
        JSONArray more = m.optJSONArray("apkUrls");
        if (more != null) for (int i = 0; i < more.length(); i++) urls.put(more.getString(i));
        m.put("apkUrls", urls);
        return m;
    }

    // --------------------------------------------------------------- download
    void start() {
        final JSONObject m = offer;
        if (m == null) { check(true); return; }
        if (downloading) return;
        if (pendingInstall != null && pendingInstall.isFile()) { install(pendingInstall); return; }
        downloading = true;
        cancelDownload = false;
        new Thread(new Runnable() {
            @Override public void run() {
                File dir = new File(act.getCacheDir(), "updates");
                int code = m.optInt("versionCode");
                File apk = new File(dir, "FieldLedger-update-" + code + ".apk");
                Exception last = null;
                try {
                    if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("cannot create the update folder");
                    File[] old = dir.listFiles();
                    if (old != null) for (File f : old) f.delete();
                    String sha = m.optString("sha256", "").trim().toLowerCase();
                    for (String url : apkUrls(m)) {
                        if (cancelDownload) break;
                        try {
                            download(url, apk, sha);
                            last = null;
                            break;
                        } catch (InterruptedException e) {
                            throw e;
                        } catch (Exception e) {
                            last = e;
                            apk.delete();
                        }
                    }
                    if (cancelDownload) throw new InterruptedException("cancelled");
                    if (last != null || !apk.isFile()) throw last != null ? last : new IllegalStateException("download failed");
                    emit(state("verifying"));
                    PackageInfo info = act.getPackageManager().getPackageArchiveInfo(apk.getPath(), 0);
                    if (info == null || !act.getPackageName().equals(info.packageName)) throw new SecurityException("the downloaded file is not FieldLedger");
                    if (info.versionCode <= versionCode()) throw new IllegalStateException("the downloaded version is not newer");
                    downloading = false;
                    final File ready = apk;
                    act.runOnUiThread(new Runnable() { @Override public void run() { install(ready); } });
                } catch (InterruptedException e) {
                    apk.delete();
                    downloading = false;
                    emit(state("cancelled"));
                } catch (Exception e) {
                    apk.delete();
                    downloading = false;
                    emit(error("failed", friendly(e, "Download failed")));
                }
            }
        }).start();
    }

    void cancel() { cancelDownload = true; }

    private List<String> apkUrls(JSONObject m) {
        LinkedHashSet<String> set = new LinkedHashSet<String>();
        JSONArray arr = m.optJSONArray("apkUrls");
        if (arr != null) for (int i = 0; i < arr.length(); i++) { String u = arr.optString(i); if (u.startsWith("https://")) set.add(u); }
        String one = m.optString("apkUrl", "");
        if (one.startsWith("https://")) set.add(one);
        return new ArrayList<String>(set);
    }

    private void download(String url, File apk, String sha) throws Exception {
        HttpURLConnection c = open(url, 20000, 60000);
        try {
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
                    long now = System.currentTimeMillis();
                    if (now - lastProgress > 120 || done == total) {
                        lastProgress = now;
                        JSONObject p = state("progress"); p.put("done", done); p.put("total", total > 0 ? total : offer.optLong("size", 0)); emit(p);
                    }
                }
            } finally { out.close(); in.close(); }
            if (!sha.isEmpty() && !sha.equals(hex(md.digest()))) throw new SecurityException("download is damaged (checksum mismatch)");
        } finally { c.disconnect(); }
    }

    // ---------------------------------------------------------------- install
    boolean canInstall() {
        if (Build.VERSION.SDK_INT < 26) return true;
        try { return (Boolean) PackageManager.class.getMethod("canRequestPackageInstalls").invoke(act.getPackageManager()); }
        catch (Exception e) { return true; }
    }

    void openInstallPermission() {
        try { act.startActivity(new Intent("android.settings.MANAGE_UNKNOWN_APP_SOURCES", Uri.parse("package:" + act.getPackageName()))); }
        catch (Exception e) {
            try { act.startActivity(new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + act.getPackageName()))); } catch (Exception ignored) { }
        }
    }

    private void install(final File apk) {
        if (!canInstall()) { pendingInstall = apk; emit(state("permission")); return; }
        pendingInstall = null;
        emit(state("installing"));
        new Thread(new Runnable() {
            @Override public void run() {
                try {
                    installWithSession(apk);
                } catch (Exception e) {
                    // Fallback: hand the file to the system installer screen.
                    act.runOnUiThread(new Runnable() { @Override public void run() { installWithIntent(apk); } });
                }
            }
        }).start();
    }

    private void installWithSession(File apk) throws Exception {
        PackageInstaller pi = act.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(act.getPackageName());
        params.setSize(apk.length());
        if (Build.VERSION.SDK_INT >= 31) {
            // USER_ACTION_NOT_REQUIRED (2): Android 12+ may then update without asking, once FieldLedger installed itself.
            try { PackageInstaller.SessionParams.class.getMethod("setRequireUserAction", int.class).invoke(params, 2); } catch (Exception ignored) { }
        }
        int id = pi.createSession(params);
        PackageInstaller.Session session = pi.openSession(id);
        try {
            OutputStream out = session.openWrite("base.apk", 0, apk.length());
            InputStream in = new FileInputStream(apk);
            try {
                byte[] buf = new byte[64 * 1024]; int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                session.fsync(out);
            } finally { in.close(); out.close(); }
            Intent cb = new Intent(act, InstallReceiver.class).setAction(InstallReceiver.ACTION);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? 0x02000000 /* FLAG_MUTABLE */ : 0);
            PendingIntent sender = PendingIntent.getBroadcast(act, id, cb, flags);
            session.commit(sender.getIntentSender());
        } catch (Exception e) {
            session.abandon();
            throw e;
        } finally {
            session.close();
        }
    }

    private void installWithIntent(File apk) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(Uri.parse("content://" + FilesProvider.AUTHORITY + "/updates/" + apk.getName()), "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            act.startActivity(i);
            emit(state("confirm"));
        } catch (Exception e) {
            emit(error("failed", "Could not start the installer: " + describe(e)));
        }
    }

    /** Called by InstallReceiver with the result of the install session. */
    static void onInstallStatus(String st, String message) {
        Updater u = current.get();
        if (u == null) return;
        if ("failed".equals(st)) u.emit(u.error("failed", message == null || message.isEmpty() ? "Android did not install the update." : "Android did not install the update: " + message));
        else if ("aborted".equals(st)) u.emit(u.error("failed", "The update was not installed (cancelled). Tap Try again to install it."));
        else u.emit(u.state(st));
    }

    /** MainActivity.onResume: continue an install that was waiting for the permission. */
    void onResume() {
        if (pendingInstall != null && pendingInstall.isFile() && canInstall()) { install(pendingInstall); return; }
        autoCheck();
    }

    // ---------------------------------------------------------------- helpers
    private HttpURLConnection open(String url, int connectMs, int readMs) throws Exception {
        if (!url.startsWith("https://")) throw new IllegalStateException("only HTTPS update links are allowed");
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(connectMs);
        c.setReadTimeout(readMs);
        c.setInstanceFollowRedirects(true);
        c.setUseCaches(false);
        c.setRequestProperty("User-Agent", "FieldLedger-Android/" + versionName());
        c.setRequestProperty("Accept", url.contains("api.github.com") ? "application/vnd.github+json" : "*/*");
        c.setRequestProperty("Cache-Control", "no-cache");
        int code = c.getResponseCode();
        if (code != 200) { c.disconnect(); throw new IllegalStateException("server answered " + code); }
        return c;
    }

    private byte[] httpGet(String url, int max) throws Exception {
        HttpURLConnection c = open(url, 10000, 15000);
        try {
            InputStream in = c.getInputStream();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192]; int n;
            while ((n = in.read(buf)) > 0) { out.write(buf, 0, n); if (out.size() > max) throw new IllegalStateException("response too large"); }
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

    private static String friendly(Exception e, String what) {
        String m = describe(e);
        if (e instanceof java.io.IOException) return "Could not reach the update server. Check your internet connection and try again.";
        if (m.contains("404")) return "No update has been published yet.";
        return what + ": " + m;
    }

    private Ev state(String s) { Ev e = new Ev(); e.put2("state", s); return e; }
    private Ev error(String s, String msg) { Ev e = state(s); e.put2("message", msg); return e; }
    private void emit(JSONObject e) { act.sendEvent("update", e.toString()); }

    /** JSONObject with a put that never throws (keys are fixed strings). */
    static final class Ev extends JSONObject {
        Ev put2(String k, Object v) { try { put(k, v); } catch (Exception ignored) { } return this; }
    }
}
