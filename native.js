/* native.js - capa nativa de Mis notas (Capacitor). Se carga DESPUÉS de la app.
   En navegador normal no hace nada; solo actúa dentro de la app instalada.
   Esta versión acelera adjuntos, respaldo y compartir (ver bloque «Optimización» más abajo). */
(function () {
  var C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;

  function pl(n) { return (window.Capacitor.Plugins || {})[n]; }

  /* ---------- Preferencias de avisos ---------- */
  /* da = días antes del pendiente (0 = sin aviso previo), ha = hora de ese aviso;
     hd = hora del aviso el mismo día (-1 = sin aviso ese día) */
  var KEY = "notas_native", NP = { pen: true, cla: true, min: 15, da: 1, ha: 18, hd: 7 };
  function inR(v, a, b) { return typeof v === "number" && v >= a && v <= b && v === Math.floor(v); }
  try {
    var r = JSON.parse(localStorage.getItem(KEY) || "null");
    if (r) {
      NP.pen = r.pen !== false;
      NP.cla = r.cla !== false;
      if ([5, 10, 15, 30, 60].indexOf(r.min) >= 0) NP.min = r.min;
      if (inR(r.da, 0, 7)) NP.da = r.da;
      if (inR(r.ha, 0, 23)) NP.ha = r.ha;
      if (inR(r.hd, -1, 23)) NP.hd = r.hd;
    }
  } catch (e) {}
  function saveNP() { try { localStorage.setItem(KEY, JSON.stringify(NP)); } catch (e) {} }
  function h12(h) { return (h % 12 || 12) + ":00 " + (h < 12 ? "am" : "pm"); }

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
            if (NP.da > 0) {
              var antes = new Date(d.getFullYear(), d.getMonth(), d.getDate() - NP.da, NP.ha, 0).getTime();
              if (antes > now + 10000) ev.push({ at: antes, title: (NP.da === 1 ? "Mañana: " : "En " + NP.da + " días: ") + t.n, body: sb.name });
            }
            if (NP.hd >= 0) {
              var dia = new Date(d.getFullYear(), d.getMonth(), d.getDate(), NP.hd, 0).getTime();
              if (dia > now + 10000) ev.push({ at: dia, title: "Hoy: " + t.n, body: sb.name });
            }
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
  function opt(v, l, sel) { return '<option value="' + v + '"' + (sel ? " selected" : "") + '>' + l + '</option>'; }
  function hrOpts(sel, none) {
    var s = none ? opt(-1, "No avisar", sel === -1) : "";
    for (var h = 0; h < 24; h++) s += opt(h, h12(h), sel === h);
    return s;
  }
  function pendCfg() {
    if (!NP.pen) return "";
    var dias = opt(0, "No avisar", NP.da === 0), n;
    for (n = 1; n <= 7; n++) dias += opt(n, n === 1 ? "1 día antes" : n + " días antes", NP.da === n);
    return '<label style="margin-top:6px">Aviso previo</label><div class="row" style="gap:6px">' +
      '<select onchange="NATIVE.cfg(\'da\',this.value)">' + dias + '</select>' +
      (NP.da > 0 ? '<select onchange="NATIVE.cfg(\'ha\',this.value)">' + hrOpts(NP.ha, false) + '</select>' : '') + '</div>' +
      '<label style="margin-top:6px">Aviso el mismo día</label><div class="row" style="gap:6px">' +
      '<select onchange="NATIVE.cfg(\'hd\',this.value)">' + hrOpts(NP.hd, true) + '</select></div>';
  }
  function card() {
    return '<details class="card cp"' + AJD("n") + '><summary>Avisos</summary>' +
      '<p class="mu">Recordatorios locales, sin internet.</p>' +
      tg("pen", "Pendientes", NP.pen) + tg("cla", "Clases", NP.cla) +
      pendCfg() +
      '<label style="margin-top:6px">Avisar las clases con</label><div class="row" style="gap:5px">' +
      [5, 10, 15, 30, 60].map(function (m) {
        return '<button class="ch' + (NP.min === m ? " on" : "") + '" onclick="NATIVE.min(' + m + ')">' + m + ' min</button>';
      }).join("") + '</div>' +
      '<div class="row" style="margin-top:10px"><button class="g" onclick="NATIVE.test()">Probar aviso</button></div></details>';
  }
  /* Avisos va al final del grupo «App» (antes de «Datos»); Actualizar app, al final de «Ayuda» */
  if (typeof vAjOrig === "function") window.vAj = function () {
    var h = vAjOrig(), k = "<h2>Datos</h2>", i = h.indexOf(k);
    if (i >= 0) h = h.slice(0, i) + card() + h.slice(i);
    else h += card();
    return h + otaCard();
  };

  window.NATIVE = {
    set: function (k) { NP[k] = !NP[k]; saveNP(); render(); sched(true); },
    min: function (m) { NP.min = m; saveNP(); render(); sched(true); },
    cfg: function (k, v) {
      v = parseInt(v, 10);
      if (isNaN(v)) return;
      if (k === "da" && inR(v, 0, 7)) NP.da = v;
      else if (k === "ha" && inR(v, 0, 23)) NP.ha = v;
      else if (k === "hd" && inR(v, -1, 23)) NP.hd = v;
      else return;
      saveNP(); render(); sched(true);
    },
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

  /* ---------- Aviso breve en pantalla («Preparando…») y base64 rápido ---------- */
  var tEl = null, tTm = 0;
  function toastOff() { clearTimeout(tTm); if (tEl) tEl.style.display = "none"; }
  function toast(msg, ms) {
    try {
      if (!tEl) {
        tEl = document.createElement("div");
        tEl.setAttribute("role", "status");
        tEl.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);bottom:calc(84px + env(safe-area-inset-bottom,0px));max-width:88vw;z-index:140;padding:9px 16px;border-radius:999px;background:var(--card);color:var(--tx);border:1.5px solid var(--ink);font-size:.85rem;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,.35);pointer-events:none;text-align:center";
        document.body.appendChild(tEl);
      }
      tEl.textContent = msg;
      tEl.style.display = "block";
      clearTimeout(tTm);
      tTm = setTimeout(toastOff, ms || 60000);
    } catch (e) {}
  }
  /* Blob o Uint8Array -> base64, con el codificador nativo del navegador (mucho más rápido que armar un texto a mano) */
  function toB64(x) {
    return new Promise(function (ok, no) {
      var rd = new FileReader();
      rd.onload = function () { ok(String(rd.result).split(",")[1] || ""); };
      rd.onerror = function () { no(rd.error); };
      rd.readAsDataURL(x instanceof Blob ? x : new Blob([x]));
    });
  }

  /* ---------- Guardar en el teléfono (selector de archivos de Android); si no está, compartir ---------- */
  /* Primero la hoja de compartir de Android (WhatsApp, Drive, correo, etc.; ahí también está «Guardar en archivos»).
     Si no está disponible o falla, se usa el selector de archivos. Devuelve false si el usuario cancela. */
  async function toDevice(w, fn, mime) {
    var SF = pl("SaveFile"), SH = pl("Share");
    if (SH) {
      try {
        await SH.share({ title: fn, url: w.uri, dialogTitle: "Compartir archivo" });
        return true;
      } catch (e) {
        if (/cancel/i.test(String(e && (e.message || e)))) return false;
        /* si falla compartir, se intenta el selector de archivos */
      }
    }
    if (SF) {
      var r = await SF.save({ path: w.uri, name: fn, mime: mime || "application/octet-stream" });
      return !!(r && r.saved);
    }
    return false;
  }
  window.NATIVE.save = async function (fn, u8, mime) {
    var FS = pl("Filesystem");
    var w = await FS.writeFile({ path: fn, data: await toB64(u8), directory: "CACHE" });
    if (await toDevice(w, fn, mime)) note("Listo: " + fn, true);
  };

  /* ---------- Compartir / abrir cualquier archivo (adjuntos) ---------- */
  window.NATIVE.file = async function (fn, u8) {
    var FS = pl("Filesystem"), SH = pl("Share");
    var w = await FS.writeFile({ path: fn, data: await toB64(u8), directory: "CACHE" });
    await SH.share({ title: fn, url: w.uri, dialogTitle: "Guardar archivo" });
    note("Archivo listo: " + fn, true);
  };
  /* Igual que file, pero recibe el Blob directo (sin pasar por arrayBuffer) */
  window.NATIVE.fileBlob = async function (fn, blob) {
    var FS = pl("Filesystem"), SH = pl("Share");
    toast("Preparando archivo…");
    try {
      var w = await FS.writeFile({ path: fn, data: await toB64(blob), directory: "CACHE" });
      toastOff();
      await SH.share({ title: fn, url: w.uri, dialogTitle: "Guardar archivo" });
      note("Archivo listo: " + fn, true);
    } catch (e) {
      toastOff();
      if (!/cancel/i.test(String(e && (e.message || e)))) toast("No se pudo abrir el archivo", 3000);
    }
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
    AP.addListener("appStateChange", function (s) { if (s && s.isActive) { reprog(false); bars(); } });
  }

  /* ---------- Respaldo nativo: guardar y compartir el archivo ---------- */
  window.exportData = async function () {
    var FS = pl("Filesystem");
    var fn = "mis-notas-respaldo.json";
    toast("Preparando copia…", 120000);
    try {
      var j = await backupJSON(); /* incluye los archivos adjuntos */
      var CH = 2097152, w;
      if (j.length <= CH) {
        w = await FS.writeFile({ path: fn, data: j, directory: "CACHE", encoding: "utf8" });
      } else {
        /* Respaldo grande: se escribe en trozos de ~2 MB para no mandar todo de golpe por el puente de Capacitor */
        var i = 0, first = true;
        while (i < j.length) {
          var e2 = Math.min(j.length, i + CH), cc = j.charCodeAt(e2 - 1);
          if (e2 < j.length && cc >= 0xD800 && cc <= 0xDBFF) e2++; /* no partir un par de sustitución */
          var part = j.slice(i, e2);
          if (first) { w = await FS.writeFile({ path: fn, data: part, directory: "CACHE", encoding: "utf8" }); first = false; }
          else await FS.appendFile({ path: fn, data: part, directory: "CACHE", encoding: "utf8" });
          i = e2;
        }
      }
      toastOff();
      if (await toDevice(w, fn, "application/json")) { try { bkOk(); } catch (e3) {} note("Copia lista: " + fn, true); }
    } catch (e) {
      toastOff();
      if (e && /cancel/i.test(String(e.message || e))) return;
      note("No se pudo guardar la copia", false);
    }
  };

  /* ---------- Optimización: adjuntos, respaldo y compartir ---------- */
  try {
    /* Respaldo: los archivos adjuntos se leen en paralelo (antes, uno por uno) y el JSON va compacto */
    if (typeof window.backupJSON === "function" && typeof window.fRefs === "function" && typeof window.fGet === "function") {
      window.backupJSON = async function () {
        var o = { ver: 3, cur: S.id, sems: DB.sems }, F = {}, ids = Object.keys(fRefs()), n = 0, k = 0;
        async function worker() {
          while (k < ids.length) {
            var id = ids[k++];
            try {
              var r = await fGet(+id);
              if (r) { F[id] = { n: r.n, t: r.t, d: await toB64(r.b) }; n++; }
            } catch (e) {}
          }
        }
        await Promise.all([worker(), worker(), worker(), worker()]);
        if (n) o.files = F;
        return JSON.stringify(o);
      };
    }

    /* Adjuntar archivo / Tomar foto en Apuntes: las fotos grandes se reducen (como las evidencias) y se procesan 3 a la vez */
    if (typeof window.patAdd === "function" && typeof window.fPut === "function") {
      window.patAdd = async function (el) {
        var fs = Array.prototype.slice.call(el.files || []);
        el.value = "";
        if (!fs.length) return;
        var total = fs.length, hecho = 0, cola = fs.slice();
        function showErr(m) { try { err(m); } catch (e) {} }
        function prog() { toast(total > 1 ? "Procesando " + hecho + " de " + total + "…" : "Procesando archivo…"); }
        async function uno(f) {
          var rec = null, name = f.name || "archivo";
          if (/^image\//.test(f.type || "") && f.size > 6e5 && typeof window.evPrep === "function") {
            try { var r = await evPrep(f); rec = r.rec; name = r.n; } catch (e) { rec = null; }
          }
          if (!rec) {
            if (f.size > FMAX) { showErr("«" + name + "» pesa más de " + Math.round(FMAX / 1048576) + " MB"); return; }
            rec = { b: f, n: name, t: f.type || "" };
          }
          var id = Date.now() + (++SQ);
          try { await fPut(id, rec); PA.push({ id: id, n: name, s: rec.b.size, t: rec.t || "" }); }
          catch (e) { showErr("No se pudo guardar «" + name + "»"); }
        }
        async function obrero() {
          while (cola.length) {
            var f = cola.shift();
            await uno(f);
            hecho++;
            prog();
          }
        }
        prog();
        try { await Promise.all([obrero(), obrero(), obrero()]); }
        finally { toastOff(); }
        var p = document.getElementById("pat");
        if (p && typeof patHTML === "function") p.innerHTML = patHTML();
      };
    }

    /* Abrir/compartir un adjunto: pasa el Blob directo al guardado (sin arrayBuffer ni bucle de texto) */
    if (typeof window.fOpen === "function" && typeof window.fGet === "function") {
      var fOpenOrig = window.fOpen;
      window.fOpen = async function (id) {
        try {
          var r = await fGet(id);
          if (!r) throw 0;
          var fn = String(r.n || "archivo").replace(/[\\\/:*?"<>|]/g, "_");
          NATIVE.fileBlob(fn, r.b);
          return;
        } catch (e) { return fOpenOrig.apply(this, arguments); }
      };
    }

    /* Compartir materia y exportar semestre: se avisa al instante que se está preparando */
    [["shareSub", "Preparando imagen…"], ["expSem", "Preparando archivo…"]].forEach(function (p) {
      var orig = window[p[0]];
      if (typeof orig !== "function") return;
      window[p[0]] = async function () {
        toast(p[1]);
        try { return await orig.apply(this, arguments); }
        finally { toastOff(); }
      };
    });
  } catch (e) {}

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
      '<p class="mu" style="font-size:.75rem;opacity:.8;word-break:break-word">Arranque: ' + esc(timing()) + '</p>' +
      '<p class="mu" style="font-size:.75rem;opacity:.8;word-break:break-word">Recepción de archivos: ' + esc(window.MN_SHDBG || "sin datos todavía") + '</p>' +
      '<div id="otam" class="msg no" style="display:none"></div>' +
      '<input type="file" id="otaf" accept=".html,.htm,text/html" style="display:none" onchange="NATIVE.otaPick(this)">' +
      '<div class="row" style="gap:10px;margin-top:14px"><button onclick="document.getElementById(\'otaf\').click()">Elegir archivo</button>' +
      (o ? '<button class="g" onclick="NATIVE.otaOff()">Versión de fábrica</button>' : '') + '</div>' +
      (o && pre ? '<div class="row" style="margin-top:10px"><button class="g" onclick="NATIVE.otaData()">Recuperar datos previos</button></div>' : '') +
      '<p class="mu" style="margin-top:16px;line-height:1.45">Un APK nuevo restaura la versión de fábrica. Si una actualización no abre, se restaura sola. Usar solo archivos propios.</p></details>';
  }
  async function otaFlow(h, name, size) {
    try {
      if (size > 4e6) throw "Archivo demasiado grande.";
      if (!/<\/body>/i.test(h) || h.indexOf("localStorage") < 0 || !/Mis notas/.test(h))
        throw "Archivo no válido: no es la app Mis notas.";
      if (!confirm("¿Instalar «" + name + "» (" + Math.round(size / 1024) + " KB)?\n\nSe guarda una copia previa de los datos y la app se reinicia.")) return;
      try {
        var dk = (typeof CFG === "object" && CFG && CFG.key) || "notas_v3", cur = localStorage.getItem(dk);
        if (cur) { localStorage.setItem("mn_preota_key", dk); localStorage.setItem("mn_preota_data", cur); }
      } catch (e) {}
      await otaDb("readwrite", function (s) { s.put({ html: xform(h), name: name, size: size, at: Date.now(), base: window.MN_BUILD }, "html"); });
      try { localStorage.setItem("mn_ota_on", "1"); } catch (e) {}
      try { localStorage.setItem("mn_try", "0"); } catch (e) {}
      location.reload();
    } catch (e) {
      otaMsg(typeof e === "string" ? e : "No se pudo instalar la actualización.", false);
    }
  }
  window.NATIVE.otaPick = async function (inp) {
    var f = inp.files && inp.files[0];
    inp.value = "";
    if (!f) return;
    var h;
    try { h = await f.text(); } catch (e) { otaMsg("No se pudo leer el archivo.", false); return; }
    otaFlow(h, f.name, f.size);
  };
  /* HTML recibido desde «Compartir» o «Abrir con» */
  async function otaShared() {
    var SF = pl("SaveFile");
    if (!SF || !SF.getShared) { window.MN_SHDBG = "este APK no trae la función de recibir archivos"; return; }
    try {
      var r = await SF.getShared();
      window.MN_SHDBG = (r && r.html ? "archivo recibido · " : "ningún archivo pendiente · ") + ((r && r.dbg) || "Android no entregó datos");
      if (r && r.html) {
        var nm = r.name || "archivo", t = String(r.html).replace(/^\uFEFF/, "").trimStart();
        if (/\.json$/i.test(nm) || (t.charAt(0) === "{" && !/<html|<!doctype/i.test(t.slice(0, 300)))) {
          /* copia de respaldo: se restaura con el mismo flujo de «Restaurar copia» */
          if (typeof importData === "function") {
            try { importData({ target: { files: [new File([r.html], nm, { type: "application/json" })], value: "" } }); }
            catch (e) { otaMsg("No se pudo abrir la copia de respaldo.", false); }
          } else otaMsg("La app aún no está lista; vuelve a abrir el archivo.", false);
        } else otaFlow(r.html, nm, r.html.length);
      }
    } catch (e) { window.MN_SHDBG = "error: " + ((e && e.message) || e); }
  }
  window.addEventListener("mnshared", otaShared);
  setTimeout(otaShared, 1800);
  window.NATIVE.otaOff = async function () {
    if (!confirm("¿Volver a la versión de fábrica? Los datos se conservan.")) return;
    try {
      await otaDb("readwrite", function (s) { s.delete("html"); });
      try { localStorage.removeItem("mn_ota_on"); } catch (e) {}
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
      try { localStorage.removeItem("mn_ota_on"); } catch (e) {}
      otaDb("readwrite", function (s) { s.delete("html"); }).then(function () {
        try { localStorage.removeItem("mn_try"); localStorage.setItem("mn_ota_fail", "1"); } catch (e) {}
        location.reload();
      }).catch(function () {});
    }
  }, 3500);


  /* ---------- Barra de estado y fondo de arranque según el tema ---------- */
  /* Tiempos del arranque (ms desde que abrió la página): cargador listo, app entregada al navegador, app lista, primer dibujo */
  var TM = window.MN_T || {};
  function timing() {
    var p = [];
    if (TM.ini != null) p.push("cargador " + TM.ini);
    if (TM.write != null) p.push("app leída " + TM.write);
    if (TM.ready != null) p.push("lista " + TM.ready);
    if (TM.paint != null) p.push("primer dibujo " + TM.paint);
    return p.length ? p.join(" · ") + " ms" : "sin datos";
  }
  function mark(k) { TM[k] = Math.round(performance.now()); window.MN_T = TM; }
  if (document.readyState === "complete") mark("ready"); else window.addEventListener("load", function () { mark("ready"); });
  try { requestAnimationFrame(function () { requestAnimationFrame(function () { mark("paint"); }); }); } catch (e) {}
  function bars() {
    var m = document.querySelector('meta[name="theme-color"]'), c = m && m.getAttribute("content");
    if (!c || !/^#[0-9a-f]{6}$/i.test(c)) return;
    try { localStorage.setItem("mn_bg", c); } catch (e) {}
    var BG = pl("SaveFile");
    try { if (BG && BG.setBg) BG.setBg({ color: c }).catch(function () {}); } catch (e) {}
    var SB = pl("StatusBar");
    if (!SB) return;
    var L = (0.299 * parseInt(c.substr(1, 2), 16) + 0.587 * parseInt(c.substr(3, 2), 16) + 0.114 * parseInt(c.substr(5, 2), 16)) / 255;
    try { SB.setBackgroundColor({ color: c }).catch(function () {}); } catch (e) {}
    try { SB.setStyle({ style: L > 0.6 ? "LIGHT" : "DARK" }).catch(function () {}); } catch (e) {}
  }
  try {
    var mt = document.querySelector('meta[name="theme-color"]');
    if (mt) new MutationObserver(bars).observe(mt, { attributes: true, attributeFilter: ["content"] });
  } catch (e) {}
  setTimeout(bars, 300);

  /* Al abrir: ajustar avisos con los datos actuales (sin pedir permiso) */
  setTimeout(function () { reprog(false); }, 1500);
})();
