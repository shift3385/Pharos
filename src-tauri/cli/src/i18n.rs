//! The CLI's texts in Spanish and English (ADR-0054 §2). The language is
//! `--lang`, then `PHAROS_LANG`, then the system's; Spanish for any `es*`,
//! English otherwise. Error codes (`db-in-use`) are printed the same in both,
//! so the manual can be searched by them. `{0}`, `{1}`… are arguments.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Lang {
    Es,
    En,
}

impl Lang {
    /// `es`, `es-ES`, `es_419.UTF-8` → Spanish; `en…` → English; else None.
    pub fn parse(raw: &str) -> Option<Lang> {
        let tag = raw.trim().to_ascii_lowercase();
        if tag.starts_with("es") {
            Some(Lang::Es)
        } else if tag.starts_with("en") {
            Some(Lang::En)
        } else {
            None
        }
    }

    /// The system's language: `LC_ALL`, `LC_MESSAGES`, `LANG` (Unix shells,
    /// Git Bash), then the Windows user locale.
    pub fn system(var: impl Fn(&str) -> Option<String>) -> Lang {
        for name in ["LC_ALL", "LC_MESSAGES", "LANG"] {
            if let Some(lang) = var(name).as_deref().and_then(Lang::parse) {
                return lang;
            }
        }
        windows_locale()
            .as_deref()
            .and_then(Lang::parse)
            .unwrap_or(Lang::En)
    }
}

#[cfg(windows)]
fn windows_locale() -> Option<String> {
    use windows_sys::Win32::Globalization::GetUserDefaultLocaleName;
    // LOCALE_NAME_MAX_LENGTH
    let mut buf = [0u16; 85];
    // SAFETY: the buffer and its length in UTF-16 units are passed together.
    let n = unsafe { GetUserDefaultLocaleName(buf.as_mut_ptr(), buf.len() as i32) };
    (n > 1).then(|| String::from_utf16_lossy(&buf[..(n as usize - 1)]))
}

#[cfg(not(windows))]
fn windows_locale() -> Option<String> {
    None
}

/// The text of `key` in `lang` with its arguments. An unknown key gives the
/// key itself (a test checks every key used in the code exists in both).
pub fn tr(lang: Lang, key: &str, args: &[String]) -> String {
    let table = match lang {
        Lang::Es => ES,
        Lang::En => EN,
    };
    let mut text = table
        .iter()
        .find(|(k, _)| *k == key)
        .map(|(_, t)| (*t).to_string())
        .unwrap_or_else(|| key.to_string());
    for (n, arg) in args.iter().enumerate() {
        text = text.replace(&format!("{{{n}}}"), arg);
    }
    text
}

