-- What the exported test plan (.xlsx / .pdf) shows of its history (PLN-02):
-- 'current' (default, as before: only the version in force) or 'revisions'
-- (a «Historial de revisiones» table, one row per person and day). A project
-- setting, so it syncs with the project (`planExportHistory` in its payload);
-- a payload without it (an older Pharos) leaves the local value as it is.

ALTER TABLE projects ADD COLUMN plan_export_history TEXT NOT NULL DEFAULT 'current'
    CHECK (plan_export_history IN ('current', 'revisions'));
