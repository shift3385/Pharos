import type { MailMessage } from "./mailer";

// The password reset email (SEC-09, ADR-0045), in the language the app asked
// in. It names the account and the server, says how long the link lasts, and
// that ignoring it changes nothing. The link is also printed as text, so a
// desktop user can paste it into «Recupera el acceso».

const TEXTS = {
  es: {
    subject: "Restablecer tu contraseña de Pharos",
    intro: (email: string, host: string) =>
      `Alguien pidió restablecer la contraseña de la cuenta ${email} en el servidor ${host}.`,
    button: "Elegir una contraseña nueva",
    expiry: (minutes: number) =>
      `El enlace caduca en ${minutes} minutos y sirve una vez. Si no lo pediste, ignora este correo: tu contraseña no cambia.`,
    paste: "En la app de escritorio, pega este enlace en «Recupera el acceso»:",
  },
  en: {
    subject: "Reset your Pharos password",
    intro: (email: string, host: string) =>
      `Someone asked to reset the password of the account ${email} on the server ${host}.`,
    button: "Choose a new password",
    expiry: (minutes: number) =>
      `The link expires in ${minutes} minutes and works once. If you did not ask for it, ignore this email: your password does not change.`,
    paste: "In the desktop app, paste this link into «Recover access»:",
  },
} as const;

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] as string,
  );

/** The reset link for a token: the web build's route, with the token after
 *  `#`, so it never reaches a server log. */
export function resetLink(publicUrl: string, token: string): string {
  return `${publicUrl.replace(/\/+$/, "")}/#/restablecer?token=${encodeURIComponent(token)}`;
}

export function resetEmail(opts: {
  to: string;
  link: string;
  publicUrl: string;
  ttlMs: number;
  locale?: "es" | "en";
}): MailMessage {
  const t = TEXTS[opts.locale ?? "es"];
  const host = new URL(opts.publicUrl).host;
  const minutes = Math.round(opts.ttlMs / 60_000);
  const text = [
    t.intro(opts.to, host),
    "",
    `${t.button}: ${opts.link}`,
    "",
    t.expiry(minutes),
    "",
    t.paste,
    opts.link,
  ].join("\n");
  const link = escapeHtml(opts.link);
  const html = `<p>${escapeHtml(t.intro(opts.to, host))}</p>
<p><a href="${link}" style="display:inline-block;padding:10px 16px;background:#2f6fd6;color:#ffffff;border-radius:6px;text-decoration:none">${escapeHtml(t.button)}</a></p>
<p>${escapeHtml(t.expiry(minutes))}</p>
<p style="color:#5a6680;font-size:13px">${escapeHtml(t.paste)}<br><span style="font-family:monospace;word-break:break-all">${link}</span></p>`;
  return { to: opts.to, subject: t.subject, text, html };
}
