import { z } from "zod";

export const registerSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  displayName: z.string().trim().min(1).max(80),
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
});

export const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
});

/** A new password: the same rule as at sign-up. */
const newPassword = z.string().min(8, "Password must be at least 8 characters").max(200);

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword,
  // The session that stays open; every other one is closed.
  refreshToken: z.string().min(1).max(200).optional(),
});

export const regenerateCodesSchema = z.object({
  currentPassword: z.string().min(1).max(200),
});

export const recoverSchema = z.object({
  email: z.email().max(254),
  code: z.string().min(1).max(40),
  newPassword,
});

export const resetRequestSchema = z.object({
  email: z.email().max(254),
  locale: z.enum(["es", "en"]).optional(),
});

export const resetTokenSchema = z.object({
  token: z.string().min(1).max(200),
});

export const resetConfirmSchema = z.object({
  token: z.string().min(1).max(200),
  newPassword,
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type RecoverInput = z.infer<typeof recoverSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
