package com.misnotas.app;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import com.getcapacitor.BridgeActivity;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SaveFilePlugin.class);
        super.onCreate(savedInstanceState);
        if (savedInstanceState == null) {
            recibir(getIntent(), false);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        recibir(intent, true);
    }

    /* HTML o copia de respaldo (.json) recibidos desde el menú Compartir o «Abrir con»: se guarda hasta que la app lo pida. */
    private void recibir(Intent intent, boolean avisar) {
        if (intent == null) {
            return;
        }
        String accion = intent.getAction();
        Uri uri = null;
        SaveFilePlugin.dbg = (avisar ? "app abierta" : "arranque") + " · acción=" + accion + " · tipo=" + intent.getType();
        if (Intent.ACTION_SEND.equals(accion)) {
            uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        } else if (Intent.ACTION_VIEW.equals(accion)) {
            uri = intent.getData();
        }
        SaveFilePlugin.dbg += " · uri=" + (uri == null ? "ninguna" : uri.getScheme() + "://" + uri.getAuthority());
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
                    if (total > 24000000) {
                        SaveFilePlugin.dbg += " · archivo mayor de 24 MB";
                        return;
                    }
                    out.write(buf, 0, n);
                }
            }
            SaveFilePlugin.pendingName = nombre;
            SaveFilePlugin.pendingHtml = out.toString("UTF-8");
            SaveFilePlugin.dbg += " · leído " + out.size() + " bytes (" + nombre + ")";
            if (avisar && getBridge() != null) {
                getBridge().triggerWindowJSEvent("mnshared");
            }
        } catch (Exception e) {
            SaveFilePlugin.dbg += " · ERROR " + e.getClass().getSimpleName() + ": " + e.getMessage();
        }
    }
}
