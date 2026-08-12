import { ollamaPull, type PullProgress } from "./ollama";

// Module-level download manager. The pull runs here, not inside the AI page, so
// an in-progress model download survives navigating away from and back to the
// page (the component unmounts, this state does not). Closing the whole app
// still stops it, but Ollama resumes from its cached blobs on the next pull.

export interface DownloadView extends PullProgress {
  /** Download speed in bytes/second (0 until two samples are seen). */
  speedBps?: number;
}

export interface DownloadState {
  active: boolean;
  view: DownloadView | null;
}

let state: DownloadState = { active: false, view: null };
let sample: { completed: number; time: number } | null = null;
const listeners = new Set<(s: DownloadState) => void>();

function emit(next: DownloadState) {
  state = next;
  for (const l of listeners) l(state);
}

export function getDownloadState(): DownloadState {
  return state;
}

export function subscribeDownload(listener: (s: DownloadState) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Starts (or ignores, if already running) a model pull. Resolves to true on
 *  success, false on error. Ollama resumes from partial blobs, so this also
 *  works as "resume". */
export async function startDownload(endpoint: string, model: string): Promise<boolean> {
  if (state.active) return false;
  sample = null;
  emit({ active: true, view: { status: "", percent: null } });
  try {
    await ollamaPull(endpoint, model, (p) => {
      let speedBps = 0;
      if (p.completed != null) {
        const now = Date.now();
        // A new layer resets `completed`; skip the negative delta.
        if (sample && now > sample.time && p.completed >= sample.completed) {
          speedBps = ((p.completed - sample.completed) / (now - sample.time)) * 1000;
        }
        sample = { completed: p.completed, time: now };
      }
      emit({ active: true, view: { ...p, speedBps } });
    });
    emit({ active: false, view: null });
    return true;
  } catch {
    emit({ active: false, view: null });
    return false;
  } finally {
    sample = null;
  }
}
