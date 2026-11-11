import express, { type Express } from "express";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Store } from "./store.ts";
import { ApiError } from "./services.ts";

export const mediaColumns = `(SELECT version FROM profile_images WHERE user_id=u.id AND kind='avatar') AS "avatarVersion",(SELECT version FROM profile_images WHERE user_id=u.id AND kind='banner') AS "bannerVersion"`;
export function profileMediaRoutes(app: Express, db: Store) {
  const kind = z.enum(["avatar", "banner"]);
  app.get("/api/readers/:id/images/:kind", async (req, res) => {
    const row = await db.get<{ image: string; version: string }>(
      "SELECT image,version FROM profile_images WHERE user_id=? AND kind=?",
      String(req.params.id),
      kind.parse(req.params.kind),
    );
    if (!row) throw new ApiError(404, "Image not found.");
    if (req.query.v === row.version)
      res.setHeader("Cache-Control", "public, max-age=300");
    res.type("image/jpeg").send(Buffer.from(row.image, "base64"));
  });
  app.put(
    "/api/me/images/:kind",
    (req, res, next) => {
      if (!res.locals.user)
        return next(
          new ApiError(401, "Sign in to change your profile images."),
        );
      next();
    },
    express.raw({
      type: ["image/jpeg", "image/png", "image/webp"],
      limit: "5mb",
    }),
    async (req, res) => {
      const slot = kind.parse(req.params.kind);
      if (!Buffer.isBuffer(req.body) || !req.body.length)
        throw new ApiError(400, "Choose a JPEG, PNG or WebP image up to 5 MB.");
      let image: Buffer;
      try {
        const source = sharp(req.body, {
          limitInputPixels: 25000000,
          failOn: "warning",
        });
        const metadata = await source.metadata();
        if (
          !["jpeg", "png", "webp"].includes(metadata.format || "") ||
          (metadata.pages || 1) > 1
        )
          throw new Error("Unsupported image");
        image = await source
          .rotate()
          .resize(
            slot === "avatar" ? 384 : 1600,
            slot === "avatar" ? 384 : 500,
            { fit: "cover", position: "centre" },
          )
          .flatten({ background: "#f7f1e7" })
          .jpeg({ quality: 85 })
          .toBuffer();
      } catch {
        throw new ApiError(
          400,
          "This image could not be read. Choose a static JPEG, PNG or WebP under 25 megapixels.",
        );
      }
      const version = randomUUID();
      await db.run(
        "INSERT INTO profile_images VALUES (?,?,?,?) ON CONFLICT(user_id,kind) DO UPDATE SET image=excluded.image,version=excluded.version",
        res.locals.user.id,
        slot,
        image.toString("base64"),
        version,
      );
      res.json({ version });
    },
  );
  app.delete("/api/me/images/:kind", async (req, res) => {
    if (!res.locals.user)
      throw new ApiError(401, "Sign in to change your profile images.");
    await db.run(
      "DELETE FROM profile_images WHERE user_id=? AND kind=?",
      res.locals.user.id,
      kind.parse(req.params.kind),
    );
    res.status(204).end();
  });
}
