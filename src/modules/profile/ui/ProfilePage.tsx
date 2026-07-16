import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@modules/auth";
import { profileApi } from "../api/profileApi";
import type { Profile } from "../model/types";
import "./ProfilePage.css";

export function ProfilePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
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

  return (
    <section className="profile">
      <header className="profile__header">
        <h1>{t("profile.title")}</h1>
        <p className="profile__subtitle">{t("profile.subtitle")}</p>
      </header>

      <form className="profile__form" onSubmit={onSubmit}>
        <label className="profile__field" htmlFor="firstName">
          <span>{t("profile.firstName")}</span>
          <input
            id="firstName"
            value={form.firstName}
            onChange={update("firstName")}
            required
          />
        </label>
        <label className="profile__field" htmlFor="lastName">
          <span>{t("profile.lastName")}</span>
          <input
            id="lastName"
            value={form.lastName}
            onChange={update("lastName")}
            required
          />
        </label>
        <label className="profile__field" htmlFor="displayName">
          <span>{t("profile.displayName")}</span>
          <input
            id="displayName"
            value={form.displayName}
            onChange={update("displayName")}
            required
          />
        </label>

        <button className="profile__save" type="submit" disabled={status === "saving"}>
          {status === "saving" ? t("profile.saving") : t("profile.save")}
        </button>
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
      </form>

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
    </section>
  );
}
