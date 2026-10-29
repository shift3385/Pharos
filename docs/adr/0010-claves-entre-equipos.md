# ADR-0010 · Claves de caso, requisito y defecto únicas entre equipos

- **Estado:** Aceptado (decisión del usuario, 2026-10-28; DAT-01, pista A2). Opción B.
  Enmendado el 2026-10-29 (pista A3, fase 2 implementada): ver "Enmienda A3" al final.
- **Contexto:**
  - Tres entidades tienen una clave visible que una persona lee, escribe en un
    informe y pega en el código de automatización:
    - el caso de prueba: `scenario_id`, p. ej. `ATS_001`, con el prefijo y los
      dígitos que configura el proyecto;
    - el requisito: `requirement_key`, p. ej. `REQ-001`;
    - el defecto: `card_key`, p. ej. `DEF-001`.
  - Las claves viajan como tags de Gherkin (`@ATS_001`, `@REQ-001`; ROADMAP §8).
    Desde ese momento un repositorio de automatización depende de ellas. Si una
    clave cambia o pasa a otra entidad, el vínculo se rompe sin avisar.
  - Hoy cada equipo calcula la clave con el máximo local + 1
    (`test_case.rs` `next_scenario_id`, `requirement.rs` `next_requirement_key`,
    `planner.rs` `next_defect_key`). Si dos equipos crean sin conexión en el
    mismo proyecto, los dos generan `ATS_007`, y tras sincronizar hay dos casos
    con la misma clave.
  - Además:
    - `test_cases` no tiene índice único sobre la clave; `planner_cards`
      tampoco. `requirements` sí lo tiene, pero solo en local.
    - `next_scenario_id` ignora los casos borrados, así que **reutiliza** la
      clave de un caso eliminado. Un tag `@ATS_001` antiguo pasa a señalar otro
      caso.
    - `scenario_id` se puede editar en `update_case`; un valor vacío lo deja en `''`.
    - La purga real de borrados (SYNC-06) eliminará filas. Si el siguiente
      número se deduce de las filas que existen, la purga también hará que se
      reutilicen claves.
  - Escenarios previstos:
    - hasta 0.3.0, un usuario con varios equipos (dos PCs);
    - en 0.3.0, varios usuarios en un workspace compartido (ADR-0003);
    - en 0.4.0, el móvil, que trabaja sin conexión en campo.
  - El servidor guarda hoy documentos por usuario. No ve claves, solo
    `entity_id` (UUID).

- **Requisitos de la decisión:**
  1. **Legible:** `ATS_001`, no un UUID. Respeta el prefijo y los dígitos del
     proyecto.
  2. **Inmutable** desde que se asigna. Nunca se reutiliza, ni tras borrar ni
     tras purgar.
  3. **Única por proyecto** entre todos los equipos y usuarios, también en
     0.3.0 y 0.4.0.
  4. **Se puede crear sin conexión.** Lo normal es tener la clave definitiva al
     momento.
  5. Encaja en el sync por entidad (ADR-0002) y en los workspaces (ADR-0003).

