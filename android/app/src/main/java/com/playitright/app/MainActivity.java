package com.playitright.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
	private static final int REQUEST_AUDIO_PERMISSIONS = 101;

	@Override
	public void onCreate(Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);

		if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED ||
			ContextCompat.checkSelfPermission(this, Manifest.permission.MODIFY_AUDIO_SETTINGS) != PackageManager.PERMISSION_GRANTED) {
			ActivityCompat.requestPermissions(this,
				new String[] { Manifest.permission.RECORD_AUDIO, Manifest.permission.MODIFY_AUDIO_SETTINGS },
				REQUEST_AUDIO_PERMISSIONS);
		}

		if (getBridge() != null && getBridge().getWebView() != null) {
			getBridge().getWebView().setWebChromeClient(new WebChromeClient() {
				@Override
				public void onPermissionRequest(final PermissionRequest request) {
					runOnUiThread(new Runnable() {
						@Override
						public void run() {
							try {
								request.grant(request.getResources());
							} catch (Exception e) {
								// swallow - granting may fail in some environments
							}
						}
					});
				}
			});
		}
	}
}
