import { useState, type FormEvent } from "react";
import { api, json } from "./api";
import { Dialog, ErrorMessage, Form } from "./components";
import { BrandMark } from "./SiteIdentity";

export function AccountLinkDialog({
  kind,
  token,
  onClose,
  onVerified,
}: {
  kind: "verify" | "reset";
  token: string;
  onClose: () => void;
  onVerified: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);
  const validToken = /^[a-f0-9]{64}$/.test(token);
  async function verify() {
    if (busy || !validToken) return;
    setBusy(true);
    setError("");
    try {
      await api("/auth/verify-email", json("POST", { token }));
      await onVerified();
      setDone(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function reset(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!token)
        throw new Error(
          "This letter is missing its link. Request another from sign in.",
        );
      const fields = new FormData(e.currentTarget);
      if (fields.get("password") !== fields.get("confirm"))
        throw new Error("The passwords do not match.");
      await api(
        "/auth/reset-password",
        json("POST", { token, password: fields.get("password") }),
      );
      setDone(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={kind === "verify" ? "Verify your email" : "Reset your password"}
      onClose={onClose}
      className="auth-dialog"
    >
      <div className="auth-layout">
        <div className="auth-greeting">
          <BrandMark />
          <p>
            A fresh <strong>chapter.</strong>
          </p>
        </div>
        <div className="auth-entry auth-letter">
          <div className="auth-letter-icon" aria-hidden="true">
            ✳
          </div>
          <span className="section-kicker">A NOTE FROM SHELVES</span>
          <h2>
            {done
              ? kind === "verify"
                ? "Your shelf is yours."
                : "The page is yours again."
              : kind === "verify"
                ? "One last page to turn."
                : "Choose a new password"}
          </h2>
          {done ? (
            <p>
              {kind === "verify"
                ? "Your email is verified. Make yourself at home."
                : "Your password has changed. Every old session has been signed out."}
            </p>
          ) : kind === "reset" && validToken ? (
            <Form className="auth-form" onSubmit={reset}>
              <div className="auth-password">
                <label>
                  New password
                  <input
                    name="password"
                    type={show ? "text" : "password"}
                    required
                    minLength={10}
                    maxLength={128}
                    autoComplete="new-password"
                  />
                </label>
                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShow(!show)}
                >
                  {show ? "Hide" : "Show"}
                  <span className="auth-sr-only"> password</span>
                </button>
              </div>
              <label>
                Confirm password
                <input
                  name="confirm"
                  type={show ? "text" : "password"}
                  required
                  minLength={10}
                  maxLength={128}
                  autoComplete="new-password"
                />
              </label>
              <p className="auth-field-hint">
                At least 10 characters. This link expires in 30 minutes.
              </p>
              <button className="primary-btn auth-submit" disabled={busy}>
                {busy ? "Saving…" : "Start a fresh chapter"}
              </button>
            </Form>
          ) : kind === "verify" && validToken ? (
            <>
              <p>
                Confirm this email belongs to you, and your reading nook is
                ready.
              </p>
              <button className="primary-btn" disabled={busy} onClick={verify}>
                {busy ? "Opening…" : "Open my letter ↗"}
              </button>
            </>
          ) : (
            <p>
              This link could not be opened. You can request another from sign
              in.
            </p>
          )}
          <ErrorMessage message={error} />
          {done || error || !validToken ? (
            <button className="outline-btn" onClick={onClose}>
              {done ? "Continue to Shelves" : "Back to Shelves"}
            </button>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}
