/* native.js - capa nativa de Mis notas (Capacitor). Se carga DESPUÉS de la app.
   En navegador normal no hace nada; solo actúa dentro de la app instalada. */
(function () {
  var C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;

  function pl(n) { return (window.Capacitor.Plugins || {})[n]; }

  /* ---------- Preferencias de avisos ---------- */
  var KEY = "notas_native", NP = { pen: true, cla: true, min: 15 };
  try {
    var r = JSON.parse(localStorage.getItem(KEY) || "null");
    if (r) {
      NP.pen = r.pen !== false;
      NP.cla = r.cla !== false;
      if ([5, 10, 15, 30, 60].indexOf(r.min) >= 0) NP.min = r.min;
    }
  } catch (e) {}
  function saveNP() { try { localStorage.setItem(KEY, JSON.stringify(NP)); } catch (e) {} }

  /* ---------- Construir los avisos desde los datos de la app ---------- */
  var MAXN = 60; /* iOS permite 64 pendientes; Android muchos más */
  function wd(d) { return d === 6 ? 1 : d + 2; } /* app: 0=Lun..6=Dom -> Capacitor: 1=Dom..7=Sáb */

  function build() {
    var out = [], now = Date.now(), ev = [];

    if (NP.cla) {
      (S.hor || []).forEach(function (b) {
        var m = b.a - NP.min, d = b.d;
        if (m < 0) { m += 1440; d = (d + 6) % 7; }
        out.push({
          title: b.n,
          body: "Empieza a las " + hrT(b.a) + (b.r ? " · " + b.r : ""),
          schedule: { on: { weekday: wd(d), hour: Math.floor(m / 60), minute: m % 60 }, allowWhileIdle: true },
          channelId: "recordatorios"
        });
      });
    }

    if (NP.pen) {
      DB.sems.forEach(function (sm) {
        sm.subs.forEach(function (sb) {
          sb.todos.forEach(function (t) {
            if (t.x || !t.d) return;
            var d = dstr(t.d);
            var antes = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, 18, 0).getTime();
            var dia = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 7, 0).getTime();
            if (antes > now + 10000) ev.push({ at: antes, title: "Mañana: " + t.n, body: sb.name });
            if (dia > now + 10000) ev.push({ at: dia, title: "Hoy: " + t.n, body: sb.name });
            if (t.k) { /* pendiente ligado a una clase: aviso antes de que empiece */
              var cb = (sm.hor || []).filter(function (b) { return b.id === t.k; })[0];
              if (cb) {
                var cl = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, cb.a - NP.min).getTime();
                if (cl > now + 10000) ev.push({ at: cl, title: "Para esta clase: " + t.n, body: cb.n + " · " + hrT(cb.a) + (cb.r ? " · " + cb.r : "") });
              }
            }
          });
        });
      });
      ev.sort(function (a, b) { return a.at - b.at; });
      ev.slice(0, Math.max(0, MAXN - out.length)).forEach(function (e) {
        out.push({ title: e.title, body: e.body, schedule: { at: new Date(e.at), allowWhileIdle: true }, channelId: "recordatorios" });
      });
    }

    out.forEach(function (n, i) { n.id = i + 1; });
    return out;
  }

  /* ---------- Reprogramar todo (cancelar y volver a crear) ---------- */
  var busy = false, pend = false, pAsk = false;
  async function reprog(ask) {
    var LN = pl("LocalNotifications");
    if (!LN) return;
    if (busy) { pend = true; if (ask) pAsk = true; return; }
    busy = true;
    try {
      var items = build();
      var pd = await LN.getPending();
      if (pd.notifications && pd.notifications.length)
        await LN.cancel({ notifications: pd.notifications.map(function (n) { return { id: n.id }; }) });
      if (!items.length) return;
      var pm = await LN.checkPermissions();
      if (pm.display === "prompt" || pm.display === "prompt-with-rationale") {
        if (!ask) return;
        pm = await LN.requestPermissions();
      }
      if (pm.display !== "granted") return;
      try { await LN.createChannel({ id: "recordatorios", name: "Recordatorios", importance: 4 }); } catch (e) {}
      await LN.schedule({ notifications: items });
    } catch (e) {
    } finally {
      busy = false;
      if (pend) { pend = false; var a = pAsk; pAsk = false; reprog(a); }
    }
  }

  var tmr = null;
  function sched(ask) {
    clearTimeout(tmr);
    tmr = setTimeout(function () { reprog(!!ask); }, 800);
  }

  /* Cada vez que la app guarda datos, se reprograman los avisos */
  var saveOrig = window.save;
  window.save = function () {
    var r0 = saveOrig.apply(this, arguments);
    sched(true);
    return r0;
  };

  /* ---------- Tarjeta «Avisos» en Ajustes ---------- */
  var vAjOrig = window.vAj;
  function tg(k, l, on) {
    return '<button type="button" class="tgl" role="switch" aria-checked="' + on + '" onclick="NATIVE.set(\'' + k + '\')"><span class="tgt">' + l + '</span><span class="tgk" aria-hidden="true"></span></button>';
  }
  function card() {
    return '<details class="card cp"' + AJD("n") + '><summary>Avisos</summary>' +
      '<p class="mu">Recordatorios en tu teléfono, sin internet.</p>' +
      tg("pen", "Pendientes", NP.pen) + tg("cla", "Clases", NP.cla) +
      '<label style="margin-top:6px">Avisar las clases con</label><div class="row" style="gap:5px">' +
      [5, 10, 15, 30, 60].map(function (m) {
        return '<button class="ch' + (NP.min === m ? " on" : "") + '" onclick="NATIVE.min(' + m + ')">' + m + ' min</button>';
      }).join("") + '</div>' +
      '<p class="mu" style="margin-top:8px">Pendientes: aviso el día anterior a las 6 pm y el mismo día a las 7 am.</p>' +
      '<div class="row"><button class="g" onclick="NATIVE.test()">Probar aviso</button></div></details>';
  }
  window.vAj = function () { return vAjOrig() + card(); };

  window.NATIVE = {
    set: function (k) { NP[k] = !NP[k]; saveNP(); render(); sched(true); },
    min: function (m) { NP.min = m; saveNP(); render(); sched(true); },
    test: async function () {
      var LN = pl("LocalNotifications");
      if (!LN) return;
      try {
        var pm = await LN.checkPermissions();
        if (pm.display !== "granted") pm = await LN.requestPermissions();
        if (pm.display !== "granted") { alert("Activa las notificaciones de Mis notas en los ajustes del teléfono."); return; }
        try { await LN.createChannel({ id: "recordatorios", name: "Recordatorios", importance: 4 }); } catch (e) {}
        await LN.schedule({ notifications: [{ id: 9999, title: "Mis notas", body: "Así se verán tus avisos.", schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true }, channelId: "recordatorios" }] });
      } catch (e) { alert("No se pudo programar el aviso de prueba."); }
    }
  };

  /* ---------- Guardar en el teléfono (selector de archivos de Android); si no está, compartir ---------- */
  async function toDevice(w, fn, mime) {
    var SF = pl("SaveFile"), SH = pl("Share");
    if (SF) {
      try { var r = await SF.save({ path: w.uri, name: fn, mime: mime || "application/octet-stream" }); return !!(r && r.saved); }
      catch (e) { /* si falla el selector, se ofrece compartir */ }
    }
    await SH.share({ title: fn, url: w.uri, dialogTitle: "Guardar archivo" });
    return true;
  }
  window.NATIVE.save = async function (fn, u8, mime) {
    var FS = pl("Filesystem"), b = "", i, CH = 0x8000;
    for (i = 0; i < u8.length; i += CH) b += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    var w = await FS.writeFile({ path: fn, data: btoa(b), directory: "CACHE" });
    if (await toDevice(w, fn, mime)) note("Archivo guardado: " + fn, true);
  };

  /* ---------- Compartir / abrir cualquier archivo (adjuntos) ---------- */
  window.NATIVE.file = async function (fn, u8) {
    var FS = pl("Filesystem"), SH = pl("Share"), b = "", i, CH = 0x8000;
    for (i = 0; i < u8.length; i += CH) b += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    var w = await FS.writeFile({ path: fn, data: btoa(b), directory: "CACHE" });
    await SH.share({ title: fn, url: w.uri, dialogTitle: "Guardar archivo" });
    note("Archivo listo: " + fn, true);
  };

  /* ---------- Botón «atrás» de Android ---------- */
  var AP = pl("App");
  if (AP) {
    AP.addListener("backButton", function () {
      var ov = document.getElementById("ov");
      if (typeof DDP !== "undefined" && DDP) { ddClose(); return; }
      if (ov && ov.style.display !== "none") { cm(); return; }
      if (V.t === "mat" && V.s) { go("mat"); return; }
      if (V.t !== "ini") { go("ini"); return; }
      AP.exitApp();
    });
    AP.addListener("appStateChange", function (s) { if (s && s.isActive) reprog(false); });
  }

  /* ---------- Respaldo nativo: guardar y compartir el archivo ---------- */
  window.exportData = async function () {
    var FS = pl("Filesystem"), SH = pl("Share");
    var fn = "mis-notas-respaldo.json";
    try {
      var j = await backupJSON(); /* incluye los archivos adjuntos */
      var w = await FS.writeFile({ path: fn, data: j, directory: "CACHE", encoding: "utf8" });
      if (await toDevice(w, fn, "application/json")) note("Copia guardada: " + fn, true);
    } catch (e) {
      if (e && /cancel/i.test(String(e.message || e))) return;
      note("No se pudo guardar la copia", false);
    }
  };

  /* Al abrir: ajustar avisos con los datos actuales (sin pedir permiso) */
  setTimeout(function () { reprog(false); }, 1500);
})();
