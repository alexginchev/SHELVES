import { useEffect, useState } from "react";
import type { User } from "../shared/types";
import { api, json } from "./api";
import { Dialog, ErrorMessage, Form } from "./components";

type Action = "password" | "sessions" | "delete";
const titles = {
  password: "Change password",
  sessions: "Sign out all devices",
  delete: "Delete account",
};
export function AccountSettings({
  user,
  onAuth,
  onEnded,
}: {
  user: User | null;
  onAuth: () => void;
  onEnded: () => Promise<void>;
}) {
  const [account, setAccount] = useState<{
      email: string;
      activeSessions: number;
    } | null>(null),
    [error, setError] = useState(""),
    [action, setAction] = useState<Action | null>(null),
    [retry, setRetry] = useState(0),
    [success, setSuccess] = useState("");
  useEffect(() => {
    setAccount(null);
    setError("");
    if (!user) return;
    setSuccess("");
    const controller = new AbortController();
    api<{ email: string; activeSessions: number }>("/account", {
      signal: controller.signal,
    })
      .then((value) => {
        if (!controller.signal.aborted) setAccount(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [user?.id, retry]);
  return (
    <>
      <section className="view-panel account-settings">
        <span className="section-kicker">YOUR ACCOUNT, YOUR CONTROL</span>
        <h2>Keep your reading life secure.</h2>
        {success ? <p role="status">{success}</p> : null}
        {!user ? (
          <>
            <p>Sign in to manage your account.</p>
            <button className="primary-btn" onClick={onAuth}>
              Sign in
            </button>
          </>
        ) : (
          <>
            <a href="#profile" className="plain-link">
              Back to my profile
            </a>
            <a href="#preferences" className="plain-link account-settings-link">
              Reading preferences
            </a>
            <ErrorMessage message={error} />
            {error ? (
              <button
                className="outline-btn"
                onClick={() => setRetry(retry + 1)}
              >
                Try again
              </button>
            ) : !account ? (
              <p role="status">Loading account details…</p>
            ) : (
              <dl className="account-details">
                <div>
                  <dt>Email</dt>
                  <dd>{account.email}</dd>
                </div>
                <div>
                  <dt>Active sessions</dt>
                  <dd>
                    {account.activeSessions} signed-in{" "}
                    {account.activeSessions === 1 ? "session" : "sessions"},
                    including this browser
                  </dd>
                </div>
              </dl>
            )}
            <div className="account-section">
              <h3>Password</h3>
              <p>
                Use your current password to choose a new one. You’ll sign in
                again on every device afterward.
              </p>
              <button
                className="outline-btn"
                onClick={() => {
                  setSuccess("");
                  setAction("password");
                }}
              >
                Change password
              </button>
            </div>
            <div className="account-section">
              <h3>Signed-in devices</h3>
              <p>
                Sign out every active session, including this browser. Your
                books and notes stay saved.
              </p>
              <button
                className="outline-btn"
                onClick={() => {
                  setSuccess("");
                  setAction("sessions");
                }}
              >
                Sign out all devices
              </button>
            </div>
            <div className="account-section">
              <h3>Delete your account</h3>
              <p>
                Permanently remove your profile, library, notes, shelves, lists,
                posts, reviews, comments, and social activity. This cannot be
                undone.
              </p>
              <button
                className="outline-btn"
                onClick={() => {
                  setSuccess("");
                  setAction("delete");
                }}
              >
                Delete account
              </button>
            </div>
          </>
        )}
      </section>
      {action && user ? (
        <AccountAction
          key={action}
          action={action}
          onClose={() => setAction(null)}
          onDone={async () => {
            setAction(null);
            setSuccess(
              action === "password"
                ? "Your password has changed. Sign in with your new password."
                : action === "sessions"
                  ? "You have signed out of all devices."
                  : "Your account has been deleted.",
            );
            await onEnded();
          }}
        />
      ) : null}
    </>
  );
}

function AccountAction({
  action,
  onClose,
  onDone,
}: {
  action: Action;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Dialog
      title={titles[action]}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <h2>{titles[action]}</h2>
      <p>
        {action === "delete"
          ? "This permanently deletes your Shelves account and its content. Enter your password and type DELETE to confirm."
          : action === "password"
            ? "Choose a password with at least 10 characters. Saving it signs you out on every device."
            : "Confirm your password to sign out everywhere, including here."}
      </p>
      <Form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          const form = new FormData(e.currentTarget),
            currentPassword = String(form.get("password") || ""),
            newPassword = String(form.get("newPassword") || "");
          if (
            action === "password" &&
            newPassword !== form.get("confirmPassword")
          ) {
            setError("The new passwords do not match.");
            return;
          }
          setBusy(true);
          setError("");
          try {
            await api(
              action === "password"
                ? "/account/password"
                : action === "sessions"
                  ? "/account/sign-out-all"
                  : "/account",
              json(
                action === "delete" ? "DELETE" : "POST",
                action === "password"
                  ? { currentPassword, newPassword }
                  : {
                      password: currentPassword,
                      ...(action === "delete"
                        ? { confirmation: form.get("confirmation") }
                        : {}),
                    },
              ),
            );
            await onDone();
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Could not update your account.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset className="account-fields" disabled={busy}>
          <label>
            Current password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
            />
          </label>
          {action === "password" ? (
            <>
              <label>
                New password
                <input
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={10}
                  maxLength={128}
                />
              </label>
              <label>
                Confirm new password
                <input
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={10}
                  maxLength={128}
                />
              </label>
            </>
          ) : null}
          {action === "delete" ? (
            <label>
              Type DELETE to confirm
              <input
                name="confirmation"
                required
                pattern="DELETE"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          ) : null}
          <ErrorMessage message={error} />
          <div className="account-actions">
            <button
              type="button"
              className="outline-btn"
              autoFocus
              onClick={onClose}
            >
              Cancel
            </button>
            <button className="primary-btn" type="submit">
              {busy
                ? "Please wait…"
                : action === "delete"
                  ? "Permanently delete my account"
                  : action === "password"
                    ? "Save new password"
                    : "Sign out everywhere"}
            </button>
          </div>
        </fieldset>
      </Form>
    </Dialog>
  );
}