- **Alternativas:**

  | Opción                                                 | Cómo funciona                                                                                                                                      | A favor                                                                                                                                                 | En contra                                                                                                                                                                                                                                                          |
  | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | **A · Prefijo o sufijo por equipo**                    | La clave lleva un código del equipo: `ATS_001-K7` o `ATS_K7-001`.                                                                                  | Única por construcción, sin servidor.                                                                                                                   | Claves largas y feas. Una misma persona tiene series distintas en cada PC. Rompe el formato de las plantillas (`ATS_001`). Incumple el requisito 1.                                                                                                                |
  | **B · Bloques por equipo** (Hi/Lo)                     | Cada equipo reserva en el servidor un bloque de números por proyecto y tipo (p. ej. 50) y lo gasta sin conexión. Pide otro cuando le quedan pocos. | Clave definitiva y legible al instante, sin conexión. Ninguna colisión mientras quede bloque. Escala a workspaces y al móvil (el bloque es por equipo). | Numeración con huecos (`ATS_001…ATS_050`, luego `ATS_051` en otro PC). Necesita un endpoint y una tabla en el servidor. Sin bloque y sin conexión hace falta otra salida (ver la regla 4 de la decisión).                                                          |
  | **C · El servidor asigna; clave provisional en local** | Sin conexión, el caso recibe una clave provisional. El servidor da la definitiva en el primer push.                                                | Numeración continua y sin huecos. Nunca hay colisión.                                                                                                   | Lo normal (crear y exportar el `.feature` en el momento) no tiene clave estable hasta sincronizar. Hay que bloquear o avisar al exportar. Los `requirementKeys` que apuntan a claves provisionales se reescriben. Incumple el requisito 4 en el caso más habitual. |
  | **D · Renombrar al colisionar**                        | Máximo local + 1, como hoy. Al sincronizar, el servidor detecta la colisión y el que pierde recibe el siguiente número libre.                      | Lo más simple; casi no cambia el código.                                                                                                                | Cambia una clave que quizá ya se exportó como tag. Rompe la automatización sin avisar. Incumple el requisito 2. Una tabla de alias mitiga, pero no evita la confusión.                                                                                             |
  | **E · Clave corta aleatoria**                          | `TC-7K3P9` (base32 Crockford, 5 caracteres) en lugar de un número.                                                                                 | Sin coordinación y con colisión casi imposible.                                                                                                         | No es secuencial: rompe la convención `ATS_001` de las plantillas y de los usuarios. Incumple el requisito 1.                                                                                                                                                      |

- **Decisión propuesta:** opción **B, bloques por equipo**, con estas reglas:
  1. **Contador propio, nunca derivado de las filas.** Una tabla local
     `key_counters (project_id, kind, next_value, block_end)` guarda el
     siguiente número de cada proyecto y tipo (`case`, `requirement`,
     `defect`). Al crear una clave se toma `next_value` y se incrementa. Borrar
     o purgar filas no lo hace retroceder, así que una clave nunca se reutiliza
     (requisito 2).
  2. **Inmutable.** Cuando se asigna, `scenario_id` no cambia: `update_case`
     deja de aceptarlo y la UI lo muestra de solo lectura. `requirement_key` ya
     es inmutable y `card_key` ya se conserva.
  3. **El dueño del rango.** Un proyecto que todavía no se ha subido nunca
     solo existe en el equipo que lo creó. Ese equipo numera libremente. En el
     primer push, el servidor registra el máximo usado como inicio de los
     bloques futuros.
  4. **Bloques:**
     - Con conexión, el cliente reserva bloques de 50 por proyecto y tipo
       (`POST /sync/key-blocks`). Pide uno nuevo cuando quedan menos de 10.
     - El servidor guarda un máximo por proyecto y tipo y nunca entrega dos
       veces el mismo rango.
     - Sin bloque y sin conexión, el caso se crea con una clave **provisional**
       visible (`ATS_?3F2A`). Esa clave no se puede exportar como tag: el
       `.feature` avisa y omite el tag. Recibe la definitiva en el siguiente
       sync. Es la salida de la opción C, pero solo para el caso raro.
  5. **Claves escritas a mano** (importación de Excel o CSV, campo manual al
     crear):
     - se aceptan si no chocan en local;
     - **nunca resucitan una clave borrada:** la clave de un caso, requisito o
       defecto borrado (o purgado) cuenta como usada. Al crear se rechaza; en
       una importación CSV esa fila se omite y se informa;
     - si el servidor detecta un duplicado al recibirlas, la entidad pasa al
       panel de conflictos para que la persona elija otra clave;
     - nunca se renombra sola.
  6. **Red de seguridad local:** índices únicos `(project_id, scenario_id)` y
     `(project_id, card_key)` entre las filas vivas, como ya tiene
     `requirements`. La misma regla se aplica en el servidor cuando indexe por
     proyecto (TEN-01). Llega en la fase 2 (ver Consecuencias).

