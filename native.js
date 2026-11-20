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
  if (typeof saveOrig === "function") window.save = function () {
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
      '<p class="mu">Recordatorios locales, sin internet.</p>' +
      tg("pen", "Pendientes", NP.pen) + tg("cla", "Clases", NP.cla) +
      '<label style="margin-top:6px">Avisar las clases con</label><div class="row" style="gap:5px">' +
      [5, 10, 15, 30, 60].map(function (m) {
        return '<button class="ch' + (NP.min === m ? " on" : "") + '" onclick="NATIVE.min(' + m + ')">' + m + ' min</button>';
      }).join("") + '</div>' +
      '<p class="mu" style="margin-top:8px">Pendientes: aviso el día anterior a las 6 pm y el mismo día a las 7 am.</p>' +
      '<div class="row"><button class="g" onclick="NATIVE.test()">Probar aviso</button></div></details>';
  }
  if (typeof vAjOrig === "function") window.vAj = function () { return vAjOrig() + card() + otaCard(); };

  window.NATIVE = {
    set: function (k) { NP[k] = !NP[k]; saveNP(); render(); sched(true); },
    min: function (m) { NP.min = m; saveNP(); render(); sched(true); },
    test: async function () {
      var LN = pl("LocalNotifications");
      if (!LN) return;
      try {
        var pm = await LN.checkPermissions();
        if (pm.display !== "granted") pm = await LN.requestPermissions();
        if (pm.display !== "granted") { alert("Activar las notificaciones de Mis notas en los ajustes del teléfono."); return; }
        try { await LN.createChannel({ id: "recordatorios", name: "Recordatorios", importance: 4 }); } catch (e) {}
        await LN.schedule({ notifications: [{ id: 9999, title: "Mis notas", body: "Aviso de prueba.", channelId: "recordatorios" }] });
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


  /* ---------- Actualizar la app desde un archivo HTML (sin reinstalar el APK) ---------- */
  function otaDb(mode, fn) {
    return new Promise(function (ok, no) {
      var q = indexedDB.open("mn_ota", 1);
      q.onupgradeneeded = function () { q.result.createObjectStore("k"); };
      q.onerror = function () { no(q.error); };
      q.onsuccess = function () {
        var tx = q.result.transaction("k", mode);
        fn(tx.objectStore("k"));
        tx.oncomplete = function () { ok(); };
        tx.onerror = tx.onabort = function () { no(tx.error); };
      };
    });
  }
  function otaMsg(t, good) {
    var e = document.getElementById("otam");
    if (!e) { alert(t); return; }
    e.className = "msg " + (good ? "ok" : "no");
    e.textContent = t;
    e.style.display = "block";
  }
  /* Mismos ajustes que prepare.js: fuentes locales y native.js */
  function xform(h) {
    if (document.querySelector('link[href="fonts/fonts.css"]')) {
      var re = /<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">[\s\S]*?<\/noscript>/;
      if (re.test(h)) h = h.replace(re, '<link rel="stylesheet" href="fonts/fonts.css">');
      if (h.indexOf("var FNT={") >= 0) h = h.replace("var FNT={", "var FNT={},FNT_OFF={");
    }
    if (h.indexOf('<script src="native.js">') < 0) {
      var i = h.lastIndexOf("</body>");
      h = h.slice(0, i) + '<script src="native.js"></script>\n' + h.slice(i);
    }
    return h;
  }
  function otaCard() {
    var o = window.MN_OTA, pre = false;
    try { pre = !!localStorage.getItem("mn_preota_data"); } catch (e) {}
    var st = o
      ? 'Instalada: <b>' + esc(o.name) + '</b> · ' + new Date(o.at).toLocaleString("es", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })
      : 'Usando la versión de fábrica (la del APK).';
    return '<details class="card cp"' + AJD("u") + '><summary>Actualizar app</summary>' +
      '<p class="mu" style="line-height:1.45">Instala una versión nueva desde un archivo HTML, sin reinstalar el APK. Los datos no se modifican.</p>' +
      '<p class="mu" style="margin-top:10px">' + st + '</p>' +
      '<div id="otam" class="msg no" style="display:none"></div>' +
      '<input type="file" id="otaf" accept=".html,.htm,text/html" style="display:none" onchange="NATIVE.otaPick(this)">' +
      '<div class="row" style="gap:10px;margin-top:14px"><button onclick="document.getElementById(\'otaf\').click()">Elegir archivo</button>' +
      (o ? '<button class="g" onclick="NATIVE.otaOff()">Versión de fábrica</button>' : '') + '</div>' +
      (o && pre ? '<div class="row" style="margin-top:10px"><button class="g" onclick="NATIVE.otaData()">Recuperar datos previos</button></div>' : '') +
      '<p class="mu" style="margin-top:16px;line-height:1.45">Un APK nuevo restaura la versión de fábrica. Si una actualización no abre, se restaura sola. Usar solo archivos propios.</p></details>';
  }
  window.NATIVE.otaPick = async function (inp) {
    var f = inp.files && inp.files[0];
    inp.value = "";
    if (!f) return;
    try {
      if (f.size > 4e6) throw "Archivo demasiado grande.";
      var h = await f.text();
      if (!/<\/body>/i.test(h) || h.indexOf("localStorage") < 0 || !/Mis notas/.test(h))
        throw "Archivo no válido: no es la app Mis notas.";
      if (!confirm("¿Instalar «" + f.name + "» (" + Math.round(f.size / 1024) + " KB)?\n\nSe guarda una copia previa de los datos y la app se reinicia.")) return;
      try {
        var dk = (typeof CFG === "object" && CFG && CFG.key) || "notas_v3", cur = localStorage.getItem(dk);
        if (cur) { localStorage.setItem("mn_preota_key", dk); localStorage.setItem("mn_preota_data", cur); }
      } catch (e) {}
      await otaDb("readwrite", function (s) { s.put({ html: xform(h), name: f.name, size: f.size, at: Date.now(), base: window.MN_BUILD }, "html"); });
      try { localStorage.setItem("mn_try", "0"); } catch (e) {}
      location.reload();
    } catch (e) {
      otaMsg(typeof e === "string" ? e : "No se pudo instalar la actualización.", false);
    }
  };
  window.NATIVE.otaOff = async function () {
    if (!confirm("¿Volver a la versión de fábrica? Los datos se conservan.")) return;
    try {
      await otaDb("readwrite", function (s) { s.delete("html"); });
      try { localStorage.removeItem("mn_try"); } catch (e) {}
      location.reload();
    } catch (e) { otaMsg("No se pudo volver a la versión de fábrica.", false); }
  };
  window.NATIVE.otaData = function () {
    if (!confirm("Reemplaza los datos actuales por la copia guardada antes de la última actualización. Lo registrado después se pierde.\n\n¿Continuar?")) return;
    try {
      localStorage.setItem(localStorage.getItem("mn_preota_key"), localStorage.getItem("mn_preota_data"));
      location.reload();
    } catch (e) { otaMsg("No se pudieron recuperar los datos.", false); }
  };

  /* Vigilante: si la actualización no abre bien, vuelve sola a la de fábrica */
  try {
    if (localStorage.getItem("mn_ota_fail") === "1") {
      localStorage.removeItem("mn_ota_fail");
      setTimeout(function () { alert("La actualización no abrió; se restauró la versión de fábrica. Datos intactos."); }, 1200);
    }
  } catch (e) {}
  setTimeout(function () {
    var ok = false;
    try { ok = typeof render === "function" && typeof DB === "object" && !!DB && document.getElementById("app").children.length > 0; } catch (e) {}
    if (ok) { try { localStorage.setItem("mn_try", "0"); } catch (e) {} return; }
    if (window.MN_OTA) {
      otaDb("readwrite", function (s) { s.delete("html"); }).then(function () {
        try { localStorage.removeItem("mn_try"); localStorage.setItem("mn_ota_fail", "1"); } catch (e) {}
        location.reload();
      }).catch(function () {});
    }
  }, 3500);

  /* Al abrir: ajustar avisos con los datos actuales (sin pedir permiso) */
  setTimeout(function () { reprog(false); }, 1500);
})();
