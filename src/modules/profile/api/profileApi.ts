import { serverApi } from "@modules/sync-offline";
import { invoke, isTauri } from "@shared/platform";
import type { Profile, ProfileInput } from "../model/types";

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
  async get(): Promise<Profile | null> {
    if (isTauri()) return invoke<Profile | null>("profile_get");
    return toProfile(await serverApi.get<ServerUser>("/auth/me"));
  },
  async upsert(input: ProfileInput): Promise<Profile | null> {
    if (isTauri()) return invoke<Profile | null>("profile_upsert", { input });
    const { displayName, firstName, lastName } = input;
    return toProfile(
      await serverApi.patch<ServerUser>("/auth/me", { displayName, firstName, lastName }),
    );
  },
};
