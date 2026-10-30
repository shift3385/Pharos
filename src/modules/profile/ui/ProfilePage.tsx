import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Check, LogOut, Moon, Sun } from "lucide-react";
import { useAuth } from "@modules/auth";
import { SyncIndicator } from "@modules/sync-offline";
import { SUPPORTED_LANGUAGES, type Language } from "@shared/i18n";
import { useTheme } from "@shared/theme/useTheme";
import { SegmentedControl } from "@shared/ui/SegmentedControl";
import { TruncatedText } from "@shared/ui/TruncatedText";
import { useBreakpoint } from "@shared/ui/useBreakpoint";
import { profileApi } from "../api/profileApi";
import { RecoveryKeySection } from "./RecoveryKeySection";
import type { Profile } from "../model/types";
import "./ProfilePage.css";

/** Two-letter avatar from the display name (same rule as the user menu). */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    parts.length > 1 ? parts[0][0] + parts[1][0] : name.trim().slice(0, 2);
  return letters.toUpperCase();
}

/** Perfil (SPEC §8, `ScrPerfil.dc.html`): who you are (avatar, name, email,
 *  sync status), your alias and official name, and your preferences (language
 *  and theme). On mobile «Cerrar sesión» is also here, as in the prototype
 *  (the avatar in the mobile bar opens the user menu too). The recovery key stays here until Administración › Seguridad mounts
 *  it (RED-V4), which then removes it from this page. */
export function ProfilePage() {
  const { t, i18n } = useTranslation();
  const when = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? iso
      : new Intl.DateTimeFormat(i18n.resolvedLanguage, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(d);
  };
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
    (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
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

  const fullName = [
    profile?.firstName ?? user?.firstName,
    profile?.lastName ?? user?.lastName,
  ]
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
              {user && (
                <TruncatedText className="profile__email" value={user.email} />
              )}
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
              <span
                className="profile__status profile__status--error"
                role="alert"
              >
                {t("profile.error")}
              </span>
            )}
            <button
              className="profile__save"
              type="submit"
              disabled={status === "saving"}
            >
              <Check size={16} aria-hidden="true" />
              {status === "saving" ? t("profile.saving") : t("profile.save")}
            </button>
          </div>

          {profile && (
            <dl className="profile__audit" aria-label={t("profile.auditTitle")}>
              <div>
                <dt>{t("profile.createdAt")}</dt>
                <dd title={profile.createdAt}>{when(profile.createdAt)}</dd>
              </div>
              <div>
                <dt>{t("profile.updatedAt")}</dt>
                <dd title={profile.updatedAt}>{when(profile.updatedAt)}</dd>
              </div>
              <div>
                <dt>{t("profile.revision")}</dt>
                <dd data-testid="profile-revision">{profile.revision}</dd>
              </div>
            </dl>
          )}
        </form>

        <Preferences />

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
}: React.InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
}) {
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

function Preferences() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const language = (i18n.resolvedLanguage ?? "es") as Language;
  return (
    <section
      className="profile-card profile-prefs"
      aria-labelledby="profile-prefs-title"
    >
      <h2 id="profile-prefs-title" className="profile-card__title">
        {t("profile.preferences")}
      </h2>
      <div className="profile-pref">
        <div className="profile-pref__text">
          <span className="profile-pref__name">{t("profile.language")}</span>
        </div>
        <div className="profile-pref__control">
          <SegmentedControl
            label={t("profile.language")}
            value={language}
            onChange={(lng) => void i18n.changeLanguage(lng)}
            options={SUPPORTED_LANGUAGES.map((lng) => ({
              value: lng,
              label: t(`language.${lng}`),
            }))}
            testId="profile-language"
          />
        </div>
      </div>
      <div className="profile-pref">
        <div className="profile-pref__text">
          <span className="profile-pref__name">{t("profile.theme")}</span>
          <span className="profile-pref__help">{t("profile.themeHelp")}</span>
        </div>
        <div className="profile-pref__control">
          <SegmentedControl
            label={t("profile.theme")}
            value={theme}
            onChange={setTheme}
            options={[
              { value: "light", label: t("profile.themeLight"), icon: Sun },
              { value: "dark", label: t("profile.themeDark"), icon: Moon },
            ]}
            testId="profile-theme"
          />
        </div>
      </div>
    </section>
  );
}
