-- Free-form data of a requirement (IA-17, ADR-0036): a JSON object, as the
-- `data` of a test case. It holds the AI provenance (`aiProvenance`, IA-01:
-- "AI · pending review" until a person reviews it) and where a proposed
-- requirement came from (`sources`: file and lines, image or design). Syncs in
-- the requirement's payload (`data`); a payload without it (an older Pharos)
-- leaves the local value as it is.

ALTER TABLE requirements ADD COLUMN data TEXT NOT NULL DEFAULT '{}';
