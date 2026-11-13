import { readingGenres } from "./genres.ts";
import { z } from "zod";
export const statusSchema = z.enum([
  "Want to read",
  "Currently reading",
  "Finished",
  "Did not finish",
]);
export type ReadingStatus = z.infer<typeof statusSchema>;
export const registerSchema = z.object({
  email: z
    .email()
    .max(254)
    .transform((s) => s.toLowerCase().trim()),
  password: z.string().min(10, "Use at least 10 characters.").max(128),
  username: z
    .string()
    .min(3)
    .max(24)
    .regex(/^[a-zA-Z0-9_]+$/, "Use letters, numbers, or underscores.")
    .transform((s) => s.toLowerCase()),
  displayName: z.string().trim().min(1).max(60),
});
export const loginSchema = registerSchema.pick({ email: true, password: true });
export const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(60),
  bio: z.string().trim().max(300),
  goal: z.number().int().min(1).max(500),
});
export const readingSchema = z.object({
  status: statusSchema,
  page: z.number().int().min(0).max(50000),
  rating: z.number().int().min(0).max(5),
  review: z.string().trim().max(4000),
  shelfIds: z.array(z.string().uuid()).max(50),
});
export const shelfSchema = z.object({ name: z.string().trim().min(1).max(60) });

export const preferencesSchema = z.object({
  genres: z
    .array(z.enum(readingGenres))
    .max(5)
    .refine(
      (values) => new Set(values).size === values.length,
      "Choose each genre only once.",
    ),
});
export type ReadingPreferences = { genres: string[]; completed: boolean };
export const listSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000),
  visibility: z.enum(["private", "public"]),
  bookIds: z
    .array(z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/))
    .max(50)
    .refine(
      (ids) => new Set(ids).size === ids.length,
      "Each book can appear only once.",
    ),
});
export type BookList = {
  id: string;
  userId: string;
  displayName: string;
  title: string;
  description: string;
  visibility: "private" | "public";
  books: Book[];
};
export const postSchema = z.object({
  body: z.string().trim().min(1).max(1200),
  kind: z.enum(["thought", "quote", "review", "progress"]),
  bookId: z.string().max(80).nullable().default(null),
});
export const commentSchema = z.object({
  body: z.string().trim().min(1).max(500),
});
export const publicReviewSchema = z.object({
  body: z.string().trim().min(1).max(1200),
  rating: z.number().int().min(1).max(5),
  containsSpoilers: z.boolean(),
});
export type User = {
  isAdmin?: boolean;
  avatarVersion?: string | null;
  bannerVersion?: string | null;
  id: string;
  username: string;
  displayName: string;
  bio: string;
  goal: number;
};
export type Book = {
  id: string;
  title: string;
  author: string;
  genre: string;
  pages: number | null;
  description: string;
  cover: string | null;
  color: string;
  year: number | null;
};
export type Reading = {
  bookId: string;
  status: ReadingStatus;
  page: number;
  rating: number;
  review: string;
  finishedAt: string | null;
  shelfIds: string[];
  book: Book;
};
export type Shelf = { id: string; name: string; count: number };
export type Recommendation = Book & { reason: string };
export type Post = {
  feedReason?: string;
  isAdmin?: boolean;
  avatarVersion?: string | null;
  id: string;
  body: string;
  kind: string;
  createdAt: string;
  userId: string;
  username: string;
  displayName: string;
  likes: number;
  liked: boolean;
  bookTitle: string | null;
  bookId: string | null;
  rating: number;
  containsSpoilers: boolean;
  editedAt: string | null;
  comments: Comment[];
  commentCount?: number;
  commentsCursor?: string | null;
};
export type BookSummary = { averageRating: number | null; reviewCount: number };
export type Comment = {
  userId?: string;
  id: string;
  body: string;
  displayName: string;
  createdAt: string;
};
export type Reader = {
  reason?: string;
  interactionBlocked?: boolean;
  activityHidden?: boolean;
  isAdmin?: boolean;
  avatarVersion?: string | null;
  bannerVersion?: string | null;
  id: string;
  username: string;
  displayName: string;
  bio: string;
  following: boolean;
};
export type ReaderProfile = {
  reader: Reader;
  followers: number;
  followingCount: number;
  posts: Post[];
};
export type Notification = {
  id: string;
  actorId: string;
  displayName: string;
  kind: "like" | "comment" | "follow";
  postId: string | null;
  createdAt: string;
  readAt: string | null;
};
export type NotificationInbox = {
  items: Notification[];
  unread: number;
  nextCursor: string | null;
};
export type Stats = {
  finished: number;
  reading: number;
  pages: number;
  goal: number;
  following: number;
  followers: number;
};
