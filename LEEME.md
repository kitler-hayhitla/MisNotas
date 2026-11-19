# Mis notas – app Android (Capacitor + GitHub)

Archivos: `MN_V97.html` (la app), `native.js` (avisos, botón atrás, compartir archivos),
`loader.html` (cargador), `prepare.js` (genera `www/`), `fetch-fonts.js` (fuentes locales), `capacitor.config.json`,
`package.json`, `debug.keystore` (firma fija) y `.github/workflows/build-apk.yml`.

## Compilar el APK con GitHub (sin Android Studio)
1. Crea un repositorio en GitHub y sube **todo** el contenido de esta carpeta, incluida `.github`
   (con `git push` es lo más seguro; la subida web a veces omite carpetas ocultas).
2. En el repositorio entra a **Actions → Compilar APK**. Corre solo en cada push a `main`,
   o con **Run workflow**.
3. Cuando termine (unos 5–10 min), abre la ejecución y descarga **mis-notas-apk** (un zip con `app-debug.apk`).

## Actualizar la app SIN reinstalar el APK
1. Pasa el HTML nuevo al teléfono (por ejemplo descargándolo de este chat).
2. En la app: **Ajustes → Actualizar app → Elegir archivo HTML**, confirma, y la app se reinicia con la versión nueva.
- Tus datos no se tocan; además se guarda una copia previa (botón «Recuperar mis datos de antes de actualizar»).
- Si la actualización no abre bien, la app vuelve sola a la versión de fábrica.
- Si instalas un APK nuevo, la app vuelve a su versión de fábrica (la actualización guardada se descarta).
- Archivos: `loader.html` (se vuelve `index.html` y decide qué abrir) y `native.js`. `prepare.js` deja la app de fábrica en `www/app.html`.

## Cada vez que cambies el HTML
Reemplaza `MN_V97.html` (o cambia el nombre en `package.json`, scripts `prep` y `sync`) y haz push.

## Instalar encima de la app anterior
La firma de este APK es distinta a la del APK que ya tienes, así que Android no lo instalará encima.
1. En la app vieja: Ajustes → Respaldo → **Guardar copia**.
2. Desinstala la app vieja e instala el APK nuevo.
3. Ajustes → Respaldo → **Restaurar copia**.
Desde esta instalación, los APK siguientes se actualizan encima sin perder datos
(mientras uses el mismo `debug.keystore`; no lo borres ni lo cambies).

## Compilar en tu computador (opcional)
Node 20+ y Android Studio. Una sola vez: `npm install`, `node fetch-fonts.js`, `npx cap add android` y
copiar `native-android/*.java` a `android/app/src/main/java/com/misnotas/app/` (reemplaza `MainActivity.java`).
Ese plugin permite guardar las copias y exportaciones en la carpeta que elijas.
Luego `npm run android`.

## Notas
- `appId` es `com.misnotas.app`, el mismo del APK anterior. Si publicas en Play Store, no se puede cambiar después.
- `android/`, `www/` y `fonts/` no se suben: se generan en cada compilación.
- Versiones de Capacitor fijadas en 6.x con Java 17.
- Los archivos adjuntos de los pendientes se guardan en el dispositivo (IndexedDB) y van dentro de la copia de respaldo, que puede pesar bastante. Límite: 15 MB por archivo.
- Las evidencias (fotos de las notas) se reducen a máx. 1600 px antes de guardarse, así pesan poco. Para «Tomar foto» el APK necesita el permiso de cámara; el workflow ya lo añade al `AndroidManifest.xml`.
  Si compilas en tu computador, añade a mano `<uses-permission android:name="android.permission.CAMERA" />`.
