import { ApiError } from "./services.ts";
import { isAdmin } from "./admin.ts";
import { mediaColumns } from "./profile-media.ts";
import { randomBytes, createHash, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Store } from "./store.ts";
import type { Request, Response } from "express";
import type { User } from "../shared/types.ts";
import { one } from "./db.ts";
const derive = promisify(scrypt);
export const userColumns =
  'id, username, display_name AS "displayName", bio, goal';
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await derive(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [salt, key] = stored.split(":");
  const derived = (await derive(password, salt, 64)) as Buffer;
  const expected = Buffer.from(key, "hex");
  return (
    expected.length === derived.length && timingSafeEqual(expected, derived)
  );
}
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
function sessionToken(req: Request) {
  return (
    req.headers.cookie
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("shelves_session="))
      ?.slice("shelves_session=".length) || ""
  );
}
export async function currentUser(db: Store, req: Request) {
  const token = sessionToken(req);
  if (!token) return undefined;
  const user = await one<User>(
    db,
    `SELECT ${userColumns
      .split(",")
      .map((s) =>
        s.trim().startsWith("display_name")
          ? 'u.display_name AS "displayName"'
          : `u.${s.trim()}`,
      )
      .join(
        ",",
      )},${mediaColumns} FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>? AND NOT EXISTS(SELECT 1 FROM account_suspensions a WHERE a.user_id=u.id)`,
    digest(token),
    Date.now(),
  );
  return user ? { ...user, isAdmin: isAdmin(user.id) } : undefined;
}
export async function createSession(db: Store, res: Response, userId: string) {
  if (
    await db.get(
      "SELECT user_id FROM account_suspensions WHERE user_id=?",
      userId,
    )
  )
    throw new ApiError(
      403,
      "Your account is suspended. Contact a Shelves administrator for review.",
    );
  const token = randomBytes(32).toString("hex");
  const expires = Date.now() + 7 * 86400000;
  await db.run("DELETE FROM sessions WHERE expires_at<?", Date.now());
  await db.run(
    "INSERT INTO sessions VALUES (?,?,?)",
    digest(token),
    userId,
    expires,
  );
  res.cookie("shelves_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 86400000,
    path: "/",
  });
}
export async function endSession(db: Store, req: Request, res: Response) {
  await db.run(
    "DELETE FROM sessions WHERE token_hash=?",
    digest(sessionToken(req)),
  );
  res.clearCookie("shelves_session", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}
