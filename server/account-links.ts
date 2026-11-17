import { createHash, randomBytes } from "node:crypto";
import rateLimit from "express-rate-limit";
import type { Express } from "express";
import { z } from "zod";
import type { Store } from "./store.ts";
import { ApiError } from "./services.ts";
import { hashPassword } from "./auth.ts";

type Purpose = "verify" | "reset";
const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
const emailSchema = z
  .email()
  .max(254)
  .transform((s) => s.trim().toLowerCase());
const passwordSchema = z.string().min(10).max(128);
const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

function origin() {
  const value =
    process.env.PUBLIC_ORIGIN || `http://127.0.0.1:${process.env.PORT || 3000}`;
  return value.replace(/\/$/, "");
}

function emailMarkup(purpose: Purpose, url: string) {
  const verify = purpose === "verify";
  const title = verify
    ? "Your next chapter starts here"
    : "A fresh page is waiting";
  const action = verify ? "Verify my email" : "Choose a new password";
  const detail = verify
    ? "This link is open for 24 hours."
    : "This link is open for 30 minutes.";
  // The URL is generated from a server-controlled origin and a hex token.
  return {
    subject: verify
      ? "Verify your Shelves email"
      : "Reset your Shelves password",
    text: `${title}\n\n${action}: ${url}\n\n${detail} If you didn't ask for this, you can ignore this letter.`,
    html: `<div style="background:#f3efe8;padding:36px 16px;font-family:Arial,sans-serif;color:#253e4a"><div style="max-width:520px;margin:auto;background:#fffdf8;border:1px solid #ded5c6;border-radius:18px;padding:36px"><div style="font-size:23px;font-weight:800;color:#853e2c">▤ shelves</div><p style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#637b74;margin-top:32px">A note for your reading life</p><h1 style="font-family:Georgia,serif;font-size:36px;line-height:1.1;margin:10px 0 20px">${title}</h1><p>One small step, then the stories are yours.</p><a href="${url}" style="display:inline-block;background:#253e4a;color:#fff;text-decoration:none;border-radius:9px;padding:14px 20px;margin:20px 0">${action} ↗</a><p style="font-size:13px;color:#637b74">${detail} If you didn't ask for this, you can ignore this letter.</p></div></div>`,
  };
}

async function deliver(email: string, purpose: Purpose, token: string) {
  const url = `${origin()}/#${purpose === "verify" ? "verify" : "reset"}?token=${token}`;
  const message = emailMarkup(purpose, url);
  const key = process.env.RESEND_API_KEY;
  const from = process.env.SHELVES_EMAIL_FROM;
  if (!key || !from) {
    if (process.env.NODE_ENV === "production")
      throw new ApiError(503, "Email delivery is temporarily unavailable.");
    if (process.env.NODE_ENV !== "test")
      console.info(`[Shelves email preview] ${email}: ${url}`);
    return;
  }
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [email], ...message }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new ApiError(
      503,
      "Email delivery is temporarily unavailable. Please try again.",
    );
  }
  if (!response.ok) {
    console.error(`Shelves email delivery failed: HTTP ${response.status}`);
    throw new ApiError(
      503,
      "Email delivery is temporarily unavailable. Please try again.",
    );
  }
}

export async function issueAccountLink(
  db: Store,
  userId: string,
  email: string,
  purpose: Purpose,
) {
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  await db.transaction(async (tx) => {
    await tx.run(
      "DELETE FROM account_links WHERE user_id=? AND purpose=?",
      userId,
      purpose,
    );
    await tx.run(
      "INSERT INTO account_links (token_hash,user_id,purpose,issued_at,expires_at) VALUES (?,?,?,?,?)",
      hashToken(token),
      userId,
      purpose,
      now,
      now + (purpose === "verify" ? 86400000 : 1800000),
    );
  });
  try {
    await deliver(email, purpose, token);
  } catch (error) {
    await db.run(
      "DELETE FROM account_links WHERE token_hash=?",
      hashToken(token),
    );
    throw error;
  }
  return token;
}

export function accountLinkRoutes(app: Express, db: Store) {
  const limiter = rateLimit({
    windowMs: 3600000,
    limit: 8,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests. Please try again later." },
  });
  app.post("/api/auth/resend-verification", limiter, async (req, res) => {
    const email = emailSchema.parse(req.body?.email);
    const row = await db.get<{ id: string; email_verified_at: number | null }>(
      "SELECT id,email_verified_at FROM users WHERE email=?",
      email,
    );
    if (row && !row.email_verified_at) {
      const last = await db.get<{ issued_at: number }>(
        "SELECT issued_at FROM account_links WHERE user_id=? AND purpose='verify'",
        row.id,
      );
      if (!last || Date.now() - Number(last.issued_at) > 60000)
        await issueAccountLink(db, row.id, email, "verify");
    }
    res.json({
      message:
        "If this address needs verification, a new letter is on its way.",
    });
  });
  app.post("/api/auth/forgot-password", limiter, async (req, res) => {
    const email = emailSchema.parse(req.body?.email);
    const row = await db.get<{ id: string }>(
      "SELECT id FROM users WHERE email=?",
      email,
    );
    if (row) {
      const last = await db.get<{ issued_at: number }>(
        "SELECT issued_at FROM account_links WHERE user_id=? AND purpose='reset'",
        row.id,
      );
      if (!last || Date.now() - Number(last.issued_at) > 60000)
        await issueAccountLink(db, row.id, email, "reset");
    }
    res.json({
      message:
        "If there's an account at that address, a reset letter is on its way.",
    });
  });
  app.post("/api/auth/verify-email", limiter, async (req, res) => {
    const token = tokenSchema.parse(req.body?.token);
    await db.transaction(async (tx) => {
      const row = await tx.get<{ user_id: string }>(
        `SELECT user_id FROM account_links WHERE token_hash=? AND purpose='verify' AND expires_at>?${tx.kind === "postgres" ? " FOR UPDATE" : ""}`,
        hashToken(token),
        Date.now(),
      );
      if (!row)
        throw new ApiError(
          400,
          "This verification link has expired or was already used.",
        );
      await tx.run(
        "UPDATE users SET email_verified_at=? WHERE id=?",
        Date.now(),
        row.user_id,
      );
      await tx.run(
        "DELETE FROM account_links WHERE user_id=? AND purpose='verify'",
        row.user_id,
      );
    });
    res.json({ message: "Your email is verified. Welcome to Shelves." });
  });
  app.post("/api/auth/reset-password", limiter, async (req, res) => {
    const token = tokenSchema.parse(req.body?.token);
    const password = passwordSchema.parse(req.body?.password);
    const passwordHash = await hashPassword(password);
    await db.transaction(async (tx) => {
      const row = await tx.get<{ user_id: string }>(
        `SELECT user_id FROM account_links WHERE token_hash=? AND purpose='reset' AND expires_at>?${tx.kind === "postgres" ? " FOR UPDATE" : ""}`,
        hashToken(token),
        Date.now(),
      );
      if (!row)
        throw new ApiError(
          400,
          "This reset link has expired or was already used.",
        );
      await tx.run(
        "UPDATE users SET password_hash=?,email_verified_at=COALESCE(email_verified_at,?) WHERE id=?",
        passwordHash,
        Date.now(),
        row.user_id,
      );
      await tx.run("DELETE FROM account_links WHERE user_id=?", row.user_id);
      await tx.run("DELETE FROM sessions WHERE user_id=?", row.user_id);
    });
    res.json({
      message: "Your password has changed. Sign in with your new one.",
    });
  });
}
