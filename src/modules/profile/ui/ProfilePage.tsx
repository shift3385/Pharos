import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Check, LogOut } from "lucide-react";
import { useAuth } from "@modules/auth";
import { SyncIndicator } from "@modules/sync-offline";
import { TruncatedText } from "@shared/ui/TruncatedText";
import { useBreakpoint } from "@shared/ui/useBreakpoint";
import { profileApi } from "../api/profileApi";
import type { Profile } from "../model/types";
import { RecoveryKeySection } from "./RecoveryKeySection";
import "./ProfilePage.css";

/** Two-letter avatar from the display name (same rule as the user menu). */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : name.trim().slice(0, 2);
  return letters.toUpperCase();
}

/** Perfil (SPEC §8, `ScrPerfil.dc.html`): who you are (avatar, name, email,
 *  sync status), your alias and official name, preferences and the recovery
 *  key. On mobile «Cerrar sesión» lives here too (no user menu in the bar). */
export function ProfilePage() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const mobile = useBreakpoint() === "mobile";
  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState({
    displayName: "",
    firstName: "",
    lastName: "",
  });
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );

  // Load the stored profile, seeding the form from the signed-in user if none.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await profileApi.get();
      if (cancelled) return;
      if (stored) {
        setProfile(stored);
        setForm({
          displayName: stored.displayName,
          firstName: stored.firstName,
          lastName: stored.lastName,
        });
      } else if (user) {
        setForm({
          displayName: user.displayName,
          firstName: user.firstName,
          lastName: user.lastName,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const update =
    (key: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: event.target.value }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus("saving");
    try {
      const saved = await profileApi.upsert(form);
      setProfile(saved);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  const fullName = [profile?.firstName ?? user?.firstName, profile?.lastName ?? user?.lastName]
    .filter(Boolean)
    .join(" ");
  const shownName = fullName || user?.displayName || "";

  return (
    <section className="profile screen-root" aria-labelledby="profile-title">
      <header className="profile__header">
        <h1 id="profile-title" className="t-page-title">
          {t("profile.title")}
        </h1>
        <p className="profile__subtitle">{t("profile.subtitle")}</p>
      </header>

      <div className="profile__body">
        <form className="profile-card profile__form" onSubmit={onSubmit}>
          <div className="profile__who">
            <span className="profile__avatar" aria-hidden="true">
              {initials(user?.displayName || shownName || "?")}
            </span>
            <div className="profile__identity">
              <span className="profile__name">{shownName}</span>
              {user && <TruncatedText className="profile__email" value={user.email} />}
              {mobile && (
                <button
                  type="button"
                  className="profile__logout"
                  onClick={() => void logout()}
                >
                  <LogOut size={15} aria-hidden="true" />
                  {t("auth.logout")}
                </button>
              )}
            </div>
            <SyncIndicator />
          </div>

          <div className="profile__row">
            <Field
              id="displayName"
              label={t("profile.displayName")}
              value={form.displayName}
              onChange={update("displayName")}
              required
            />
          </div>
          <div className="profile__row">
            <Field
              id="firstName"
              label={t("profile.firstName")}
              value={form.firstName}
              onChange={update("firstName")}
              required
            />
            <Field
              id="lastName"
              label={t("profile.lastName")}
              value={form.lastName}
              onChange={update("lastName")}
              required
            />
          </div>

          <div className="profile__actions">
            {status === "saved" && (
              <span className="profile__status" role="status">
                {t("profile.saved")}
              </span>
            )}
            {status === "error" && (
              <span className="profile__status profile__status--error" role="alert">
                {t("profile.error")}
              </span>
            )}
            <button className="profile__save" type="submit" disabled={status === "saving"}>
              <Check size={16} aria-hidden="true" />
              {status === "saving" ? t("profile.saving") : t("profile.save")}
            </button>
          </div>

          {profile && (
            <dl className="profile__audit" aria-label={t("profile.auditTitle")}>
              <div>
                <dt>{t("profile.createdAt")}</dt>
                <dd>{profile.createdAt}</dd>
              </div>
              <div>
                <dt>{t("profile.updatedAt")}</dt>
                <dd>{profile.updatedAt}</dd>
              </div>
              <div>
                <dt>{t("profile.revision")}</dt>
                <dd data-testid="profile-revision">{profile.revision}</dd>
              </div>
            </dl>
          )}
        </form>

        <RecoveryKeySection />
      </div>
    </section>
  );
}

function Field({
  id,
  label,
  required,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { id: string; label: string }) {
  return (
    <div className="profile__field">
      <label htmlFor={id}>
        {label}
        {required && (
          <span className="profile__req" aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </label>
      <input id={id} name={id} required={required} {...rest} />
    </div>
  );
}