- **Precisiones** (revisión independiente, 2026-10-28):
  - **Una clave provisional se sustituye por la definitiva.**
    - En la misma transacción se reescriben las referencias por clave:
      `data.requirementKeys` de los casos del proyecto, cuando lo sustituido es
      un requisito.
    - Los vínculos por id (`data.testCaseIds` de los defectos) no cambian.
    - Una clave provisional nunca llega a un `.feature`, así que ningún
      repositorio de automatización la conoce.
  - **Cambiar `case_id_prefix`.**
    - El contador y los bloques son números por proyecto y tipo; no dependen
      del prefijo.
    - Las claves ya asignadas conservan su prefijo, porque son inmutables.
    - Las nuevas usan el prefijo nuevo y siguen la numeración: tras `ATS_007`
      viene `TC-008`.
  - **Un segundo equipo del mismo usuario recibe el proyecto antes de tener
    bloque.**
    - El dueño del rango (regla 3) solo existe hasta el primer push. En ese
      push, el servidor registra el máximo usado y entrega al equipo creador
      su primer bloque, a partir de ese máximo.
    - Cualquier otro equipo que reciba el proyecto empieza sin bloque. Pide
      uno antes de numerar y, hasta tenerlo, sin conexión, usa claves
      provisionales.
  - **"Nunca el mismo rango dos veces", con varios usuarios.**
    - El servidor guarda un máximo por `(project_id, kind)`, no por usuario.
    - Entrega un bloque con un `UPDATE … SET next = next + 50 RETURNING`
      dentro de una transacción, que bloquea esa fila. Dos peticiones
      simultáneas, de cualquier usuario, no pueden recibir el mismo rango.
    - Con los workspaces (TEN-01), la fila pasa a ser del proyecto compartido
      y la regla no cambia.

