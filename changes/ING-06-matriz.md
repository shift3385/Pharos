---
section: Añadido
---

- **Un umbral de rendimiento vinculado a un caso cuenta en la matriz**: si una
  métrica de k6 lleva la clave de un caso (en el nombre de un *check*, en una
  submétrica `{case:TC-12}` o como `caseKey`) y su umbral falla, el caso
  figura como fallido en ese run; un run más reciente decide, como siempre.
- Los hallazgos de un SARIF se agrupan por el título de la regla (su
  descripción corta), no por un nombre genérico como «Misconfiguration».
