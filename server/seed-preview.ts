// Optional local preview content. Never called at startup or during deployment.
import { randomUUID } from "node:crypto";
import { resolve, relative, isAbsolute } from "node:path";
import { openDatabase } from "./db.ts";
import { sqliteStore } from "./store.ts";
import { hashPassword } from "./auth.ts";

if (
  process.env.NODE_ENV === "production" ||
  (process.env.DATABASE_ENGINE || "sqlite") !== "sqlite"
)
  throw new Error("Preview seeding is restricted to a local SQLite database.");
const file = resolve(process.env.DATABASE_PATH || "./data/shelves-preview.db");
const path = relative(resolve("."), file);
if (path.startsWith("..") || isAbsolute(path))
  throw new Error("Preview database must be inside this workspace.");
const db = sqliteStore(openDatabase(file));
const readers = [
  [
    "mira",
    "Mira Ellis",
    "mira_pages",
    "Short novels, long walks. Usually reading two books and finishing one.",
  ],
  [
    "leo",
    "Leo Moreno",
    "leo_margins",
    "Fantasy, strange houses, and maps at the front of books.",
  ],
  [
    "nina",
    "Nina Park",
    "nina_afterhours",
    "A chapter on the train. Another one when I get home.",
  ],
  [
    "sam",
    "Sam Rivers",
    "sam_fieldnotes",
    "Nature writing and stories that change how I look at ordinary things.",
  ],
  [
    "ada",
    "Ada Brooks",
    "ada_rereads",
    "Rereading childhood favorites with a pencil nearby.",
  ],
  [
    "eli",
    "Eli Laurent",
    "eli_bookmarks",
    "Quiet fiction. Library holds. An ambitious bedside stack.",
  ],
];
const posts = [
  [
    "mira",
    "seed-smallthings",
    "review",
    5,
    "Small Things Like These does so much with so little. The quiet decisions stayed with me longer than the big moments. A good book to read in one sitting, then leave alone for a day.",
  ],
  [
    "leo",
    "seed-piranesi",
    "review",
    5,
    "I kept wanting to draw a map of the House, then realized that getting lost was part of the pleasure. Piranesi is one of those books I wish I could meet for the first time again.",
  ],
  [
    "sam",
    "seed-sweetgrass",
    "thought",
    0,
    "Reading Braiding Sweetgrass slowly, one essay at a time. Has anyone else found themselves noticing plants on their usual walk after reading it?",
  ],
  [
    "nina",
    "seed-creatures",
    "review",
    4,
    "Came for the octopus, stayed for the people. The small acts of kindness are what make this one work for me.",
  ],
  [
    "ada",
    "seed-garden",
    "thought",
    0,
    "The Secret Garden feels different on a reread. I remembered the garden; I had forgotten how much the story cares about learning to pay attention.",
  ],
  [
    "eli",
    null,
    "thought",
    0,
    "What is the shortest book that has stayed with you the longest? Looking for something I can finish this weekend without rushing.",
  ],
  [
    "sam",
    "seed-overstory",
    "review",
    4,
    "The Overstory made the trees outside my window feel less like scenery. I liked the separate lives at the beginning most, before the paths started crossing.",
  ],
  [
    "mira",
    null,
    "thought",
    0,
    "A small reading ritual: phone in the other room, tea beside me, twenty pages before anything else. More reliable than waiting for a whole free afternoon.",
  ],
] as const;
try {
  const password = await hashPassword(randomUUID() + randomUUID());
  await db.transaction(async (tx) => {
    for (const [id, name, username, bio] of readers)
      await tx.run(
        "INSERT INTO users(id,email,username,display_name,password_hash,bio) VALUES(?,?,?,?,?,?) ON CONFLICT DO NOTHING",
        `preview-${id}`,
        `${id}@shelves-preview.invalid`,
        username,
        name,
        password,
        bio,
      );
    for (const [i, [author, book, kind, rating, body]] of posts.entries()) {
      // Fail atomically if a catalogue identifier changed; never create orphan posts.
      if (book && !(await tx.get("SELECT id FROM books WHERE id=?", book)))
        throw new Error(`Missing preview book: ${book}`);
      await tx.run(
        "INSERT INTO posts(id,user_id,book_id,body,kind,rating,contains_spoilers,created_at) VALUES(?,?,?,?,?,?,0,?) ON CONFLICT DO NOTHING",
        `preview-post-${i}`,
        `preview-${author}`,
        book,
        body,
        kind,
        rating,
        new Date(Date.now() - (i + 1) * 3600000).toISOString(),
      );
    }
    for (const [i, body] of [
      "I started taking a different route home just to walk past the old beech trees.",
      "Claire Keegan would be my pick. So much space between the sentences.",
    ].entries())
      await tx.run(
        "INSERT INTO comments(id,user_id,post_id,body) VALUES(?,?,?,?) ON CONFLICT DO NOTHING",
        `preview-comment-${i}`,
        `preview-${i ? "mira" : "ada"}`,
        `preview-post-${i ? 5 : 2}`,
        body,
      );
  });
  console.log("Local preview readers and conversations are ready.");
} finally {
  await db.close();
}