- **Consecuencias:**
  - **Parte local**, migración `0016` y `src-tauri/src/keys.rs`, hecha en la
    fase 1 de A2:
    - Tabla `key_counters`. La fila de cada proyecto y tipo se crea la primera
      vez que se pide una clave. Se inicializa con el máximo que el proyecto
      usó alguna vez, incluidas las filas borradas.
    - Una clave ya usada por cualquier fila, viva o borrada, se salta.
    - Los `next_*` leen el contador.
    - Una clave escrita a mano o importada que ya usó cualquier fila del
      proyecto, viva o borrada, se rechaza en el repositorio. La importación
      CSV omite esa fila y la informa.
    - `scenario_id` pasa a ser inmutable, también en la UI.
    - **SYNC-06** debe crear el contador de un proyecto antes de purgar sus
      filas. Si no, una purga sin contador permitiría volver a numerar desde
      un número bajo.
  - **La regla 6 se aplaza a la fase 2** (decisión del usuario, 2026-10-28):
    - Con un índice único, un pull que trae un caso cuya clave ya usa un caso
      vivo local distinto haría fallar el `INSERT` de `sync.rs::write_doc`, y
      con él todo el pull.
    - Por eso los índices únicos de casos y defectos llegan en la migración
      local `0017`, junto con el manejo de ese choque en el sync: el choque va
      al panel de conflictos.
    - La misma `0017` conservará la clave viva más antigua si una base ya tiene
      duplicados y renombrará las demás con el sufijo `-dupN`. Esas claves ya
      eran ambiguas, y el caso se anotará en el CHANGELOG.
    - Los requisitos ya tenían índice único (`0010`). SYNC-04a debe tratar el
      mismo choque cuando los sincronice.
  - **Parte de servidor**, en la fase 2 de A2, después de A1:
    - migración de servidor `0006` (`key_blocks`) y el endpoint de bloques;
    - reserva de bloques en `sync.rs`;
    - detección de duplicados al recibir claves escritas a mano.
  - La numeración tiene huecos entre equipos. Se documenta en el GLOSARIO:
    la clave identifica, no cuenta.
  - Hasta la fase 2, la parte local ya evita reutilizar claves, pero dos PCs
    sin conexión aún pueden crear la misma clave. El criterio de DAT-01 ("tras
    sincronizar no hay claves duplicadas") se cumple con la fase 2.
  - Con los workspaces (0.3.0), el contador del servidor pasa de "por usuario"
    a "por proyecto" sin cambiar el protocolo de bloques.

- **Enmienda A3** (2026-10-29, pista A3; la fase 2 queda implementada). Lo que
  cambia o se precisa respecto a lo anterior:
  - **Duplicados que ya existían: se conserva la clave del id más bajo, no la
    del más antiguo.** `created_at` no se puede comparar entre equipos: un pull
    escribe la hora del equipo que lo recibe. El servidor (migración `0006`) y
    el escritorio (migración local `0017`) aplican la misma regla, así que
    todos los equipos acaban con las mismas claves. En local se prefiere antes
    la fila que el servidor ya conoce (con `sync_base`), porque es la que el
    servidor tiene. Las demás:
    - una fila que el servidor no tiene recibe `-dup1`, `-dup2`… y se envía
      con ella;
    - una fila que el servidor ya tiene **no se renombra en local**: recibe una
      clave provisional y un conflicto de clave. El equipo no puede saber qué
      ve el servidor (otro equipo pudo borrar allí la fila que aquí gana), así
      que renombrar sin más podía divergir en silencio (revisión del
      2026-10-29). El pull trae la clave que decidió el servidor y cierra el
      conflicto. Si el servidor había conservado la clave para esta fila, la
      lápida de la que la tenía aquí se la devuelve (`holder_deleted`). Una
      fila que el servidor nunca tuvo no recupera así una clave borrada
      (regla 2).
    - Las condiciones de la reparación y de los índices únicos son las mismas
      (claves vivas no vacías), para que crear los índices no pueda fallar.
  - **Bloques** (`POST /sync/key-blocks`, tabla de servidor `key_blocks`):
    - una fila por `(project_id, kind)` con `owner_id`: solo la cuenta dueña del
      proyecto pide bloques (el proyecto de otra cuenta se rechaza en
      `refused`). El primero que pide bloques de un proyecto aún no subido
      queda como dueño;
    - el bloque empieza en el mayor de: el siguiente número nunca entregado,
      el `floor` del equipo (su siguiente número, regla 3) y el mayor número
      de la serie que el servidor guarda para ese proyecto (claves subidas
      antes de que existieran los bloques). Solo cuentan las claves que son
      el `prefix` de la petición seguido de dígitos: una clave escrita a mano
      como `JIRA-48213` no adelanta la numeración;
    - 50 números por bloque; el equipo pide otro cuando le quedan menos de 10,
      en cada sync, antes del push. Los números que sobran de un bloque se
      pierden (huecos).
  - **Clave provisional:** `<prefijo>?<4 letras>` (`ATS_?KQZD`). Nunca termina
    en dígitos, así que nunca parece un número de la serie. El `.feature` no la
    escribe como tag y el export lo avisa. En el siguiente sync, tras recibir el
    bloque, recibe la definitiva en una transacción que también reescribe los
    `requirementKeys` de los casos del proyecto.
    - Un proyecto que ya se sincronizó antes de esta versión no tiene bloque:
      sus claves nuevas son provisionales hasta el primer sync con conexión.
  - **Duplicado al recibir:**
    - el push rechaza un upsert cuya clave usa otro documento vivo del mismo
      proyecto (`keyConflicts`). La comprobación corre bajo el bloqueo de
      escritura del usuario; el índice de servidor `documents_key_idx` no es
      `UNIQUE` a propósito, para que el duplicado vuelva como conflicto y no
      como transacción fallida. Con TEN-01 el bloqueo debe ser por proyecto;
    - solo recibe `keyConflicts` un cliente que declara entenderlo
      (`x-pharos-sync-features: key-conflicts`). Un cliente anterior lleva la
      misma versión (`0.1.0-alpha.1`), así que la versión no los distingue; si
      no declara la capacidad, un choque de clave se responde con 426, para
      que no tome el rechazo por aceptado y pierda el cambio;
    - en el pull, el documento del servidor conserva su clave: una fila local
      distinta que la tenía recibe una provisional y un **conflicto de clave**
      (tabla local `key_conflicts`);
    - una fila con un conflicto de clave abierto no se envía. En el panel de
      conflictos la persona escribe otra clave (ni usada ni la perdida) o toma
      la siguiente del bloque. Si el servidor envía esa entidad con una clave
      definitiva, el conflicto se cierra solo. Una clave definitiva nunca se
      renombra sola;
    - el pull aplica también `requirement_key`: puede cambiar por una clave
      provisional sustituida o un conflicto resuelto en otro equipo.
  - **En el servidor, una clave borrada no cuenta como duplicada.** El
    escritorio sigue sin reutilizarla nunca: cuentan las filas borradas y las
    purgadas (`retired_keys`, SYNC-06).
  - **La web** numera con su caché hasta BASE-10. Si el servidor rechaza una
    clave suya, el cambio queda en la bandeja de salida marcado como
    rechazado, igual que un cambio demasiado grande.
