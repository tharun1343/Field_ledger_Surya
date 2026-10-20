package com.fieldledger.farm;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;

/** Receives the result of the in-app update install session (see Updater.installWithSession). */
public class InstallReceiver extends BroadcastReceiver {
    static final String ACTION = "com.fieldledger.farm.INSTALL_STATUS";

    @Override
    public void onReceive(Context context, Intent intent) {
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            // Android wants the user to confirm ("Update this app?"): show its dialog over FieldLedger.
            Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm != null) {
                confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try { context.startActivity(confirm); Updater.onInstallStatus("confirm", null); }
                catch (Exception e) { Updater.onInstallStatus("failed", "could not show Android's install prompt"); }
            }
            return;
        }
        if (status == PackageInstaller.STATUS_SUCCESS) { Updater.onInstallStatus("installed", null); return; }
        if (status == PackageInstaller.STATUS_FAILURE_ABORTED) { Updater.onInstallStatus("aborted", null); return; }
        Updater.onInstallStatus("failed", intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE));
    }
}
