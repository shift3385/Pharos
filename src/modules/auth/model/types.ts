export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
  role: string;
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
