# sync-offline

Offline-first synchronization domain (spec §9). **Reserved boundary — no logic yet.**

Scope when implemented (Phase 8):

- Change journal (oplog): every mutation recorded as a delta.
- Automatic sync + "Sync now" button; last-write-wins per field.
- Conflict panel for manual review; visible status indicator
  (`Synced / Pending changes (n) / Offline`).

Layers to be added: `domain/`, `application/`, `infrastructure/`, `ui/`.
