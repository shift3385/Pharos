# ADR-0024 · Clave de recuperación de la base de datos local

- **Estado:** Aceptado (plan de la pista S1 aprobado por el usuario el
  2026-10-29, con el formato base32 en grupos; SEC-03)
- **Contexto:** la base local (`pharos.db.enc`) se cifra con AES-256-GCM y una
  clave de 32 bytes (`db-key`) que solo vive en el keychain del sistema
  ([ADR-0006](0006-claves-ia-y-tls.md) sigue la misma regla para las claves de
  IA). Si se pierde el keychain (PC nuevo, Windows reinstalado, otra cuenta),
  los datos no se pueden descifrar. Además, hasta ahora, si faltaba la entrada
  del keychain la app generaba una clave nueva y la guardaba encima, y luego
  fallaba al abrir el archivo con un error genérico.
- **Decisión:**
  - **La clave de recuperación es la propia `db-key`**, no una clave que la
    envuelve. Así cubre también todo lo que se deriva de ella, como la clave de
    las evidencias ([ADR-0014](0014-evidencias-cifradas-por-hash.md)), y no
    hace falta recifrar nada al exportarla.
  - **Formato** (`src-tauri/src/recovery.rs`):
    - carga: `clave (32 bytes) || comprobación (3 bytes)`, con
      `comprobación = SHA-256("pharos-recovery-v1" || clave)[..3]`;
    - texto: los 35 bytes (280 bits) en **56 caracteres Crockford base32**, en
      14 grupos de 4 separados por `-` (`XXXX-XXXX-…`);
    - la versión del formato va en el dominio de la comprobación: un formato
      futuro (`-v2`) no pasa nunca por este;
    - al leer da igual mayúsculas o minúsculas, espacios y guiones, e `I`/`L`
      valen `1` y `O` vale `0`;
    - una errata se detecta por la comprobación (la probabilidad de que pase
      es de 1 entre 16,7 millones) y, si pasara, la clave aún tiene que
      descifrar el archivo.
  - **Abrir la BD** (`db.rs`):
    - solo se genera una clave en una instalación nueva, es decir, cuando no
      existe `pharos.db.enc` ni `pharos.db.enc.new`;
    - si falta la clave en el keychain pero hay un archivo cifrado, el error
      empieza por `db-key-missing` y no se guarda ninguna clave;
    - si la clave del keychain no descifra el archivo, el error empieza por
      `db-key-mismatch` (otra clave, o un archivo dañado: AES-GCM no los
      distingue).
  - **Importar** (`db_recover`): solo se acepta mientras la BD no abrió por uno
    de esos dos errores, así que nunca puede reemplazar la clave de una BD
    abierta. Comprueba el formato (`recovery-key-invalid`), abre el archivo
    con la clave (`recovery-key-wrong` si no lo descifra) y solo entonces la
    guarda en el keychain y deja la app abierta sin reiniciar. Una clave mala
    no toca ni los archivos ni el keychain.
  - **Exportar** (`recovery_key_export`): en **Perfil → Clave de
    recuperación**, tras una confirmación. Se muestra una vez en un diálogo,
    con indicaciones para guardarla (papel o gestor de contraseñas, nunca junto
    a la copia de los datos). Para cerrar hay que marcar "Ya la he guardado";
    al cerrar se olvida. Solo se guarda la fecha en que se mostró, en
    `localStorage`, nunca la clave.
- **Modelo de amenazas:**
  - **Protege de:** perder el keychain. Con el `.enc` (y `evidence/` cuando
    exista) y la clave de recuperación se recuperan los datos en otro equipo.
  - **No protege de:** alguien que tenga la clave de recuperación y una copia
    de los datos, que puede leerlos. Por eso la guía pide no guardarlas juntas.
    Tampoco de perder las dos cosas: Pharos no tiene copia de la clave.
  - **Por dónde nunca pasa la clave:** logs, sync, URLs, el servidor, el
    paquete de diagnóstico, ni el portapapeles sin que el usuario pulse
    "Copiar". Ningún error repite la clave escrita. Como red de seguridad, los
    dos redactores (`diag::redact` y `@shared/diagnostics`) enmascaran la forma
    de una clave de recuperación como `<recovery-key>`, escrita con guiones o
    con espacios.
  - **Por dónde sí pasa:** al exportarla, por IPC hasta la interfaz para
    mostrarla, y al importarla, de la interfaz a Rust. Eso es una acción
    explícita del usuario. No se borra de la memoria de forma activa
    (`zeroize`): el proceso ya tiene la clave en claro mientras la BD está
    abierta.
- **Alternativas:**
  - **24 palabras tipo BIP39.** Se copian mejor a mano, pero hacen falta listas
    de 2048 palabras por idioma, y una clave exportada en español fallaría al
    escribirla con la interfaz en inglés. Se descartó.
  - **Una clave aparte que envuelva `db-key`** (o una contraseña con KDF). Se
    podría rotar sin recifrar los datos, pero añade otro secreto que guardar y
    otro formato que mantener para la misma amenaza. Se descartó para 0.1.0. Si
    SEC-05 cambia de clave, se revisa aquí.
  - **Sin comprobación.** Una errata solo se vería como "clave incorrecta", sin
    distinguirla de otra clave. Se descartó.
- **Consecuencias:**
  - Una copia de seguridad completa son `pharos.db.enc` (más `evidence/` cuando
    exista) y la clave de recuperación (README, "Local data backups").
  - Las copias `pharos.db.enc.bak-…` (SEC-06) usan la misma clave, así que la
    misma clave de recuperación las abre.
  - Rotar `db-key` (SEC-05) invalida las claves de recuperación exportadas: la
    app tendrá que pedir exportar otra.
  - CORE-02 (test del keychain real) sigue pendiente: los tests de recuperación
    usan un `KeyStore` en memoria.
