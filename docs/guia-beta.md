# Guía de la beta 0.1.0

Esta guía es para quien prueba **Pharos 0.1.0-beta.1** en Windows 11. Explica
qué trae la versión, cómo instalarla, qué comprobar (con casillas para ir
marcando) y cómo informar de un problema. Los detalles técnicos están en el
[README](../README.md) (en inglés); el plan de versiones, en
[`ROADMAP.md`](ROADMAP.md).

> Una beta puede tener fallos. Antes de usarla con datos que te importen, guarda
> la clave de recuperación (paso 4.6) y una copia de `pharos.db.enc`.

## 1. Qué trae la 0.1.0

- **Proyectos** con su plan de pruebas (asistente de 21 campos, ISO/IEC/IEEE
  29119, con frecuencia de las ceremonias ágiles), sus casos de prueba
  (editor y Gherkin sincronizados) y su planificador kanban.
- **Inicio** con búsqueda de proyectos, último acceso y progreso.
- **Trazabilidad:** requisitos `REQ-xxx`, matriz requisito ↔ caso ↔ defecto y
  tags estables (`@REQ-014`, `@ATS_001`) en los `.feature`.
- **Plantillas** e importación/exportación a `.xlsx`, `.pdf`, `.feature` y ZIP
  (con PDF), en la **carpeta de descarga** que elijas.
- **IA opcional** con tu propia clave (Gemini, OpenAI, Claude, OpenRouter o un
  servicio compatible) o sin internet con Ollama: asistir campos, generar casos
  desde un requisito, sugerir riesgos, estrategia y precondiciones. Nada se
  aplica sin que lo aceptes.
- **Sincronización** sin conexión entre equipos, con panel de conflictos y
  claves que nunca se repiten.
- **Seguridad de los datos:** base local cifrada, copia automática antes de
  actualizar, clave de recuperación y protección contra datos de una versión
  más nueva.
- **Accesibilidad WCAG 2.1 AA:** todo se usa con el teclado y con lector de
  pantalla.
- **Exportar diagnóstico** para informar de fallos sin enviar tus datos.

**Todavía no incluye:** ejecución de pruebas (llega en 0.2.0), sincronizar
adjuntos y plantillas propias, ni instalador firmado.

## 2. Antes de empezar

La app instalada inicia sesión y sincroniza contra la API de Pharos en
`http://localhost:3000` del **mismo equipo**. Necesitas:

- [ ] Windows 11 con WebView2 (viene instalado).
- [ ] PostgreSQL en marcha (servicio nativo en el puerto 5432, o Docker).
- [ ] La API de Pharos: el repositorio con `npm install` en la raíz y en
      `server/`, un `.env` y las bases `pharos_db` / `pharos_test_db`
      (README → "First-time setup"). Después, cada vez:
      `cd server && npm start`.
- [ ] Una cuenta: "Regístrate" en la pantalla de inicio de sesión, o la cuenta
      de pruebas local con `cd server && npm run seed:test-user` (sus datos
      están en el README).

No hace falta Rust ni Visual Studio para instalar la app; solo para
compilarla.

## 3. Instalar

1. En GitHub, **Actions → Installer**. Abre la ejecución en verde más reciente
   de `main` (la del commit de la versión `0.1.0-beta.1`) y, en **Artifacts**,
   descarga `pharos-0.1.0-beta.1-<commit>-windows`. Hace falta haber iniciado
   sesión en GitHub y el artefacto caduca a los 30 días.
2. Descomprime el `.zip`: contiene `Pharos_0.1.0-beta.1_x64-setup.exe`.
3. Ejecútalo. **El instalador no está firmado**, así que Windows SmartScreen
   muestra "Windows protegió tu PC": pulsa **Más información → Ejecutar de
   todas formas**.
4. Sigue el asistente. Si faltara WebView2, el instalador lo descarga (necesita
   internet).
5. Abre Pharos desde el menú Inicio.

## 4. Lista de comprobación

Marca cada casilla al comprobarla. Si algo falla, sigue el apartado 5 antes de
seguir.

### 4.1 Instalación en un Windows 11 limpio

- [ ] SmartScreen avisa de que el instalador no está firmado y deja continuar
      con "Ejecutar de todas formas".
- [ ] La instalación termina sin errores y Pharos aparece en el menú Inicio.
- [ ] El primer arranque abre la pantalla de inicio de sesión (WebView2
      funciona: no hay ventana en blanco).
- [ ] Al pie de la barra lateral y en Administración → Diagnóstico la versión
      es `0.1.0-beta.1`.
- [ ] Tras iniciar sesión existe `%APPDATA%\com.pharos.desktop\pharos.db.enc`
      y no quedan archivos `.tmp` ni `.new` al guardar (SEC-01/02).
- [ ] Hay un log del día en `%LOCALAPPDATA%\com.pharos.desktop\logs`.
- [ ] Cerrar y abrir sin la API en marcha: la app abre con la sesión guardada.
- [ ] Desinstalar desde Configuración → Aplicaciones → Aplicaciones instaladas.
      Pharos desaparece del menú Inicio y anota si la carpeta de datos
      `%APPDATA%\com.pharos.desktop` se conserva.
- [ ] Volver a instalar: los proyectos siguen ahí.

### 4.2 Actualizar desde 0.1.0-alpha.1 (si la tenías)

- [ ] Instalar la beta encima de la alfa y abrirla: los proyectos, planes,
      casos y requisitos siguen intactos.
- [ ] En la carpeta de datos aparece
      `pharos.db.enc.bak-0.1.0-beta.1-0011_sync_conflicts`, la copia previa a
      la actualización (SEC-06).

