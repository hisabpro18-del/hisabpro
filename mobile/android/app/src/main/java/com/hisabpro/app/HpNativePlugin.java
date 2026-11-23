package com.hisabpro.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothClass;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.util.Base64;
import android.webkit.WebView;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.Set;
import java.util.UUID;

/**
 * HisabPro's native helpers for the web app (called from public/js/core/native.js with Capacitor.nativePromise):
 *   listPrinters()                                  paired Bluetooth devices (pair the printer in Android settings first)
 *   print({ address, data, chunkSize, chunkDelayMs }) raw ESC/POS bytes (base64) to a Bluetooth Classic (SPP) printer
 *   systemPrint({ name })                           Android's print dialog for the current page (PDF, Wi-Fi printers)
 *   shareFile({ name, mime, data })                 a file made by the page (CSV, backup, document) → Android share sheet
 *                                                   (save to Files / Drive, send on WhatsApp); WebViews cannot download
 * Most shop thermal printers (58 / 80 mm) are Bluetooth Classic with the Serial Port Profile; BLE-only printers are not
 * supported by this plugin.
 */
@CapacitorPlugin(
    name = "HpNative",
    permissions = { @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_CONNECT }) }
)
public class HpNativePlugin extends Plugin {

    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    // Android 12+ asks the user for "Nearby devices" (BLUETOOTH_CONNECT); older versions grant Bluetooth at install
    private boolean hasBluetoothPermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S || getPermissionState("bluetooth") == PermissionState.GRANTED;
    }

    private BluetoothAdapter adapter() {
        BluetoothManager m = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return m == null ? null : m.getAdapter();
    }

    // null when Bluetooth can be used; otherwise the call has been rejected
    private BluetoothAdapter readyAdapter(PluginCall call) {
        BluetoothAdapter a = adapter();
        if (a == null) { call.reject("This phone has no Bluetooth.", "NO_BLUETOOTH"); return null; }
        if (!a.isEnabled()) { call.reject("Bluetooth is off. Switch it on and try again.", "BLUETOOTH_OFF"); return null; }
        return a;
    }

    // ── paired devices ──
    @PluginMethod
    public void listPrinters(PluginCall call) {
        if (!hasBluetoothPermission()) { requestPermissionForAlias("bluetooth", call, "listAfterPermission"); return; }
        doList(call);
    }

    @PermissionCallback
    private void listAfterPermission(PluginCall call) {
        if (!hasBluetoothPermission()) { call.reject("Allow \"Nearby devices\" for HisabPro to use a Bluetooth printer.", "PERMISSION"); return; }
        doList(call);
    }

    @SuppressLint("MissingPermission")
    private void doList(PluginCall call) {
        BluetoothAdapter a = readyAdapter(call);
        if (a == null) return;
        JSArray list = new JSArray();
        Set<BluetoothDevice> bonded = a.getBondedDevices();
        if (bonded != null) {
            for (BluetoothDevice d : bonded) {
                JSObject o = new JSObject();
                String name = d.getName();
                o.put("name", name == null || name.isEmpty() ? d.getAddress() : name);
                o.put("address", d.getAddress());
                BluetoothClass cls = d.getBluetoothClass();
                o.put("printerLike", cls != null && cls.getMajorDeviceClass() == BluetoothClass.Device.Major.IMAGING);
                list.put(o);
            }
        }
        JSObject ret = new JSObject();
        ret.put("printers", list);
        call.resolve(ret);
    }

    // ── raw ESC/POS bytes to a paired printer ──
    @PluginMethod
    public void print(PluginCall call) {
        if (!hasBluetoothPermission()) { requestPermissionForAlias("bluetooth", call, "printAfterPermission"); return; }
        doPrint(call);
    }

    @PermissionCallback
    private void printAfterPermission(PluginCall call) {
        if (!hasBluetoothPermission()) { call.reject("Allow \"Nearby devices\" for HisabPro to use a Bluetooth printer.", "PERMISSION"); return; }
        doPrint(call);
    }

    @SuppressLint("MissingPermission")
    private void doPrint(final PluginCall call) {
        final String address = call.getString("address");
        final String data = call.getString("data");
        if (address == null || address.isEmpty() || data == null || data.isEmpty()) { call.reject("Choose a printer first."); return; }
        final byte[] bytes;
        try {
            bytes = Base64.decode(data, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            call.reject("The print data could not be read.");
            return;
        }
        final BluetoothAdapter a = readyAdapter(call);
        if (a == null) return;
        final int chunk = Math.max(64, Math.min(4096, call.getInt("chunkSize", 512)));
        final int delay = Math.max(0, Math.min(500, call.getInt("chunkDelayMs", 20)));

        // sockets block: never on the main thread
        new Thread(() -> {
            BluetoothSocket socket = null;
            try {
                BluetoothDevice device = a.getRemoteDevice(address);
                // a running discovery slows the connection down; stopping it needs BLUETOOTH_SCAN on Android 12+, which
                // HisabPro does not ask for — so it is only tried, and printing goes on either way
                try { a.cancelDiscovery(); } catch (SecurityException ignored) { }
                try {
                    socket = device.createRfcommSocketToServiceRecord(SPP);
                    socket.connect();
                } catch (Exception secureFailed) {
                    // many cheap printers only accept the insecure channel
                    closeQuietly(socket);
                    socket = device.createInsecureRfcommSocketToServiceRecord(SPP);
                    socket.connect();
                }
                OutputStream out = socket.getOutputStream();
                for (int i = 0; i < bytes.length; i += chunk) {
                    out.write(bytes, i, Math.min(chunk, bytes.length - i));
                    out.flush();
                    if (delay > 0) Thread.sleep(delay); // small printer buffers overflow when fed too fast
                }
                Thread.sleep(400); // let the printer take the last bytes before the link closes
                JSObject ret = new JSObject();
                ret.put("bytes", bytes.length);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Could not print. Is the printer switched on, paired and near the phone? (" + e.getMessage() + ")", "PRINT_FAILED");
            } finally {
                closeQuietly(socket);
            }
        }, "hp-bt-print").start();
    }

    private static void closeQuietly(BluetoothSocket s) {
        if (s == null) return;
        try { s.close(); } catch (Exception ignored) { }
    }

    // ── files made in the page (CSV exports, backups, HR documents) ──
    @PluginMethod
    public void shareFile(PluginCall call) {
        String name = call.getString("name", "file");
        String mime = call.getString("mime", "application/octet-stream");
        String data = call.getString("data", "");
        // a plain file name only (no folders), so nothing is written outside the share folder
        name = name.replaceAll("[\\\\/:*?\"<>|\\u0000-\\u001f]", "_").trim();
        if (name.isEmpty() || name.equals(".") || name.equals("..")) name = "file";
        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            File dir = new File(getContext().getCacheDir(), "shared");
            if (!dir.exists() && !dir.mkdirs()) throw new Exception("no storage");
            File f = new File(dir, name);
            try (FileOutputStream out = new FileOutputStream(f)) { out.write(bytes); }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mime);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, name);
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(chooser);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not save the file: " + e.getMessage());
        }
    }

    // ── Android print dialog for the page (A4 invoices, reports, barcode labels; "Save as PDF") ──
    @PluginMethod
    public void systemPrint(final PluginCall call) {
        final String name = call.getString("name", "HisabPro");
        getActivity().runOnUiThread(() -> {
            try {
                PrintManager pm = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                WebView wv = getBridge().getWebView();
                PrintDocumentAdapter printAdapter = wv.createPrintDocumentAdapter(name);
                pm.print(name, printAdapter, new PrintAttributes.Builder().build());
                call.resolve();
            } catch (Exception e) {
                call.reject("Could not open printing: " + e.getMessage());
            }
        });
    }
}
