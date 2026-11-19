import express from "express";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { createApp } from "./app.ts";
import { openRuntimeDatabase } from "./runtime-db.ts";
if (!existsSync("dist/index.html"))
  throw new Error("Run npm run build before npm start.");
if (
  process.env.NODE_ENV === "production" &&
  !process.env.PUBLIC_ORIGIN?.startsWith("https://")
)
  throw new Error("Production requires an HTTPS PUBLIC_ORIGIN.");
if (process.env.NODE_ENV === "production") {
  if (process.env.SHELVES_EMAIL_PROVIDER === "emailjs") {
    if (
      !process.env.EMAILJS_SERVICE_ID ||
      !process.env.EMAILJS_PUBLIC_KEY ||
      !process.env.EMAILJS_RESET_TEMPLATE_ID ||
      !process.env.EMAILJS_VERIFY_TEMPLATE_ID ||
      !process.env.EMAILJS_PRIVATE_KEY
    )
      throw new Error(
        "Production EmailJS delivery requires service, public/private keys, and both account template IDs.",
      );
  } else if (!process.env.RESEND_API_KEY || !process.env.SHELVES_EMAIL_FROM)
    throw new Error(
      "Production requires Resend credentials or a complete EmailJS configuration.",
    );
}
const db = await openRuntimeDatabase();
const app = createApp(db);
app.use(express.static(resolve("dist")));
app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
const server = app.listen(
  Number(process.env.PORT || 3000),
  process.env.HOST || "127.0.0.1",
  () => console.log(`Shelves ready on port ${process.env.PORT || 3000}`),
);
process.on("SIGTERM", () =>
  server.close(async () => {
    await db.close();
    process.exit(0);
  }),
);
