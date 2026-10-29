import type { Assert, Contract, Covers } from "@shared/contracts";

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

// The Rust contract (BASE-05, ADR-0026): what Rust sends covers what this model
// reads, and what this model sends covers what Rust reads. `tsc` fails if a
// field is renamed, dropped or retyped on either side.
export type _RustContract = [
  Assert<Covers<Contract.Profile, Profile>>,
  Assert<Covers<ProfileInput, Contract.ProfileInput>>,
];