const ES: &[(&str, &str)] = &[
    // ---- the mode line and the results
    ("out.mode-local", "Modo local · Pharos de este equipo ({0}) · como {1}"),
    ("out.mode-local-project", "Modo local · Pharos de este equipo ({0}) · proyecto {1} ({2}) · como {3}"),
    ("out.dry-run", "Simulación (--dry-run): no se escribe nada."),
    ("out.created", "{0} creado"),
    ("out.into", "{0}"),
    ("out.would-create", "un run nuevo"),
    ("out.counts", "{0} resultados · {1} pasan · {2} fallan · {3} omitidos · {4} vinculados a casos · {5} sin vincular"),
    ("out.attachments", "{0} adjuntos guardados"),
    ("out.already", "ya estaba importado en {0}: no se ha escrito nada"),
    ("out.duplicate-of", "Este fichero ya está en {0}. Al importar de verdad no se escribiría nada (o usa --allow-duplicate)."),
    ("out.summary", "Importados {0} de {1} al run {2}."),
    ("out.summary-none", "No se ha importado ningún fichero."),
    ("out.summary-dry", "Simulados {0} de {1}."),
    ("out.open-in-app", "Ábrelo en Pharos › {0} › Ejecuciones › {1}."),
    ("out.closed", "Run {0} cerrado como completado."),
    ("out.warnings", "{0} avisos:"),
    ("out.unlinked-hint", "{0} tests sin caso. Añade @{1}n al nombre del test para vincularlos."),
    ("out.projects-none", "No tienes proyectos en este Pharos."),
    ("out.projects-head", "Prefijo   Nombre"),
    // ---- doctor
    ("doc.version", "pharos {0} · formato Pharos Run {1}"),
    ("doc.exe", "Instalado en {0}"),
    ("doc.config", "Config: {0}"),
    ("doc.no-config", "Sin pharos.toml en esta carpeta ni en las de arriba"),
    ("doc.mode", "Modo que se usaría: {0}"),
    ("doc.mode-local", "local"),
    ("doc.mode-remote", "remoto ({0})"),
    ("doc.local", "Local"),
    ("doc.data-dir", "Datos en {0}"),
    ("doc.no-data", "No hay datos de Pharos en {0}. Abre Pharos una vez en este equipo."),
    ("doc.user", "Sesión de {0} ({1})"),
    ("doc.no-user", "Nadie ha iniciado sesión en Pharos en este equipo."),
    ("doc.db-ok", "La base de datos se abre ({0} proyectos)"),
    ("doc.remote", "Servidor"),
    ("doc.remote-later", "El modo remoto llega en una versión próxima del CLI (L2)."),
    ("doc.summary", "{0} avisos · {1} errores · código {2}"),
    // ---- errors
    ("err.internal", "Error inesperado."),
    ("err.no-data", "No hay datos de Pharos en {0}. Abre Pharos una vez en este equipo, o indica otra carpeta con --data-dir."),
    ("err.db-in-use", "Otro proceso de Pharos está actualizando la carpeta de datos (por ejemplo, la app al instalar una versión nueva). Espera unos segundos y repite."),
    ("err.db-busy", "La base de datos local está ocupada con otra escritura larga (por ejemplo, una sincronización de la app). Espera unos segundos y repite."),
    ("err.db-key", "No se puede abrir la base de datos local con la clave de este equipo. Abre Pharos: te pedirá la clave de recuperación."),
    ("err.project-not-found", "No tienes un proyecto con el prefijo o id «{0}». Mira los tuyos con: pharos projects"),
    ("err.project-not-found-core", "El proyecto no existe o no es tuyo."),
    ("err.project-required", "Falta el proyecto. Pásalo con --project <prefijo> o ponlo en pharos.toml (project = \"PAG\")."),
    ("err.ambiguous-project", "Varios proyectos tienen ese prefijo. Usa el id del que quieras."),
    ("err.cycle-not-found", "El proyecto no tiene un ciclo abierto «{0}»."),
    ("err.run-not-found", "El proyecto no tiene un run «{0}»."),
    ("err.run-closed", "El run {0} está cerrado: sube a uno nuevo (sin --run)."),
    ("err.invalid-report", "{0}: no es un informe válido."),
    ("err.invalid-xml", "{0}: no es un XML válido."),
    ("err.invalid-report-issues", "{0}: no es un Pharos Run JSON válido ({1} problemas)."),
    ("err.format-not-local", "{0}: {1} no se puede importar en modo local. El modo local lee Pharos Run JSON y JUnit. Súbelo a tu servidor (--server URL) o usa «Importar informe» en la app."),
    ("err.unreadable", "{0}: no se puede leer el fichero."),
    ("err.too-big", "{0}: pesa más de {1} MB."),
    ("err.no-files", "Ningún fichero coincide con «{0}»."),
    ("err.no-file-args", "Indica al menos un informe: pharos upload <fichero o patrón>…"),
    ("err.not-signed-in", "Nadie ha iniciado sesión en Pharos en este equipo. Abre la app e inicia sesión; el CLI escribe como esa cuenta."),
    ("err.local-in-ci", "En CI no hay un Pharos de escritorio: usa el modo remoto (PHAROS_URL y PHAROS_TOKEN)."),
    ("err.mode-conflict", "--local y --server no van juntos."),
    ("err.remote-later", "El modo remoto todavía no está en esta versión del CLI (llega con L2). Usa --local o quita el servidor de la configuración."),
    ("err.command-later", "«pharos {0}» llega en una versión próxima del CLI."),
    ("err.external-id-local", "--external-id solo tiene sentido en modo remoto."),
    ("err.run-and-name", "--run y --run-name no van juntos: --run sube a un run que ya existe."),
    ("err.unknown-option", "Opción desconocida: {0}. Mira: pharos help {1}"),
    ("err.missing-value", "Falta el valor de {0}."),
    ("err.unknown-command", "Comando desconocido: {0}. Mira: pharos help"),
    ("err.bad-lang", "Idioma desconocido: {0}. Usa es o en."),
    ("err.token-in-file", "{0}: los tokens no van en ficheros. Usa la variable PHAROS_TOKEN o pharos login."),
    ("err.bad-config", "{0}: no se puede leer ({1})."),
    ("err.token-flag", "No existe --token: quedaría en el historial y en la lista de procesos. Usa la variable PHAROS_TOKEN, --token-stdin o pharos login."),
    ("err.attachment-missing", "adjunto «{0}» no encontrado en {1}"),
    ("err.partial", "{0} de {1} ficheros fallaron."),
    // ---- help
    ("out.mode-remote", "Modo remoto · {0} · proyecto {1} · token {2}"),
    ("out.external-id", "Run de este CI: {0}"),
    ("out.summary-remote", "Subidos {0} de {1} al run {2}."),
    ("out.findings-metrics", "{0} hallazgos · {1} métricas"),
    ("out.unlinked-hint-remote", "{0} tests sin caso. Añade la etiqueta @<prefijo>n del caso al nombre del test para vincularlos."),
    ("out.projects-head-remote", "Prefijo   Nombre  ·  Workspace"),
    ("out.closed-aborted", "Run {0} cerrado como abortado."),
    ("out.token-project", "Token de proyecto"),
    ("out.token-personal", "Token personal"),
    ("out.token-of", "{0} de {1} · {2} · permisos: {3} · caduca el {4}"),
    ("out.token-expires-soon", "El token caduca en {0} días. Renuévalo en Pharos (Integraciones o Mi perfil)."),
    ("out.paste-token", "Pega tu token (no se verá al escribir):"),
    ("out.login-saved", "Guardado en el almacén de credenciales del sistema para {0}. Ese servidor queda como el de por defecto."),
    ("out.logout", "Token de {0} borrado del almacén de credenciales."),
    ("doc.server-ok", "{0} responde (API v1)"),
    ("gh.open", "Abrir en Pharos"),
    ("gh.project", "Proyecto"),
    ("gh.head", "| Informe | Formato | Pasan | Fallan | Omitidos | Hallazgos | Métricas |"),
    ("gh.already", "ya estaba"),
    ("err.bad-server", "Dirección de servidor no válida: {0}. Usa https://servidor (sin ruta)."),
    ("err.insecure-server", "{0}: http:// solo vale para localhost; el token viajaría en claro. Usa https://."),
    ("err.no-server", "Falta el servidor: --server URL, la variable PHAROS_URL o server en pharos.toml."),
    ("err.no-token", "No hay token para {0}. Usa la variable PHAROS_TOKEN, --token-stdin o pharos login."),
    ("err.bad-token", "Eso no parece un token de Pharos (empiezan por phr_)."),
    ("err.keychain", "No se pudo usar el almacén de credenciales del sistema."),
    ("err.no-keychain", "Este sistema no tiene un almacén seguro de credenciales, así que no guardo el token. Usa la variable PHAROS_TOKEN."),
    ("err.ca-cert", "No se puede leer el certificado de PHAROS_CA_CERT ({0})."),
    ("err.unreachable", "No se puede conectar con {0}."),
    ("err.api-auth", "El servidor no acepta el token (HTTP {0}): revocado, caducado o de una cuenta desactivada."),
    ("err.api-forbidden", "El token no tiene permiso para esto (HTTP {0})."),
    ("err.api-not-found", "El servidor no encuentra el proyecto o el run (HTTP {0})."),
    ("err.api-run-closed", "El run está cerrado (HTTP {0}): sube a uno nuevo (sin --run)."),
    ("err.api-report", "El servidor rechazó el informe (HTTP {0})."),
    ("err.api-usage", "El servidor rechazó la petición (HTTP {0})."),
    ("err.api-server", "El servidor no puede atender ahora (HTTP {0}). Repite en unos minutos."),
    ("err.api-other", "Respuesta inesperada del servidor (HTTP {0})."),
    ("err.run-and-external-id", "--run y --external-id no van juntos."),
    ("err.bad-status", "Estado de cierre desconocido: {0}. Usa completed o aborted."),
    ("err.run-required", "Indica el run: pharos run close RUN-n, o --external-id."),
    ("help.main", "pharos — sube resultados de pruebas a Pharos\n\nUso:\n  pharos upload <fichero o patrón>… [opciones]   Sube informes a un run\n  pharos projects [opciones]                     Lista tus proyectos\n  pharos doctor [opciones]                       Comprueba la instalación y la conexión\n  pharos login [--server URL]                    Guarda un token en el almacén de credenciales\n  pharos logout [--server URL]                   Lo borra\n  pharos run close [RUN-n] [--status aborted]    Cierra un run del servidor\n  pharos help [comando]                          Esta ayuda\n  pharos --version\n\nPróximamente: pharos watch -- <cmd>.\n\nCódigos de salida: 0 bien · 1 error interno · 2 uso · 3 autenticación · 4 no encontrado ·\n5 informe no válido · 6 base de datos en uso · 7 servidor inalcanzable · 8 parcial.\nManual: capítulo 20, «Línea de comandos e integración continua»."),
    ("help.upload", "pharos upload <fichero o patrón>… [opciones]\n\nSube uno o más informes al mismo run.\n\n  -p, --project <prefijo|id>  Proyecto (o project en pharos.toml)\n      --run <RUN-n>            Un run abierto que ya existe\n      --run-name <texto>       Nombre del run nuevo\n      --cycle <CYC-n>          Ciclo del run nuevo\n      --config <nombre>        Configuración de los resultados que no la traen\n      --case <TC-n>            Vincula al caso los resultados que no traen uno\n      --allow-duplicate        Importa otra vez un fichero que el proyecto ya tiene\n      --dry-run                Muestra qué haría, sin escribir\n      --local | --server <URL> Fuerza el modo\n      --external-id <id>       Remoto: run idempotente (en GitHub Actions, el del CI)\n      --close                  Remoto: cierra el run al terminar\n  -f, --format <formato>       Remoto: comprueba el formato (el servidor lo detecta)\n      --token-stdin            Remoto: lee el token de la entrada estándar\n      --data-dir <ruta>        Otra carpeta de datos (o PHAROS_DATA_DIR)\n      --json                   Una línea JSON por fichero y un resumen\n      --lang es|en  --quiet  --no-color\n\nModo local: escribe en el Pharos de este equipo, también con la app abierta, y lee Pharos Run JSON y JUnit.\nModo remoto (--server, PHAROS_URL): sube cualquier formato que lea el servidor."),
    ("help.projects", "pharos projects [--local] [--json]\n\nLista tus proyectos con su prefijo, que es lo que pide --project."),
    ("help.doctor", "pharos doctor [--json]\n\nComprueba la versión, la configuración, la sesión y la base de datos local.\nSale con 0 si solo hay avisos."),
];

