import nodemailer from "nodemailer";
import type { Env } from "../../config/env";

// Outgoing email for password reset links (SEC-09, ADR-0045). Optional: with
// no SMTP_HOST there is no mailer and the email reset is off.

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** The SMTP mailer the environment configures, or null when email is off. */
export function mailerFromEnv(env: Env): Mailer | null {
  if (!env.SMTP_HOST || !env.SMTP_FROM) return null;
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    // STARTTLS is required when the connection does not start in TLS: a reset
    // link is a secret and never travels in clear text.
    requireTLS: !env.SMTP_SECURE,
    auth: env.SMTP_USER
      ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? "" }
      : undefined,
  });
  const from = env.SMTP_FROM;
  return {
    async send(message) {
      await transport.sendMail({ from, ...message });
    },
  };
}

/** A mailer that keeps what it sends (tests). */
export function createMemoryMailer(): Mailer & { outbox: MailMessage[] } {
  const outbox: MailMessage[] = [];
  return {
    outbox,
    async send(message) {
      outbox.push(message);
    },
  };
}
