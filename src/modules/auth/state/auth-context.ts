import { createContext } from "react";
import type { AuthUser, LoginInput, RegisterInput } from "../model/types";
import type { RecoverInput } from "../api/accountApi";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  /** True when running on the cached session without backend confirmation. */
  offline: boolean;
  login: (input: LoginInput) => Promise<void>;
  /** Creates the account and returns its recovery codes (SEC-08). The
   *  session starts with `completeRegistration`, once the user has seen them;
   *  an empty list (an older server) starts it at once. */
  register: (input: RegisterInput) => Promise<string[]>;
  completeRegistration: () => Promise<void>;
  /** Sets a new password with a recovery code and signs in; returns how many
   *  codes are left. */
  recover: (input: RecoverInput) => Promise<number>;
  logout: () => Promise<void>;
  /** Updates the signed-in user after a profile save, so the shell (menu,
   *  avatar) shows the new alias and name at once (MAN-03). */
  updateUser: (patch: Partial<Pick<AuthUser, "displayName" | "firstName" | "lastName">>) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
);
