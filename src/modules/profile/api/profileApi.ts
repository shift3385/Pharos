import { serverApi } from "@modules/sync-offline";
import { invoke, isTauri } from "@shared/platform";
import type { Profile, ProfileInput } from "../model/types";
import { profileOwner, setProfileOwner } from "./profileOwner";

/** The account as the server returns it (`/auth/me`). */
interface ServerUser {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  role: string;
  createdAt: string;
  updatedAt?: string;
}

const toProfile = (u: ServerUser): Profile => ({
  id: u.id,
  workspaceId: "server",
  displayName: u.displayName,
  firstName: u.firstName,
  lastName: u.lastName,
  role: u.role,
  createdBy: u.id,
  updatedBy: u.id,
  createdAt: u.createdAt,
  updatedAt: u.updatedAt ?? u.createdAt,
  revision: 1,
});

// The desktop keeps the profile in its encrypted local store (Rust). The web
// edits the account's names on the server (BASE-10); the role is not the
// user's to change there.
export const profileApi = {
  /** The profile of `userId`. On the desktop the local profile is the one of
   *  the last account that used it: for another account it is not returned,
   *  and the caller shows the signed-in account's names (FIX-46). */
  async get(userId?: string): Promise<Profile | null> {
    if (isTauri()) {
      if (userId && profileOwner() !== userId) return null;
      return invoke<Profile | null>("profile_get");
    }
    return toProfile(await serverApi.get<ServerUser>("/auth/me"));
  },
  /** Saves the names; on the desktop the local profile becomes `userId`'s. */
  async upsert(input: ProfileInput, userId?: string): Promise<Profile | null> {
    if (isTauri()) {
      const saved = await invoke<Profile | null>("profile_upsert", { input });
      if (userId) setProfileOwner(userId);
      return saved;
    }
    const { displayName, firstName, lastName } = input;
    return toProfile(
      await serverApi.patch<ServerUser>("/auth/me", { displayName, firstName, lastName }),
    );
  },
};
