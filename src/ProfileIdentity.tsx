import { ShelvesBadge } from "./ShelvesBadge";
import { useState } from "react";
import type { User, Reader } from "../shared/types";
import { api } from "./api";
import { Avatar, ErrorMessage } from "./components";
export const profileImage = (id: string, kind: string, version: string) =>
  `/api/readers/${encodeURIComponent(id)}/images/${kind}?v=${encodeURIComponent(version)}`;
export function ProfileIdentity({
  reader,
  followers,
  following,
}: {
  reader: User | Reader;
  followers: number;
  following: number;
}) {
  return (
    <section className="view-panel profile-identity">
      <div className="profile-banner">
        {reader.bannerVersion ? (
          <img
            src={profileImage(reader.id, "banner", reader.bannerVersion)}
            alt="Profile banner"
          />
        ) : (
          <div className="profile-banner-default">
            <span>A life between the pages.</span>
          </div>
        )}
      </div>
      <div className="profile-identity-body">
        <div className="profile-portrait">
          <Avatar
            name={reader.displayName}
            src={
              reader.avatarVersion
                ? profileImage(reader.id, "avatar", reader.avatarVersion)
                : undefined
            }
          />
        </div>
        <span className="section-kicker">THE READER BEHIND THE BOOKS</span>
        <h2 className="profile-display-name">
          {reader.displayName}
          <ShelvesBadge verified={reader.isAdmin} />
        </h2>
        <p className="profile-handle">@{reader.username}</p>
        <p className="preserve-lines">
          {reader.bio || "A new chapter on Shelves."}
        </p>
        <div className="profile-stats">
          <a
            className="plain-link"
            href={`#readers?scope=followers&reader=${reader.id}`}
          >
            <b>{followers}</b> followers
          </a>
          <a
            className="plain-link"
            href={`#readers?scope=following&reader=${reader.id}`}
          >
            <b>{following}</b> following
          </a>
        </div>
      </div>
    </section>
  );
}
export function ProfileManagement({
  user,
  onSaved,
}: {
  user: User;
  onSaved: () => Promise<void>;
}) {
  return (
    <section
      className="view-panel profile-management"
      aria-labelledby="profile-management-title"
    >
      <span className="section-kicker">YOUR SPACE, YOUR SETTINGS</span>
      <h2 id="profile-management-title">Profile & account</h2>
      <p className="view-intro">
        Personalise your profile and manage your experience on Shelves.
      </p>
      <nav className="profile-management-links" aria-label="Profile management">
        <a href="#safety">
          <strong>
            Muted and blocked readers <span aria-hidden="true">↗</span>
          </strong>
          <span>Review your list and unmute or unblock accounts.</span>
        </a>
        {user.isAdmin ? (
          <a href="#moderation">
            <strong>
              Community reports <span aria-hidden="true">↗</span>
            </strong>
            <span>Review reported content and manage community safety.</span>
          </a>
        ) : null}
        <a href="#settings">
          <strong>
            Account settings <span aria-hidden="true">↗</span>
          </strong>
          <span>Password, active sessions and account controls.</span>
        </a>
      </nav>
      <ProfileImages user={user} onSaved={onSaved} />
    </section>
  );
}
export function ProfileImages({
  user,
  onSaved,
}: {
  user: User;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function change(kind: string, file?: File) {
    if (busy) return;
    setError("");
    setNotice("");
    if (
      file &&
      (!["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 5 * 1024 * 1024)
    ) {
      setError("Choose a JPEG, PNG or WebP image up to 5 MB.");
      return;
    }
    setBusy(kind);
    try {
      await api(
        `/me/images/${kind}`,
        file
          ? {
              method: "PUT",
              headers: { "Content-Type": file.type },
              body: file,
            }
          : { method: "DELETE" },
      );
      await onSaved();
      setNotice(file ? "Profile image updated." : "Profile image removed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update your image.");
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="profile-image-editor">
      <h3>Profile picture & banner</h3>
      <p>
        Upload a profile picture and a banner. Images are public and
        centre-cropped. JPEG, PNG or WebP, up to 5 MB.
      </p>
      <div className="profile-upload-grid">
        {(["avatar", "banner"] as const).map((kind) => (
          <div className="profile-upload-card" key={kind}>
            <div className={`profile-upload-preview preview-${kind}`}>
              {user[kind === "avatar" ? "avatarVersion" : "bannerVersion"] ? (
                <img
                  src={profileImage(
                    user.id,
                    kind,
                    user[
                      kind === "avatar" ? "avatarVersion" : "bannerVersion"
                    ]!,
                  )}
                  alt={
                    kind === "avatar"
                      ? "Current profile picture"
                      : "Current banner"
                  }
                />
              ) : (
                <span>
                  {kind === "avatar"
                    ? user.displayName.slice(0, 1).toUpperCase()
                    : "A life between the pages."}
                </span>
              )}
            </div>
            <label>
              {kind === "avatar" ? "Profile picture" : "Profile banner"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={!!busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void change(kind, file);
                  e.target.value = "";
                }}
              />
            </label>
            {user[kind === "avatar" ? "avatarVersion" : "bannerVersion"] ? (
              <button
                className="plain-link"
                disabled={!!busy}
                onClick={() => void change(kind)}
              >
                Remove {kind === "avatar" ? "profile picture" : "banner"}
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {busy ? <p role="status">Updating image…</p> : null}
      <ErrorMessage message={error} />
      {notice ? <p role="status">{notice}</p> : null}
    </div>
  );
}