const EN: &[(&str, &str)] = &[
    ("out.mode-local", "Local mode · Pharos on this computer ({0}) · as {1}"),
    ("out.mode-local-project", "Local mode · Pharos on this computer ({0}) · project {1} ({2}) · as {3}"),
    ("out.dry-run", "Dry run (--dry-run): nothing is written."),
    ("out.created", "{0} created"),
    ("out.into", "{0}"),
    ("out.would-create", "a new run"),
    ("out.counts", "{0} results · {1} passed · {2} failed · {3} skipped · {4} linked to cases · {5} unlinked"),
    ("out.attachments", "{0} attachments stored"),
    ("out.already", "already imported into {0}: nothing was written"),
    ("out.duplicate-of", "This file is already in {0}. A real import would write nothing (or use --allow-duplicate)."),
    ("out.summary", "Imported {0} of {1} into run {2}."),
    ("out.summary-none", "No file was imported."),
    ("out.summary-dry", "Dry-ran {0} of {1}."),
    ("out.open-in-app", "Open it in Pharos › {0} › Runs › {1}."),
    ("out.closed", "Run {0} closed as completed."),
    ("out.warnings", "{0} warnings:"),
    ("out.unlinked-hint", "{0} tests without a case. Add @{1}n to the test name to link them."),
    ("out.projects-none", "You have no projects in this Pharos."),
    ("out.projects-head", "Prefix    Name"),
    ("doc.version", "pharos {0} · Pharos Run format {1}"),
    ("doc.exe", "Installed in {0}"),
    ("doc.config", "Config: {0}"),
    ("doc.no-config", "No pharos.toml in this folder or above"),
    ("doc.mode", "Mode that would be used: {0}"),
    ("doc.mode-local", "local"),
    ("doc.mode-remote", "remote ({0})"),
    ("doc.local", "Local"),
    ("doc.data-dir", "Data in {0}"),
    ("doc.no-data", "No Pharos data in {0}. Open Pharos once on this computer."),
    ("doc.user", "Signed in as {0} ({1})"),
    ("doc.no-user", "Nobody is signed in to Pharos on this computer."),
    ("doc.db-ok", "The database opens ({0} projects)"),
    ("doc.remote", "Server"),
    ("doc.remote-later", "Remote mode comes in an upcoming version of the CLI (L2)."),
    ("doc.summary", "{0} warnings · {1} errors · exit code {2}"),
    ("err.internal", "Unexpected error."),
    ("err.no-data", "No Pharos data in {0}. Open Pharos once on this computer, or give another folder with --data-dir."),
    ("err.db-in-use", "Another Pharos process is updating the data folder (the app installing a new version, for example). Wait a few seconds and try again."),
    ("err.db-busy", "The local database is busy with another long write (a sync of the app, for example). Wait a few seconds and try again."),
    ("err.db-key", "The local database can't be opened with this computer's key. Open Pharos: it will ask for the recovery key."),
    ("err.project-not-found", "You have no project with the prefix or id \"{0}\". List yours with: pharos projects"),
    ("err.project-not-found-core", "The project does not exist or is not yours."),
    ("err.project-required", "No project given. Pass --project <prefix> or set it in pharos.toml (project = \"PAG\")."),
    ("err.ambiguous-project", "Several projects have that prefix. Use the id of the one you want."),
    ("err.cycle-not-found", "The project has no open cycle \"{0}\"."),
    ("err.run-not-found", "The project has no run \"{0}\"."),
    ("err.run-closed", "Run {0} is closed: upload to a new one (without --run)."),
    ("err.invalid-report", "{0}: not a valid report."),
    ("err.invalid-xml", "{0}: not valid XML."),
    ("err.invalid-report-issues", "{0}: not valid Pharos Run JSON ({1} problems)."),
    ("err.format-not-local", "{0}: {1} can't be imported in local mode. Local mode reads Pharos Run JSON and JUnit. Upload it to your server (--server URL) or use Import report in the app."),
    ("err.unreadable", "{0}: the file can't be read."),
    ("err.too-big", "{0}: larger than {1} MB."),
    ("err.no-files", "No file matches \"{0}\"."),
    ("err.no-file-args", "Give at least one report: pharos upload <file or pattern>…"),
    ("err.not-signed-in", "Nobody is signed in to Pharos on this computer. Open the app and sign in; the CLI writes as that account."),
    ("err.local-in-ci", "There is no desktop Pharos in CI: use remote mode (PHAROS_URL and PHAROS_TOKEN)."),
    ("err.mode-conflict", "--local and --server can't be used together."),
    ("err.remote-later", "Remote mode is not in this version of the CLI yet (it comes with L2). Use --local or remove the server from the configuration."),
    ("err.command-later", "\"pharos {0}\" comes in an upcoming version of the CLI."),
    ("err.external-id-local", "--external-id only makes sense in remote mode."),
    ("err.run-and-name", "--run and --run-name can't be used together: --run uploads to an existing run."),
    ("err.unknown-option", "Unknown option: {0}. See: pharos help {1}"),
    ("err.missing-value", "{0} needs a value."),
    ("err.unknown-command", "Unknown command: {0}. See: pharos help"),
    ("err.bad-lang", "Unknown language: {0}. Use es or en."),
    ("err.token-in-file", "{0}: tokens don't belong in files. Use the PHAROS_TOKEN variable or pharos login."),
    ("err.bad-config", "{0}: can't be read ({1})."),
    ("err.token-flag", "There is no --token: it would end up in the shell history and the process list. Use the PHAROS_TOKEN variable, --token-stdin or pharos login."),
    ("err.attachment-missing", "attachment \"{0}\" not found in {1}"),
    ("err.partial", "{0} of {1} files failed."),
    ("out.mode-remote", "Remote mode · {0} · project {1} · token {2}"),
    ("out.external-id", "Run of this CI: {0}"),
    ("out.summary-remote", "Uploaded {0} of {1} into run {2}."),
    ("out.findings-metrics", "{0} findings · {1} metrics"),
    ("out.unlinked-hint-remote", "{0} tests without a case. Add the case tag @<prefix>n to the test name to link them."),
    ("out.projects-head-remote", "Prefix    Name  ·  Workspace"),
    ("out.closed-aborted", "Run {0} closed as aborted."),
    ("out.token-project", "Project token"),
    ("out.token-personal", "Personal token"),
    ("out.token-of", "{0} of {1} · {2} · scopes: {3} · expires {4}"),
    ("out.token-expires-soon", "The token expires in {0} days. Renew it in Pharos (Integrations or My profile)."),
    ("out.paste-token", "Paste your token (it won't show as you type):"),
    ("out.login-saved", "Saved in the system credential store for {0}. That server is now the default."),
    ("out.logout", "Token of {0} removed from the credential store."),
    ("doc.server-ok", "{0} answers (API v1)"),
    ("gh.open", "Open in Pharos"),
    ("gh.project", "Project"),
    ("gh.head", "| Report | Format | Passed | Failed | Skipped | Findings | Metrics |"),
    ("gh.already", "already there"),
    ("err.bad-server", "Not a valid server address: {0}. Use https://server (no path)."),
    ("err.insecure-server", "{0}: http:// is only allowed for localhost; the token would travel in clear text. Use https://."),
    ("err.no-server", "No server given: --server URL, the PHAROS_URL variable or server in pharos.toml."),
    ("err.no-token", "No token for {0}. Use the PHAROS_TOKEN variable, --token-stdin or pharos login."),
    ("err.bad-token", "That doesn't look like a Pharos token (they start with phr_)."),
    ("err.keychain", "The system credential store could not be used."),
    ("err.no-keychain", "This system has no secure credential store, so the token is not saved. Use the PHAROS_TOKEN variable."),
    ("err.ca-cert", "The certificate in PHAROS_CA_CERT can't be read ({0})."),
    ("err.unreachable", "Can't connect to {0}."),
    ("err.api-auth", "The server doesn't accept the token (HTTP {0}): revoked, expired or of a disabled account."),
    ("err.api-forbidden", "The token is not allowed to do this (HTTP {0})."),
    ("err.api-not-found", "The server can't find the project or the run (HTTP {0})."),
    ("err.api-run-closed", "The run is closed (HTTP {0}): upload to a new one (without --run)."),
    ("err.api-report", "The server refused the report (HTTP {0})."),
    ("err.api-usage", "The server refused the request (HTTP {0})."),
    ("err.api-server", "The server can't take it right now (HTTP {0}). Try again in a few minutes."),
    ("err.api-other", "Unexpected answer from the server (HTTP {0})."),
    ("err.run-and-external-id", "--run and --external-id can't be used together."),
    ("err.bad-status", "Unknown closing status: {0}. Use completed or aborted."),
    ("err.run-required", "Name the run: pharos run close RUN-n, or --external-id."),
    ("help.main", "pharos — upload test results to Pharos\n\nUsage:\n  pharos upload <file or pattern>… [options]   Upload reports into a run\n  pharos projects [options]                    List your projects\n  pharos doctor [options]                      Check the installation and the connection\n  pharos login [--server URL]                  Store a token in the credential store\n  pharos logout [--server URL]                 Remove it\n  pharos run close [RUN-n] [--status aborted]  Close a run on the server\n  pharos help [command]                        This help\n  pharos --version\n\nComing soon: pharos watch -- <cmd>.\n\nExit codes: 0 ok · 1 internal error · 2 usage · 3 authentication · 4 not found ·\n5 invalid report · 6 database in use · 7 server unreachable · 8 partial.\nManual: chapter 20, \"Command line and continuous integration\"."),
    ("help.upload", "pharos upload <file or pattern>… [options]\n\nUploads one or more reports into the same run.\n\n  -p, --project <prefix|id>   Project (or project in pharos.toml)\n      --run <RUN-n>            An existing open run\n      --run-name <text>        Name of the new run\n      --cycle <CYC-n>          Cycle of the new run\n      --config <name>          Configuration of the results that have none\n      --case <TC-n>            Links the results that have no case to this one\n      --allow-duplicate        Import again a file the project already has\n      --dry-run                Show what it would do, without writing\n      --local | --server <URL> Force the mode\n      --external-id <id>       Remote: idempotent run (in GitHub Actions, the CI's)\n      --close                  Remote: close the run at the end\n  -f, --format <format>        Remote: check the format (the server detects it)\n      --token-stdin            Remote: read the token from standard input\n      --data-dir <path>        Another data folder (or PHAROS_DATA_DIR)\n      --json                   One JSON line per file and a summary\n      --lang es|en  --quiet  --no-color\n\nLocal mode: writes into Pharos on this computer, also with the app open, and reads Pharos Run JSON and JUnit.\nRemote mode (--server, PHAROS_URL): uploads any format the server reads."),
    ("help.projects", "pharos projects [--local] [--json]\n\nLists your projects with their prefix, which is what --project takes."),
    ("help.doctor", "pharos doctor [--json]\n\nChecks the version, the configuration, the session and the local database.\nExits with 0 when there are only warnings."),
];

