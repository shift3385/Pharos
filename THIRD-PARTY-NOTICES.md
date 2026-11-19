# Avisos de terceros

Pharos incluye código C de terceros que `cargo deny` no ve, porque se compila
dentro de un script de build. Este archivo reúne sus avisos de copyright y sus
licencias, como estas exigen.

Las dependencias Rust y npm tienen su propia comprobación de licencias:
- `cargo deny` con `deny.toml`;
- `npm run check:licenses`.

## SQLite3 Multiple Ciphers (sqlite3mc) 2.6.1, con SQLite 3.54.0

**Uso en Pharos.** Es la base de datos local cifrada por página del escritorio
y del CLI (SEC-05, [ADR-0050](docs/adr/0050-pharos-core-y-sqlite-en-disco-cifrado.md)).

**Origen.** Se compila desde el crate `sqlite3mc-src` 206.1.0
(`src-tauri/sqlite3mc-sys`). El crate trae la amalgama oficial, byte a byte.
Su expresión de licencia es `MIT AND CC0-1.0 AND Unlicense AND (CC0-1.0 OR
Apache-2.0)`.

**Licencia Unlicense.** La aprobó el usuario el 2026-11-18. En `deny.toml` es
una excepción solo para este crate.

Componentes de la amalgama y sus licencias:

| Componente | Copyright | Licencia |
|------------|-----------|----------|
| SQLite 3.54.0 | — | Dominio público |
| SQLite3 Multiple Ciphers, AEGIS (amalgama) | © 2019-2026 Ulrich Telle | MIT (texto abajo) |
| Empaquetado `sqlite3mc-src` | © 2026 Luca Cappelletti | MIT (mismo texto) |
| SHA-224/256/384/512 (FIPS 180-2) | © 2005, 2007 Olivier Gay | BSD-3-Clause (texto abajo) |
| Argon2 / BLAKE2b | © 2015 Daniel Dinu, Dmitry Khovratovich, Jean-Philippe Aumasson, Samuel Neves | CC0 1.0 o Apache 2.0, a elección; se usa CC0 1.0 |
| Código de Thomas Pornin | © 2015 Thomas Pornin | CC0 1.0 |
| miniz 2.2.0 | Rich Geldreich; RAD Game Tools y Valve Software | Unlicense y MIT (en la amalgama) |
| Ascon, SHA-1 y otras partes | — | Dominio público (según sus cabeceras) |

### MIT (SQLite3 Multiple Ciphers)

```
MIT License

Copyright (c) 2019-2026 Ulrich Telle

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### BSD-3-Clause (SHA-2)

```
Copyright (C) 2005, 2007 Olivier Gay <olivier.gay@a3.epfl.ch>
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions
are met:
1. Redistributions of source code must retain the above copyright
   notice, this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright
   notice, this list of conditions and the following disclaimer in the
   documentation and/or other materials provided with the distribution.
3. Neither the name of the project nor the names of its contributors
   may be used to endorse or promote products derived from this software
   without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE PROJECT AND CONTRIBUTORS ``AS IS'' AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED.  IN NO EVENT SHALL THE PROJECT OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS
OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT
LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY
OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
SUCH DAMAGE.
```

### CC0 1.0 y Unlicense

- **CC0 1.0** (Argon2/BLAKE2b, Thomas Pornin): los autores renuncian a sus
  derechos, en la medida en que la ley lo permite. Texto:
  <https://creativecommons.org/publicdomain/zero/1.0/legalcode>.
- **Unlicense** (miniz): el software se dedica al dominio público. Texto:
  <https://unlicense.org/>.

Ninguna de las dos impone condiciones de redistribución.
