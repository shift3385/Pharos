export interface Profile {
  id: string;
  workspaceId: string;
  displayName: string;
  firstName: string;
  lastName: string;
  role: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
}

export interface ProfileInput {
  displayName: string;
  firstName: string;
  lastName: string;
  role?: string;
}