#[cfg(test)]
mod tests {
    use super::*;

    fn keys(table: &[(&'static str, &'static str)]) -> Vec<&'static str> {
        let mut k: Vec<&'static str> = table.iter().map(|(k, _)| *k).collect();
        k.sort_unstable();
        k
    }

    fn placeholders(text: &str) -> Vec<usize> {
        let mut found: Vec<usize> = (0..10)
            .filter(|n| text.contains(&format!("{{{n}}}")))
            .collect();
        found.sort_unstable();
        found
    }

    #[test]
    fn both_languages_have_the_same_keys_and_arguments() {
        assert_eq!(keys(ES), keys(EN));
        let mut seen = std::collections::HashSet::new();
        for (key, es) in ES {
            assert!(seen.insert(*key), "duplicate key {key}");
            let en = EN.iter().find(|(k, _)| k == key).unwrap().1;
            assert_eq!(placeholders(es), placeholders(en), "{key}");
        }
    }

    #[test]
    fn every_key_the_code_uses_exists() {
        let sources = [
            include_str!("exit.rs"),
            include_str!("lib.rs"),
            include_str!("args.rs"),
            include_str!("config.rs"),
            include_str!("local.rs"),
            include_str!("doctor.rs"),
            include_str!("output.rs"),
            include_str!("remote.rs"),
            include_str!("files.rs"),
            include_str!("junit.rs"),
        ];
        for src in sources {
            for prefix in ["\"err.", "\"out.", "\"doc.", "\"help.", "\"gh."] {
                for (i, _) in src.match_indices(prefix) {
                    let rest = &src[i + 1..];
                    let end = rest.find('"').unwrap();
                    let key = &rest[..end];
                    if key.ends_with('.') {
                        continue; // a prefix built at run time, like "help." + command
                    }
                    assert!(ES.iter().any(|(k, _)| *k == key), "missing key {key}");
                }
            }
        }
    }

    #[test]
    fn languages_parse_from_locale_tags() {
        assert_eq!(Lang::parse("es-ES"), Some(Lang::Es));
        assert_eq!(Lang::parse("es_419.UTF-8"), Some(Lang::Es));
        assert_eq!(Lang::parse("EN-us"), Some(Lang::En));
        assert_eq!(Lang::parse("fr-FR"), None);
        let env = |name: &str| (name == "LANG").then(|| "es_ES.UTF-8".to_string());
        assert_eq!(Lang::system(env), Lang::Es);
        assert_eq!(
            tr(Lang::En, "err.no-files", &["*.xml".into()]),
            "No file matches \"*.xml\"."
        );
    }
}
