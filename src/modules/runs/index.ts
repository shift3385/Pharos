// Public API of the runs module («Ejecuciones», EJE-01, ING-02..05): the
// project's runs, the import of test reports and the unlinked tray.
export { RunsPage } from "./ui/RunsPage";
// Registers the web drafts' sign-out cleanup with the module (EJE-06).
import "./model/webDrafts";
export type { LinkableCase as RunLinkableCase } from "./model/types";
