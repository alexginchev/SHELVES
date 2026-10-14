import { randomBytes, createHash, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { DatabaseSync } from "node:sqlite";
import type { Request, Response } from "express";
import type { User } from "../shared/types.ts";
import { one } from "./db.ts";
const derive = promisify(scrypt);
export const userColumns =
  "id, username, display_name AS displayName, bio, goal";
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
export function currentUser(db: DatabaseSync, req: Request) {
  return one<User>(
    db,
    `SELECT ${userColumns
      .split(",")
      .map((s) =>
        s.trim().startsWith("display_name")
          ? "u.display_name AS displayName"
          : `u.${s.trim()}`,
      )
      .join(
        ",",
      )} FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?`,
    digest(sessionToken(req)),
    Date.now(),
  );
}
export function createSession(db: DatabaseSync, res: Response, userId: string) {
  const token = randomBytes(32).toString("hex");
  const expires = Date.now() + 7 * 86400000;
  db.prepare("DELETE FROM sessions WHERE expires_at<?").run(Date.now());
  db.prepare("INSERT INTO sessions VALUES (?,?,?)").run(
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
export function endSession(db: DatabaseSync, req: Request, res: Response) {
  db.prepare("DELETE FROM sessions WHERE token_hash=?").run(
    digest(sessionToken(req)),
  );
  res.clearCookie("shelves_session", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}
