-- Risk bands per project (TRZ-04, ADR-0043): a requirement's risk level
-- (likelihood × impact, 1-25) is low up to `risk_band_low`, medium up to
-- `risk_band_medium` and high above. The defaults are ADR-0013's (4 and 12).
-- Rust keeps 1 <= low < medium <= 24 (a pair that breaks it is refused). A
-- project setting, so it syncs with the project (`riskBandLow`,
-- `riskBandMedium` in its payload); a payload without them (an older Pharos)
-- leaves the local values as they are.

ALTER TABLE projects ADD COLUMN risk_band_low INTEGER NOT NULL DEFAULT 4
    CHECK (risk_band_low BETWEEN 1 AND 23);
ALTER TABLE projects ADD COLUMN risk_band_medium INTEGER NOT NULL DEFAULT 12
    CHECK (risk_band_medium BETWEEN 2 AND 24);
