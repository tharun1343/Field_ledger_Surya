package com.fieldledger.farm;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import android.webkit.MimeTypeMap;

import java.io.File;
import java.io.FileNotFoundException;
import java.util.List;

/**
 * Minimal file provider (no AndroidX available in this build) that exposes
 * cache/updates/* (downloaded update APKs, to the package installer) and cache/exports/* (shared exports) and cache/captures/* (camera writes the bill photo here).
 */
public class FilesProvider extends ContentProvider {
    static final String AUTHORITY = "com.fieldledger.farm.files";

    @Override public boolean onCreate() { return true; }

    private File resolve(Uri uri) throws FileNotFoundException {
        List<String> seg = uri.getPathSegments();
        if (seg.size() != 2) throw new FileNotFoundException("bad path");
        String dir = seg.get(0), name = seg.get(1);
        if (!("updates".equals(dir) || "exports".equals(dir) || "captures".equals(dir)) || name.contains("/") || name.startsWith(".")) throw new FileNotFoundException("not allowed");
        File f = new File(new File(getContext().getCacheDir(), dir), name);
        if (!f.isFile()) throw new FileNotFoundException(name);
        return f;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File f = resolve(uri);
        // Only the camera's output file (captures/) may be written to.
        if (mode != null && mode.contains("w")) {
            if (!"captures".equals(uri.getPathSegments().get(0))) throw new FileNotFoundException("read-only");
            return ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_WRITE | ParcelFileDescriptor.MODE_TRUNCATE);
        }
        return ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public String getType(Uri uri) {
        String name = uri.getLastPathSegment();
        if (name == null) return null;
        if (name.endsWith(".apk")) return "application/vnd.android.package-archive";
        String ext = MimeTypeMap.getFileExtensionFromUrl(name);
        String t = ext == null ? null : MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext.toLowerCase());
        return t == null ? "application/octet-stream" : t;
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sort) {
        try {
            File f = resolve(uri);
            MatrixCursor c = new MatrixCursor(new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE });
            c.addRow(new Object[] { f.getName(), f.length() });
            return c;
        } catch (FileNotFoundException e) {
            return null;
        }
    }

    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException(); }
    @Override public int delete(Uri uri, String s, String[] a) { throw new UnsupportedOperationException(); }
    @Override public int update(Uri uri, ContentValues v, String s, String[] a) { throw new UnsupportedOperationException(); }
}
