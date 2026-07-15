import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  displayName: z.string().trim().min(1).max(80),
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
});

export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
