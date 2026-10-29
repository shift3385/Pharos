# ADR-0005 · Recortes de alcance hasta 1.0

- **Estado:** Aceptado (decisión D5 del usuario, 2026-10-28)
- **Contexto:** el estudio del arte propone más de 7 formatos de resultados,
  4 modelos de runner, 3 modos de despliegue, MCP local y remoto, móvil y
  SaaS. Para un equipo pequeño eso no es viable antes de 1.0.
- **Decisión:** hasta 1.0 queda fuera o aplazado:
  1. **SaaS multi-tenant.** Solo modo aislado y autoalojado.
  2. **MCP remoto.** Primero el MCP local por stdio (IA-06); IA-07 pasa a
     después de 1.0.
  3. **Formatos de resultados.** Primero Cucumber Messages, CTRF, JUnit y el
     JSON de Playwright (0.2.0). Allure, TRX y `.xcresult` vienen después.
  4. **Otros:**
     - sin CRDT de texto, auto-updater ni observabilidad remota;
     - iOS solo vía nubes de dispositivos o un agente Mac, nunca en local;
     - el modo aprendizaje ISTQB no reproduce el syllabus (derechos de autor).
- **Alternativas:** seguir el estudio al completo. Se descartó por capacidad.
- **Consecuencias:**
  - El objetivo de "suite para cualquier tipo de QA" se cubre con tipos de
    resultado genéricos (Result, Finding, Metric, Session; KND-01) y pocos
    formatos, no con un adaptador por herramienta.
  - Cada supuesto técnico se comprueba antes con un spike: el de los tags en
    JUnit resultó falso (ING-01).
