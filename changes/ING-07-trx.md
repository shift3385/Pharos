---
section: Añadido
---

- **Importar resultados de .NET (TRX)**: el archivo de `dotnet test --logger trx`
  (MSTest, xUnit, NUnit) se importa en «Importar informe», por la API y con el
  CLI. `[TestCategory("TC-12")]` vincula el test a su caso, los datos de un
  `DataRow` o `Theory` son filas y los reintentos, intentos. El formato
  Pharos Run JSON pasa a 1.1.0 para nombrar el origen `trx`.
