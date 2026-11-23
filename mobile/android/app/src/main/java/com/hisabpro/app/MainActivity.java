package com.hisabpro.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

// The app is a window on the live HisabPro server (capacitor.config.json → server.url) plus native helpers:
// HpNative (Bluetooth and system printing, file sharing; our own) and the Capacitor barcode scanner and App plugins.
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HpNativePlugin.class); // our own plugins are registered before the bridge starts
        super.onCreate(savedInstanceState);
    }
}
