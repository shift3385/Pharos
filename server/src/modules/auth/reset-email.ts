import type { MailMessage } from "./mailer";

// The password reset email (SEC-09, ADR-0045), in the language the app asked
// in. It names the account and the server, says how long the link lasts, and
// that ignoring it changes nothing. The link is also printed as text, so a
// desktop user can paste it into «Recupera el acceso». A link made by a server
// administrator (SEC-11) says who made it.

/** How long, in words: minutes below two hours, hours from there. */
const span = (ttlMs: number, unit: { minutes: string; hours: string }) => {
  const minutes = Math.round(ttlMs / 60_000);
  return minutes < 120
    ? `${minutes} ${unit.minutes}`
    : `${Math.round(minutes / 60)} ${unit.hours}`;
};

const TEXTS = {
  es: {
    subject: "Restablecer tu contraseña de Pharos",
    intro: (email: string, host: string) =>
      `Alguien pidió restablecer la contraseña de la cuenta ${email} en el servidor ${host}.`,
    introAdmin: (email: string, host: string, admin: string) =>
      `${admin}, administrador del servidor ${host}, generó un enlace para restablecer la contraseña de la cuenta ${email}.`,
    button: "Elegir una contraseña nueva",
    unit: { minutes: "minutos", hours: "horas" },
    expiry: (duration: string) =>
      `El enlace caduca en ${duration} y sirve una vez. Si no lo pediste, ignora este correo: tu contraseña no cambia.`,
    paste: "En la app de escritorio, pega este enlace en «Recupera el acceso»:",
  },
  en: {
    subject: "Reset your Pharos password",
    intro: (email: string, host: string) =>
      `Someone asked to reset the password of the account ${email} on the server ${host}.`,
    introAdmin: (email: string, host: string, admin: string) =>
      `${admin}, administrator of the server ${host}, made a link to reset the password of the account ${email}.`,
    button: "Choose a new password",
    unit: { minutes: "minutes", hours: "hours" },
    expiry: (duration: string) =>
      `The link expires in ${duration} and works once. If you did not ask for it, ignore this email: your password does not change.`,
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
  /** The administrator who made the link (SEC-11), if one did. */
  issuedBy?: string;
}): MailMessage {
  const t = TEXTS[opts.locale ?? "es"];
  const host = new URL(opts.publicUrl).host;
  const intro = opts.issuedBy
    ? t.introAdmin(opts.to, host, opts.issuedBy)
    : t.intro(opts.to, host);
  const expiry = t.expiry(span(opts.ttlMs, t.unit));
  const text = [
    intro,
    "",
    `${t.button}: ${opts.link}`,
    "",
    expiry,
    "",
    t.paste,
    opts.link,
  ].join("\n");
  const link = escapeHtml(opts.link);
  const html = `<p>${escapeHtml(intro)}</p>
<p><a href="${link}" style="display:inline-block;padding:10px 16px;background:#2f6fd6;color:#ffffff;border-radius:6px;text-decoration:none">${escapeHtml(t.button)}</a></p>
<p>${escapeHtml(expiry)}</p>
<p style="color:#5a6680;font-size:13px">${escapeHtml(t.paste)}<br><span style="font-family:monospace;word-break:break-all">${link}</span></p>`;
  return { to: opts.to, subject: t.subject, text, html };
}
