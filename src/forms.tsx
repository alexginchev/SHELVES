import { useState, type FormEvent } from "react";
import type { Book, Reading, Shelf, User, Post } from "../shared/types";
import { Dialog, ErrorMessage, Form } from "./components";
import { api, json } from "./api";
type Done = () => Promise<void>;
function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Please try again.";
}
export function AuthDialog({
  onClose,
  onUser,
}: {
  onClose: () => void;
  onUser: (u: User) => Promise<void>;
}) {
  const [register, setRegister] = useState(false),
    [showPassword, setShowPassword] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const d = new FormData(e.currentTarget);
    try {
      const result = await api<{ user: User }>(
        `/auth/${register ? "register" : "login"}`,
        json("POST", {
          email: d.get("email"),
          password: d.get("password"),
          ...(register
            ? { username: d.get("username"), displayName: d.get("displayName") }
            : {}),
        }),
      );
      await onUser(result.user);
      onClose();
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={register ? "Join Shelves" : "Welcome back"}
      onClose={onClose}
    >
      <span className="section-kicker">YOUR READING LIFE, ALL TOGETHER</span>
      <h2>{register ? "A little room for you." : "Welcome back."}</h2>
      <p>Keep your books, notes, and reading circle together.</p>
      <Form noValidate onSubmit={submit}>
        {register ? (
          <>
            <label>
              Your name
              <input
                name="displayName"
                required
                maxLength={60}
                autoComplete="name"
              />
            </label>
            <label>
              Username
              <input
                name="username"
                aria-label="Username"
                required
                minLength={3}
                maxLength={24}
                pattern="[a-zA-Z0-9_]+"
                autoComplete="username"
              />
              <small>Letters, numbers, and underscores.</small>
            </label>
          </>
        ) : null}
        <label>
          Email
          <input
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
          />
        </label>
        <label>
          Password
          <input
            name="password"
            aria-label="Password"
            type={showPassword ? "text" : "password"}
            required
            minLength={10}
            maxLength={128}
            autoComplete={register ? "new-password" : "current-password"}
          />
          <small>At least 10 characters.</small>
        </label>
        <button
          type="button"
          className="plain-link"
          aria-pressed={showPassword}
          onClick={() => setShowPassword(!showPassword)}
        >
          {showPassword ? "Hide password" : "Show password"}
        </button>
        <ErrorMessage message={error} />
        <button className="primary-btn" disabled={busy}>
          {busy
            ? "Please wait…"
            : register
              ? "Create my account ↗"
              : "Sign in ↗"}
        </button>
        <button
          className="plain-link"
          type="button"
          onClick={() => {
            setRegister(!register);
            setError("");
          }}
        >
          {register
            ? "Already a reader? Sign in"
            : "New here? Create an account"}
        </button>
      </Form>
    </Dialog>
  );
}
export function BookDialog({
  book,
  record,
  shelves,
  user,
  onAuth,
  onClose,
  onSaved,
}: {
  book: Book;
  record?: Reading;
  shelves: Shelf[];
  user: User | null;
  onAuth: () => void;
  onClose: () => void;
  onSaved: Done;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [remove, setRemove] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) {
      onAuth();
      return;
    }
    const d = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api(
        `/library/${book.id}`,
        json("PUT", {
          status: d.get("status"),
          page: Number(d.get("page")),
          rating: Number(d.get("rating")),
          review: d.get("review"),
          shelfIds: d.getAll("shelf"),
        }),
      );
      await onSaved();
      onClose();
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  async function deleteRecord() {
    setBusy(true);
    setError("");
    try {
      await api(`/library/${book.id}`, { method: "DELETE" });
      await onSaved();
      onClose();
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title={book.title} onClose={onClose}>
      <span className="section-kicker">YOUR NEXT CHAPTER</span>
      <h2>{book.title}</h2>
      <p>
        {book.author} · {book.genre}
        {book.year ? ` · ${book.year}` : ""}
        {book.pages ? ` · ${book.pages} pages` : ""}
      </p>
      <p>{book.description}</p>
      <Form noValidate onSubmit={submit}>
        <label>
          Reading status
          <select name="status" defaultValue={record?.status || "Want to read"}>
            {[
              "Want to read",
              "Currently reading",
              "Finished",
              "Did not finish",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Your rating
          <select name="rating" defaultValue={record?.rating || 0}>
            <option value="0">Not rated</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option value={n} key={n}>
                {n} {n === 1 ? "star" : "stars"}
              </option>
            ))}
          </select>
        </label>
        <label>
          Page reached
          <input
            name="page"
            type="number"
            min={0}
            max={book.pages || 50000}
            defaultValue={record?.page || 0}
            required
          />
        </label>
        <label>
          Your private review
          <textarea
            className="resize-none"
            name="review"
            maxLength={4000}
            defaultValue={record?.review || ""}
            placeholder="What stayed with you?"
          />
        </label>
        {shelves.map((s) => (
          <label key={s.id} className="shelf-check">
            <input
              type="checkbox"
              name="shelf"
              value={s.id}
              defaultChecked={record?.shelfIds.includes(s.id)}
            />
            {s.name}
          </label>
        ))}
        <p className="local-note">
          Your reading record, shelves, and review are private. Share a public
          post separately when you want to.
        </p>
        <ErrorMessage message={error} />
        <button className="primary-btn" disabled={busy}>
          {busy
            ? "Saving…"
            : user
              ? "Save reading update ↗"
              : "Sign in to save ↗"}
        </button>
        {record ? (
          <>
            {remove ? (
              <div className="remove-confirm">
                <p>
                  Remove this book and its private review from your library?
                </p>
                <button
                  type="button"
                  className="outline-btn"
                  disabled={busy}
                  onClick={deleteRecord}
                >
                  Remove book and notes
                </button>
                <button
                  type="button"
                  className="plain-link"
                  onClick={() => setRemove(false)}
                >
                  Keep it
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="plain-link"
                onClick={() => setRemove(true)}
              >
                Remove from my library
              </button>
            )}
          </>
        ) : null}
      </Form>
    </Dialog>
  );
}
export function SimpleForm({
  kind,
  post,
  onClose,
  onSaved,
}: {
  kind: "shelf" | "post" | "comment" | "delete";
  post?: Post;
  onClose: () => void;
  onSaved: Done;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const title =
    kind === "shelf"
      ? "Make a new shelf"
      : kind === "comment"
        ? "Leave a little note"
        : kind === "delete"
          ? "Delete your post?"
          : "Share a little thought";
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      if (kind === "shelf")
        await api("/shelves", json("POST", { name: d.get("name") }));
      if (kind === "post")
        await api(
          "/posts",
          json("POST", { body: d.get("body"), kind: "thought" }),
        );
      if (kind === "comment")
        await api(
          `/posts/${post!.id}/comments`,
          json("POST", { body: d.get("body") }),
        );
      if (kind === "delete")
        await api(`/posts/${post!.id}`, { method: "DELETE" });
      await onSaved();
      onClose();
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title={title} onClose={onClose}>
      <span className="section-kicker">A LITTLE SHELVES MOMENT</span>
      <h2>{title}</h2>
      <Form noValidate onSubmit={submit}>
        {kind === "shelf" ? (
          <label>
            Shelf name
            <input
              name="name"
              required
              maxLength={60}
              placeholder="Books for rainy days"
            />
          </label>
        ) : kind === "delete" ? (
          <p>
            This removes the post, its likes, and its conversation for everyone.
          </p>
        ) : (
          <>
            <label>
              Your note
              <textarea
                className="resize-none"
                name="body"
                required
                maxLength={kind === "comment" ? 500 : 1200}
                placeholder="A sentence, a feeling, a book you cannot stop thinking about…"
              />
            </label>
            <p className="local-note">
              This {kind === "comment" ? "comment" : "post"} is public to
              everyone browsing Shelves.
            </p>
          </>
        )}
        <ErrorMessage message={error} />
        <button className="primary-btn" disabled={busy}>
          {busy
            ? "Saving…"
            : kind === "shelf"
              ? "Create shelf ↗"
              : kind === "delete"
                ? "Delete post"
                : kind === "comment"
                  ? "Add note ↗"
                  : "Share with the community ↗"}
        </button>
      </Form>
    </Dialog>
  );
}
export function ProfileForm({
  user,
  onSaved,
}: {
  user: User;
  onSaved: (u: User) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSaved(false);
    const d = new FormData(e.currentTarget);
    try {
      const result = await api<{ user: User }>(
        "/me",
        json("PATCH", {
          displayName: d.get("displayName"),
          bio: d.get("bio"),
          goal: Number(d.get("goal")),
        }),
      );
      await onSaved(result.user);
      setSaved(true);
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Form noValidate className="profile-form" onSubmit={submit}>
      <label>
        Your name
        <input
          name="displayName"
          defaultValue={user.displayName}
          required
          maxLength={60}
        />
      </label>
      <label>
        A little about you
        <textarea
          className="resize-none"
          name="bio"
          defaultValue={user.bio}
          maxLength={300}
        />
      </label>
      <label>
        Reading goal for {new Date().getFullYear()}
        <input
          name="goal"
          type="number"
          min={1}
          max={500}
          defaultValue={user.goal}
          required
        />
      </label>
      <ErrorMessage message={error} />
      {saved ? <p role="status">Your profile and goal are saved.</p> : null}
      <button className="primary-btn" disabled={busy}>
        {busy ? "Saving…" : "Save profile ↗"}
      </button>
    </Form>
  );
}
export function ShelfDialog({
  shelf,
  deleting,
  onClose,
  onSaved,
}: {
  shelf: Shelf;
  deleting: boolean;
  onClose: () => void;
  onSaved: Done;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api(
        `/shelves/${shelf.id}`,
        deleting
          ? { method: "DELETE" }
          : json("PATCH", { name: new FormData(e.currentTarget).get("name") }),
      );
      await onSaved();
      onClose();
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={deleting ? "Delete shelf" : "Rename shelf"}
      onClose={onClose}
    >
      <span className="section-kicker">YOUR PERSONAL LIBRARY</span>
      <h2>{deleting ? "Delete this shelf?" : "Give your shelf a new name."}</h2>
      <Form noValidate onSubmit={submit}>
        {deleting ? (
          <p>
            Delete “{shelf.name}”? Its {shelf.count}{" "}
            {shelf.count === 1 ? "book stays" : "books stay"} in your library,
            with all your reading progress and private notes. Only this shelf
            and its memberships will be removed.
          </p>
        ) : (
          <label>
            Shelf name
            <input
              name="name"
              required
              maxLength={60}
              defaultValue={shelf.name}
            />
          </label>
        )}
        <ErrorMessage message={error} />
        <div className="shelf-actions">
          <button
            type="button"
            className="outline-btn"
            autoFocus={deleting}
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className={deleting ? "outline-btn danger-button" : "primary-btn"}
            disabled={busy}
          >
            {busy ? "Saving…" : deleting ? "Delete shelf" : "Save shelf name"}
          </button>
        </div>
      </Form>
    </Dialog>
  );
}
