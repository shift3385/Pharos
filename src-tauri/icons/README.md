# App icons — pending generation

This folder must contain the Pharos icon set referenced by `tauri.conf.json`
(`32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns`, `icon.ico`).

They are **not committed yet** because they are generated from a source image
by the Tauri CLI, which needs the Rust toolchain. Once Rust is installed, run
from `pharos/`:

```
npm run tauri icon path/to/pharos-source-1024.png
```

This produces every required size/format into this folder. Until then,
`npm run tauri dev` will fail on missing icons — this is expected and tracked
as pending work for the Rust integration step of Phase 0.
