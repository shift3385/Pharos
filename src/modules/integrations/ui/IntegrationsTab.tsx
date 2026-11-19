import { ConnectCiSection } from "./ConnectCiSection";
import { ProjectTokensSection } from "./ProjectTokensSection";
import { WebhooksSection } from "./WebhooksSection";

/** The workspace page's «Integraciones» tab (INT-02, INT-03, INT-04;
 *  ADR-0052, ADR-0054): project tokens, «Conectar CI» and webhooks. `manager`: the account may change them
 *  (`token.manage`, Test Manager). */
export function IntegrationsTab({ workspace, manager }: { workspace: { id: string; name: string }; manager: boolean }) {
  return (
    <>
      <ProjectTokensSection workspace={workspace} manager={manager} />
      <ConnectCiSection workspace={workspace} manager={manager} />
      <WebhooksSection workspace={workspace} manager={manager} />
    </>
  );
}
