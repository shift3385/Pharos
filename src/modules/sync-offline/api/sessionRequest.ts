// Requests of one sync run for one account. The access token can expire before
// the run or halfway through it (a long push, a big pull), so the token in use
// lives here and every step asks through the same function.

import { renewSession } from "@modules/auth";
import { SyncHttpError, syncRequest, type SyncCaller } from "./transport";

/** Sends requests as `session`. On a 401 it renews the session and repeats the
 *  request once: a 401 comes before the server looks at the request, so even a
 *  push is safe to repeat. A later request starts with the renewed token.
 *
 *  It never repeats under another account (FIX-07): if the session is over or
 *  now belongs to someone else, the 401 reaches the caller and stops the sync.
 *  If the server cannot be asked right now, that failure stops it instead; the
 *  session is kept and the next sync tries again. */
export function sessionRequester(session: { accessToken: string; userId: string }): SyncCaller {
  let token = session.accessToken;
  return async <T>(path: string, init?: Parameters<SyncCaller>[1]): Promise<T> => {
    const used = token;
    try {
      return await syncRequest<T>(path, used, init);
    } catch (e) {
      if (!(e instanceof SyncHttpError) || e.status !== 401) throw e;
      const renewed = await renewSession(used);
      if (renewed?.userId !== session.userId) throw e;
      token = renewed.accessToken;
      return syncRequest<T>(path, token, init);
    }
  };
}
