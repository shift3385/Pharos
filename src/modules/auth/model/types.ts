export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
  role: string;
  /** Server administrator (SEC-11). Shows «Administración › Usuarios»; the
   *  server checks the role itself on every request. Absent on older servers. */
  isAdmin?: boolean;
  createdAt: string;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
  firstName: string;
  lastName: string;
}

export interface LoginInput {
  email: string;
  password: string;
}
