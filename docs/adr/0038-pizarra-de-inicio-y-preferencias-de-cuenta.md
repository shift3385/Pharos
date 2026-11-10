# ADR-0038 · Pizarra de Inicio y preferencias que viajan con la cuenta

- **Estado:** Aceptado (boceto y decisiones aprobados por el usuario el
  2026-11-09; UX-27)
- **Contexto:**
  - En el escritorio, Inicio obligaba a desplazarse para verlo entero, y la
    información principal quedaba fuera de la vista.
  - El usuario aprobó convertirlo en una pizarra de gadgets: una cuadrícula de
    24 × 24 bajo la cabecera, con una distribución por defecto, mover y
    redimensionar con el ratón y el teclado, ocultar y restablecer.
  - El usuario también decidió que la distribución se guarde **con la cuenta**:
    independiente para cada cuenta y la misma en todos sus equipos.
  - Hasta ahora ninguna preferencia viajaba con la cuenta:
    - El tema, el idioma, la sincronización automática, el fondo y el periodo
      de Inicio se guardan en `localStorage`, por equipo.
    - La carpeta de descarga va en `downloads.json`, por instalación
      ([ADR-0025](0025-carpeta-descarga-y-ultimo-acceso.md)).
    - El sync de documentos
      ([ADR-0020](0020-sync-por-usuario-cascada-y-version.md)) lleva entidades
      de proyecto con dueño, oplog y conflictos, no preferencias.
- **Decisión:**
  - **Preferencias de cuenta en el servidor.**
    - La migración `0017_user_preferences` crea la tabla `user_preferences`:
      `user_id`, `key`, `value jsonb` y `updated_at`, con una fila por usuario
      y clave. Se borra en cascada con el usuario.
    - Rutas `GET` y `PUT /api/me/preferences/:key`
      (`server/src/modules/preferences/preferences.ts`). Exigen sesión y una
      versión de cliente admitida, como el resto de `/api`. Cada usuario solo
      lee y escribe las suyas.
    - Las claves son una lista cerrada (`PREFERENCE_KEYS`; hoy solo
      `home.board`) y el valor ocupa como mucho 16 KiB de JSON.
    - El `PUT` usa el sobre `{ input }` de las escrituras de la web.
  - **Gana el cambio más reciente.**
    - Cada valor lleva la hora en que se eligió (`updatedAt`), que el
      servidor solo sustituye si recibe una posterior. Un cambio hecho sin
      conexión y enviado más tarde pierde ante otro más reciente hecho en otro
      equipo.
    - Una hora más de 5 minutos en el futuro (un reloj adelantado) se guarda
      como «ahora + 5 min», para que no gane siempre.
    - El servidor responde con lo que guarda, y el cliente lo adopta.
  - **Copia en cada equipo**
    (`src/modules/profile/api/accountPreferences.ts`).
    - Cada equipo guarda su copia por cuenta en
      `localStorage["pharos.prefs.<userId>.<clave>"]`.
    - Así el Inicio sale al momento y sin conexión, también en el escritorio,
      cuyo almacén cifrado no hace falta para algo que no es un dato de prueba.
    - Un cambio sin confirmar queda `pending` y se envía en la siguiente
      lectura.
    - Inicio lee la cuenta al abrirse y tras cada sincronización
      (`pharos:synced`).
    - Cerrar sesión no borra la copia: es de esa cuenta y otra cuenta no la ve.
  - **El formato de la distribución lleva versión** (`version: 1`,
    `src/app/dashboard/model/board.ts`). `readBoard` lee lo que haya:
    - un gadget nuevo que la distribución guardada no conoce va al primer
      hueco;
    - un gadget que ya no existe se descarta;
    - tamaños por debajo del mínimo o solapes se corrigen;
    - una versión más nueva que la de la app se ignora: se usa la distribución
      por defecto, que no se guarda sobre la otra;
    - cambiar los gadgets en el futuro pide subir la versión y migrar aquí.
  - **`react-grid-layout` (MIT) para el ratón.**
    - Resuelve el arrastre, el redimensionado, los mínimos por gadget y la
      compactación hacia arriba.
    - El teclado usa la misma compactación (`verticalCompactor`), así que las
      flechas y el ratón dejan distribuciones parecidas.
    - Pesa unos 74 KB minificados (24 KB con gzip), con `react-draggable`,
      `react-resizable`, `clsx`, `fast-equals`, `prop-types` y
      `resize-observer-polyfill`; todas son MIT y pasan `check:licenses`.
  - **24 filas a la vista, más si hacen falta.**
    - La altura de fila se calcula para que las 24 filas llenen el alto libre.
      La distribución por defecto las ocupa exactamente, sin desplazamiento
      desde 1280 × 800.
    - Una distribución puede bajar hasta 48 filas. Si no, una pizarra llena
      no se podría reordenar sin pasar antes por un estado imposible. Inicio
      pasa entonces a tener desplazamiento y la línea de ayuda del modo
      configurar lo dice.
- **Alternativas:**
  - **Llevar las preferencias por el sync de documentos.** Habría que añadir
    un tipo de entidad en Rust y en el servidor, con oplog, conflictos y
    lápidas, para un valor sin dueño de proyecto que nunca entra en conflicto
    de forma útil. Se descartó por su coste.
  - **Guardar en `localStorage` solamente.** Sería por equipo y no viajaría con
    la cuenta, en contra de la decisión del usuario.
  - **Una columna `preferences jsonb` en `users`.** Es más simple, pero
    mezclaría claves con distinto ritmo de cambio en una sola escritura y en
    una sola hora de cambio.
  - **dnd-kit (ya instalado) con un motor de cuadrícula propio.** No añade
    dependencias, pero obligaría a escribir y mantener el arrastre, el
    redimensionado y la compactación que `react-grid-layout` ya resuelve.
  - **Cargar `react-grid-layout` solo al personalizar.** Ahorraría 24 KB, pero
    habría que dibujar la cuadrícula dos veces (en CSS al verla y con la
    librería al configurarla), y montar los gadgets otra vez al cambiar de
    modo.
- **Consecuencias:**
  - Las preferencias que el usuario quiera que viajen con la cuenta (tema,
    idioma, periodo de Inicio) se pueden pasar aquí añadiendo su clave a
    `PREFERENCE_KEYS` y usando `savePreference` y `pullPreference`. Este cambio
    no las mueve: siguen por equipo.
  - Gana el más reciente por la hora del equipo: con relojes muy desajustados
    (menos de 5 min adelantados) puede ganar el cambio que no era el último.
  - Sin conexión, la distribución elegida se ve en ese equipo y llega a los
    demás cuando vuelve la conexión y se abre Inicio o se sincroniza.
  - Una app anterior a UX-27 no conoce la ruta; una más nueva que cambie la
    versión del formato no rompe a esta, que mostrará la distribución por
    defecto.
