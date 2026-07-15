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
}

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
);
