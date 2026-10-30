import { RecoveryKeySection } from "@modules/profile";

/** Administración → Seguridad (SPEC §8): the recovery key of the encrypted
 *  local database. The section is the profile module's, reused as it is. */
export function SecurityTab() {
  return (
    <div className="adm-stack">
      <div className="adm-card">
        <RecoveryKeySection />
      </div>
    </div>
  );
}
