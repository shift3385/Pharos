---
section: Añadido
---

- **Importar resultados de Xcode**: exporta el `.xcresult` con
  `xcrun xcresulttool get test-results tests --path X.xcresult > tests.json`
  e importa ese JSON en «Importar informe», por la API (`format=xcresult`) o
  con el CLI. XCTest y Swift Testing: los reintentos son intentos, los
  argumentos de una prueba parametrizada son filas, el motivo de un *skip* se
  conserva y los tests se vinculan desde «Sin vincular», que lo recuerda.
- **API v1, contrato 1.3.0**: `format=xcresult` en la subida de informes.
