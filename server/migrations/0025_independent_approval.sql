-- «Aprobación independiente» per workspace (PLN-08, ADR-0049). When on, the
-- approver of a plan or a case needs the approval role and is not its
-- author; when off, whoever may edit it approves, the author included
-- (recorded as a self-approval). Forward-only.
--
-- NULL means the default of the kind: on in a shared workspace, off in a
-- personal one. A column default cannot depend on the kind, and personal
-- workspaces are created by a trigger (0019), so the default lives in the
-- readers: `COALESCE(independent_approval, kind = 'shared')`.

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS independent_approval boolean;

-- A personal workspace has a single member: nobody else could approve.
ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_personal_not_independent;
ALTER TABLE workspaces ADD CONSTRAINT workspaces_personal_not_independent
    CHECK (kind <> 'personal' OR independent_approval IS NOT TRUE);