### 4.3 Plan, casos y exportaciones

- [ ] Crear un proyecto y su plan con el asistente; guardar un plan sin
      título (un resumen dice qué falta) y otro con avisos (se guarda y dice
      cuántos avisos quedan).
- [ ] Crear casos: el editor y la vista Gherkin se actualizan entre sí; el
      `.feature` exportado es válido (Fase 4).
- [ ] Exportar el plan y un caso a `.pdf` y `.xlsx` (Fase 6).
- [ ] Importar un plan y casos desde `.xlsx` y usar una plantilla (Fase 6).
- [ ] Elegir una carpeta de descarga en Administración → Ajustes y exportar el
      ZIP del proyecto: lleva el plan y cada caso en `.xlsx` y `.pdf`
      (UX-02, EXP-02).
- [ ] Panel de administración: ajustes, retención, fondo, accesos (Fase 9A).

### 4.4 Trazabilidad

- [ ] Crear requisitos y vincular casos; la matriz muestra los huecos de
      cobertura y se exporta a `.xlsx`.
- [ ] El `.feature` lleva `@REQ-xxx` y el ID de cada caso, y se puede filtrar
      por `@ATS_xxx` con playwright-bdd o Cucumber.

### 4.5 Sincronización

- [ ] Dos cuentas en el mismo equipo: cada una solo ve y envía lo suyo
      (FIX-07, FIX-08, plantillas FIX-08b).
- [ ] Dos equipos sin conexión creando casos: al sincronizar no hay claves
      repetidas (DAT-01).
- [ ] Editar el mismo caso en dos equipos: aparece el panel de conflictos y
      puedes elegir versión (Fase 8C).
- [ ] Borrar un proyecto en un equipo: en el otro desaparece con sus planes,
      casos, requisitos y tarjetas (FIX-05).
- [ ] Tras los días de retención, lo borrado se purga y no vuelve (SYNC-06).

### 4.6 Clave de recuperación (SEC-03)

- [ ] Perfil → Clave de recuperación → **Mostrar clave de recuperación**:
      guárdala en papel o en un gestor de contraseñas.
- [ ] Copiar `pharos.db.enc` a otro equipo (o, tras guardar una copia del
      `.enc`, borrar la entrada `db-key` del Administrador de credenciales),
      abrir Pharos y recuperar los datos con la clave.
- [ ] Una errata en la clave se avisa antes de tocar nada; una clave de otro
      equipo se rechaza.

### 4.7 IA (opcional)

- [ ] Con claves reales, "Probar conexión" y "Listar modelos" en cada proveedor
      que vayas a usar (IA-08).
- [ ] Generar casos desde un requisito (✨ en Trazabilidad) y aceptar algunos:
      quedan vinculados en la matriz (IA-05).
- [ ] Sugerir riesgos, estrategia de automatización y precondiciones (IA-10).
- [ ] Sin internet, con Ollama (Fase 7). Anota qué modelos devuelven JSON
      inválido a menudo.

### 4.8 Accesibilidad (UX-05)

Solo con el teclado y con NVDA o el Narrador de Windows:

- [ ] "Saltar al contenido" es la primera parada del tabulador.
- [ ] Recorrer el asistente del plan; el paso actual se anuncia.
- [ ] En el editor de casos, reordenar pasos con Espacio y flechas.
- [ ] Abrir y cerrar un diálogo de IA, el panel de conflictos y la clave de
      recuperación: el foco vuelve al botón que los abrió.

Los puntos abiertos de la auditoría están en
[`accesibilidad/auditoria-wcag-0.1.0.md`](accesibilidad/auditoria-wcag-0.1.0.md).

### 4.9 Diagnóstico

- [ ] Administración → Diagnóstico → **Exportar diagnóstico** guarda
      `pharos-diagnostic-0.1.0-beta.1-<fecha>.zip` en la carpeta de descarga.
- [ ] Abrir el ZIP: no contiene proyectos, casos, tu perfil, la base de datos,
      claves ni tokens (BASE-08).

## 5. Cómo informar de un problema

1. Si la pantalla muestra un error, pulsa **Exportar diagnóstico** ahí mismo;
   si no, ve a Administración → Diagnóstico → **Exportar diagnóstico**.
   Funciona aunque la base local no haya podido abrirse.
2. Abre un issue en el repositorio de GitHub (`shift3385/Pharos`) con:
   - la versión (`0.1.0-beta.1`) y el apartado de esta guía;
   - los pasos para reproducirlo, lo que esperabas y lo que pasó;
   - una captura, si ayuda;
   - el ZIP de diagnóstico adjunto.
3. **Nunca adjuntes** `pharos.db.enc`, las copias `.bak-…`, tu clave de
   recuperación, claves de IA ni contraseñas.

Cada corrección se publica como una nueva beta (`0.1.0-beta.2`…). Cuando todas
las casillas estén en verde, se publica `0.1.0`.

## 6. Si algo sale mal con los datos

- **Volver a los datos de antes de actualizar:** cierra Pharos, renombra
  `pharos.db.enc`, copia la `.bak-…` que quieras como `pharos.db.enc` y abre la
  versión que escribió esa copia (README → "Local data backups").
  `0.1.0-alpha.1` no detecta datos de una versión más nueva: no abras con ella
  datos ya actualizados sin restaurar antes la copia.
- **"Falta la clave de la base de datos local":** escribe la clave de
  recuperación (README → "Recovery key").
- **"Actualiza la app para sincronizar":** la app y el servidor no tienen
  versiones compatibles; instala la versión que corresponde al servidor. Tus
  cambios se conservan.
