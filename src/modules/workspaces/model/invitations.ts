import type { Invitation } from "../api/workspacesApi";

/** «Invitaciones pendientes» (docs/bocetos/0.5.0-workspaces.html §2): the
 *  invitations still open, and those that expired unused. An accepted one is
 *  a member now (it is in «Miembros»), and a revoked one is over (FIX-41). */
export const openInvitations = (list: Invitation[]): Invitation[] =>
  list.filter((i) => i.status === "pending" || i.status === "expired");
