package com.misnotas.app;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SaveFilePlugin.class);
        super.onCreate(savedInstanceState);
        /* Dibujar también en la zona de la cámara (notch) cuando el teléfono está en horizontal */
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(lp);
        }
        if (savedInstanceState == null) {
            recibir(getIntent(), false);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        recibir(intent, true);
    }

    /* HTML recibido desde el menú Compartir o «Abrir con»: se guarda hasta que la app lo pida. */
    private void recibir(Intent intent, boolean avisar) {
        if (intent == null) {
            return;
        }
        String accion = intent.getAction();
        Uri uri = null;
        if (Intent.ACTION_SEND.equals(accion)) {
            uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        } else if (Intent.ACTION_VIEW.equals(accion)) {
            uri = intent.getData();
        }
        if (uri == null) {
            return;
        }
        try {
            String nombre = "archivo.html";
            try (Cursor c = getContentResolver().query(uri, null, null, null, null)) {
                if (c != null && c.moveToFirst()) {
                    int i = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                    if (i >= 0 && c.getString(i) != null) {
                        nombre = c.getString(i);
                    }
                }
            } catch (Exception ignorado) {
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            try (InputStream in = getContentResolver().openInputStream(uri)) {
                byte[] buf = new byte[65536];
                int n;
                int total = 0;
                while ((n = in.read(buf)) > 0) {
                    total += n;
                    if (total > 4000000) {
                        return;
                    }
                    out.write(buf, 0, n);
                }
            }
            SaveFilePlugin.pendingName = nombre;
            SaveFilePlugin.pendingHtml = out.toString("UTF-8");
            if (avisar && getBridge() != null) {
                getBridge().triggerWindowJSEvent("mnshared");
            }
        } catch (Exception ignorado) {
        }
    }
}
