# ADR-0025 · Carpeta de descarga escrita desde Rust y último acceso local

- **Estado:** Aceptado (plan de la pista U1 aprobado por el usuario el 2026-10-29;
  revisión independiente del PR #6 el mismo día; UX-02, UX-08)
- **Contexto:** hasta ahora cada exportación (plan y casos `.xlsx`/`.pdf`,
  `.feature`, ZIP de proyecto y global, matriz, plantillas, adjuntos del
  planificador, paquete de diagnóstico) era una descarga del WebView2 con
  `<a download>`, que siempre acaba en la carpeta Descargas. La spec pide una
  carpeta de descarga elegida con el selector nativo (UX-02). Para eso alguien
  tiene que escribir el archivo en una ruta que no es Descargas, y un WebView no
  debe poder escribir donde quiera. Además, el Inicio de la spec §5 (UX-08) pide
  el "último acceso" de cada proyecto, un dato que el modelo no guardaba.
- **Decisión:**
  - **Rust escribe el archivo.** El frontend pasa todo por `saveFile`
    (`@shared/export/saveFile`). Esta función envía los bytes como cuerpo
    binario del comando `download_save` (`src-tauri/src/downloads.rs`), con el
    nombre en la cabecera `x-pharos-filename`.
    - El WebView **solo manda un nombre**, nunca una ruta. Rust lo reduce a un
      único componente seguro: sin separadores ni caracteres que Windows
      rechaza, sin nombres reservados y con 180 caracteres como máximo. Si
      tiene que recortar, recorta el nombre y conserva la extensión.
    - Nunca sobrescribe. El nombre final se reserva con `create_new`, con
      `nombre (2).ext` y siguientes si ya existe, así que dos guardados
      simultáneos no eligen el mismo. El contenido se escribe en un temporal
      único, se hace `fsync` y se renombra sobre esa reserva.
    - Se ejecuta fuera del hilo principal (`#[tauri::command(async)]`): un ZIP
      grande o una carpeta de red lenta no congelan la ventana.
  - **La carpeta solo se elige con el selector nativo** (`download_dir_pick`),
    que Rust abre con la crate `rfd`: solo en Windows, sin funciones por
    defecto y modal sobre la ventana principal.
    - `capabilities/default.json` no cambia (`core:default`): el WebView no
      recibe permisos de diálogo ni de sistema de archivos.
    - Se descarta `tauri-plugin-dialog`: arrastra `tauri-plugin-fs`, que exige
      tauri 2.12. Eso subiría tauri y unas 50 crates, y rompería la
      coincidencia de versión menor con `@tauri-apps/api`/CLI 2.11.
      `rfd` es la crate que ese plugin usa por debajo y añade una sola entrada
      al `Cargo.lock`.
  - **Ámbito de la carpeta: por instalación y cuenta de Windows, no por usuario
    de Pharos.** Se guarda en `downloads.json`, en el directorio de
    configuración de la instancia, como el tema de Windows y no como los datos.
    Un perfil E2E tiene el suyo.
    - Es una preferencia del equipo: dónde quiere esta persona sus archivos en
      este disco.
    - Dos cuentas de Pharos en la misma cuenta de Windows comparten carpeta. Es
      un caso raro, y ninguna puede leer los archivos de la otra a través de
      Pharos.
    - Si la carpeta tuviera que ser por usuario, la clave pasaría a ser
      `user_id` en ese mismo archivo, sin migración.
  - **Nada falla en silencio.**
    - **Carpeta sin escritura:** si la carpeta elegida no existe o no se puede
      escribir (acceso denegado, disco lleno, acceso controlado a carpetas),
      el archivo va a Descargas. El resultado lo indica (`fallback`) y la app
      lo avisa.
    - **Guardado fallido:** muestra un aviso de error y rechaza con
      `ReportedError`, que los llamadores ignoran con `unlessReported`.
    - **PDF con error:** un PDF que pdfmake no consigue generar rechaza, por su
      propio rechazo asíncrono o por un tiempo límite de 60 s, en vez de
      quedarse colgado. En un ZIP, ese PDF se omite y se informa.
  - **Mark-of-the-Web solo para contenido ajeno.** Los adjuntos del
    planificador (`x-pharos-untrusted: 1`) reciben el flujo `Zone.Identifier`
    (zona Internet) para que Windows y Office avisen antes de abrirlos, como
    con una descarga del navegador. Las exportaciones que genera Pharos no lo
    llevan: si lo llevaran, Excel abriría siempre en vista protegida los
    documentos propios.
  - **Último acceso: por equipo y por usuario, en `localStorage`**
    (`pharos.projects.lastAccess.<userId>`), sin migración (la 0019 no se
    usa).
    - Solo guarda ids de proyecto y fechas, ningún contenido.
    - No es un dato del proyecto: sincronizarlo metería en el oplog un cambio
      cada vez que se abre un proyecto.
    - Si no hay registro, el Inicio usa la última actualización.
- **Alternativas:**
  - `tauri-plugin-dialog` + `tauri-plugin-fs` con permisos de ámbito limitado:
    exige subir tauri a 2.12 y da al WebView capacidad de escribir.
  - Pedir al WebView2 que cambie su carpeta de descargas
    (`ICoreWebView2Profile.DefaultDownloadFolderPath`): no lo expone Tauri 2.11,
    y sigue sin garantizar que no se sobrescriba ni avisar del destino.
  - Último acceso en una tabla local (migración 0019) o sincronizado: más
    superficie (migración, purga, oplog) para un dato de comodidad.
  - Mark-of-the-Web en todo: los documentos propios se abrirían siempre en
    vista protegida.
- **Consecuencias:**
  - `downloads.rs` es el único sitio que escribe archivos para el usuario. Un
    nuevo tipo de exportación llama a `saveFile`; si su contenido viene de
    otra persona, pasa `untrusted: true`.
  - El selector solo existe en Windows; en otra plataforma `download_dir_pick`
    responde que no está disponible y se usa Descargas.
  - El último acceso no viaja entre equipos y se pierde si se borran los
    datos del WebView. En ese caso el Inicio ordena por fecha de actualización.
  - El E2E de diagnóstico sigue buscando el ZIP en Descargas, porque su perfil
    no tiene carpeta elegida.
