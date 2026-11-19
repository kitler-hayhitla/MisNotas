package com.misnotas.app;

import android.app.Activity;
import android.net.Uri;
import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;

/* Guarda un archivo del caché de la app en el lugar que elija la persona (selector de archivos de Android). */
@CapacitorPlugin(name = "SaveFile")
public class SaveFilePlugin extends Plugin {

    @PluginMethod
    public void save(PluginCall call) {
        String path = call.getString("path");
        String name = call.getString("name", "archivo");
        String mime = call.getString("mime", "application/octet-stream");
        if (path == null) {
            call.reject("Falta la ruta del archivo");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mime);
        intent.putExtra(Intent.EXTRA_TITLE, name);
        startActivityForResult(call, intent, "onSaved");
    }

    @ActivityCallback
    private void onSaved(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }
        JSObject ret = new JSObject();
        if (result.getResultCode() != Activity.RESULT_OK
                || result.getData() == null
                || result.getData().getData() == null) {
            ret.put("saved", false);
            call.resolve(ret);
            return;
        }
        try {
            Uri dest = result.getData().getData();
            File src = new File(Uri.parse(call.getString("path")).getPath());
            try (InputStream in = new FileInputStream(src);
                 OutputStream out = getContext().getContentResolver().openOutputStream(dest)) {
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n);
                }
            }
            ret.put("saved", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("No se pudo guardar: " + e.getMessage());
        }
    }
}
