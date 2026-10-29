-- FIX-06: repair the audit fields written by 0.1.0-alpha.1. `created_by` and
-- `updated_by` of projects, test plans, test cases and their revisions stored
-- the entity's own id; plans and cases pulled by sync stored the author's
-- display name. Until shared workspaces (0.3.0, ADR-0003) only the owner of a
-- project can create or edit anything inside it, so the owner IS the actor of
-- those rows. Rows whose owner is unknown (no project, or a project without
-- owner_id) are left as they are. Data only; idempotent.

UPDATE projects SET created_by = owner_id
 WHERE created_by = id AND coalesce(owner_id, '') <> '';
UPDATE projects SET updated_by = owner_id
 WHERE updated_by = id AND coalesce(owner_id, '') <> '';

UPDATE test_plans
   SET created_by = (SELECT p.owner_id FROM projects p WHERE p.id = test_plans.project_id)
 WHERE (created_by = id OR created_by = author)
   AND coalesce((SELECT p.owner_id FROM projects p WHERE p.id = test_plans.project_id), '') <> '';
UPDATE test_plans
   SET updated_by = (SELECT p.owner_id FROM projects p WHERE p.id = test_plans.project_id)
 WHERE (updated_by = id OR updated_by = author)
   AND coalesce((SELECT p.owner_id FROM projects p WHERE p.id = test_plans.project_id), '') <> '';

UPDATE test_cases
   SET created_by = (SELECT p.owner_id FROM projects p WHERE p.id = test_cases.project_id)
 WHERE (created_by = id OR created_by = author)
   AND coalesce((SELECT p.owner_id FROM projects p WHERE p.id = test_cases.project_id), '') <> '';
UPDATE test_cases
   SET updated_by = (SELECT p.owner_id FROM projects p WHERE p.id = test_cases.project_id)
 WHERE (updated_by = id OR updated_by = author)
   AND coalesce((SELECT p.owner_id FROM projects p WHERE p.id = test_cases.project_id), '') <> '';

-- Revision snapshots stored the id of the plan / case they belong to.
UPDATE test_plan_revisions
   SET created_by = (SELECT p.owner_id FROM test_plans t JOIN projects p ON p.id = t.project_id
                      WHERE t.id = test_plan_revisions.test_plan_id)
 WHERE created_by = test_plan_id
   AND coalesce((SELECT p.owner_id FROM test_plans t JOIN projects p ON p.id = t.project_id
                  WHERE t.id = test_plan_revisions.test_plan_id), '') <> '';
UPDATE test_case_revisions
   SET created_by = (SELECT p.owner_id FROM test_cases c JOIN projects p ON p.id = c.project_id
                      WHERE c.id = test_case_revisions.test_case_id)
 WHERE created_by = test_case_id
   AND coalesce((SELECT p.owner_id FROM test_cases c JOIN projects p ON p.id = c.project_id
                  WHERE c.id = test_case_revisions.test_case_id), '') <> '';
