import { invoke, isTauri } from "@shared/platform";
import type { ScanContent, ScanInventory } from "../proposals/fromProject";

/** The project folder reader of the desktop (IA-17, `project_scan.rs`): Rust
 *  opens the picker and reads; the webview only gets an inventory, then the
 *  text of the files the person kept. Desktop only. */
export const projectScanApi = {
  available: () => isTauri(),
  /** Null when the person cancels the picker. */
  pick: (): Promise<ScanInventory | null> => invoke("project_scan_pick"),
  read: (scanId: string, paths: string[]): Promise<ScanContent[]> =>
    invoke("project_scan_read", { scanId, paths }),
  close: (scanId: string): Promise<void> =>
    invoke("project_scan_close", { scanId }),
};
