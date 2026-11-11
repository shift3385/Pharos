import { createContext } from "react";
import type { AuthUser, LoginInput, RegisterInput } from "../model/types";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  /** True when running on the cached session without backend confirmation. */
  offline: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  /** Updates the signed-in user after a profile save, so the shell (menu,
   *  avatar) shows the new alias and name at once (MAN-03). */
  updateUser: (patch: Partial<Pick<AuthUser, "displayName" | "firstName" | "lastName">>) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
);
