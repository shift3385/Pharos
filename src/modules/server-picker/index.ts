// Public API of the server picker (SEC-10, ADR-0046): the «Servidor» line and
// the panel to change it, shown on the desktop sign-in screen.
export { ServerLine, type ConnectedNotice } from "./ui/ServerLine";
export { ServerPanel } from "./ui/ServerPanel";
export { useServerInfo } from "./state/useServerInfo";
export { compatibility, type Compatibility } from "./model/serverState";
