import type { Book, Reader, Recommendation } from "../shared/types";
import { Avatar, Cover, Icon } from "./components";
import { ExploreShelf } from "./LibraryShelves";
import { ReaderName } from "./ShelvesBadge";

export function HomeFeedDiscovery({
  recommendations,
  readers,
  savedIds,
  genre,
  onBook,
  onPost,
}: {
  recommendations: Recommendation[];
  readers: Reader[];
  savedIds: string[];
  genre: string;
  onBook: (book: Book) => void;
  onPost: () => void;
}) {
  const nextPicks = recommendations.slice(3, 7);
  return (
    <div className="home-discovery" aria-label="More to explore">
      <div className="home-discovery-heading">
        <div>
          <h2>A little further into the story</h2>
          <p>Books and readers to explore between conversations.</p>
        </div>
        <button
          type="button"
          className="home-discovery-post"
          onClick={onPost}
          aria-label="Share a thought"
          title="Share a thought"
        >
          <Icon name="journal" /> Share a thought
        </button>
      </div>
      {nextPicks.length ? (
        <section
          className="home-discovery-picks"
          aria-label="Books picked for you"
        >
          <div className="home-discovery-section-heading">
            <h3>Picked for your next chapter</h3>
            <a href="#discover">
              See all picks <Icon name="arrowUpRight" />
            </a>
          </div>
          <div className="home-discovery-book-track">
            {nextPicks.map((book) => (
              <a
                key={book.id}
                href={`#book/${book.id}`}
                className="home-discovery-book"
                aria-label={`Open ${book.title}`}
                onClick={(event) => {
                  if (
                    event.button !== 0 ||
                    event.ctrlKey ||
                    event.metaKey ||
                    event.shiftKey ||
                    event.altKey
                  )
                    return;
                  event.preventDefault();
                  onBook(book);
                }}
              >
                <Cover book={book} />
                <span className="home-discovery-book-info">
                  <strong>{book.title}</strong>
                  <small>{book.author}</small>
                  <em>{book.reason}</em>
                </span>
              </a>
            ))}
          </div>
        </section>
      ) : null}
      <ExploreShelf
        title="Across the wider catalogue"
        genre={genre}
        savedIds={[...savedIds, ...nextPicks.map((book) => book.id)]}
        fallback={recommendations.slice(0, 8)}
        onBook={onBook}
      />
      {readers.length ? (
        <section
          className="home-discovery-readers"
          aria-label="Readers to meet"
        >
          <div className="home-discovery-section-heading">
            <h3>Readers to meet</h3>
            <a href="#readers">
              Find more readers <Icon name="arrowUpRight" />
            </a>
          </div>
          <div className="home-discovery-reader-track">
            {readers.slice(0, 3).map((reader) => (
              <a
                href={`#reader/${reader.id}`}
                key={reader.id}
                className="home-discovery-reader"
              >
                <Avatar
                  name={reader.displayName}
                  src={
                    reader.avatarVersion
                      ? `/api/readers/${reader.id}/images/avatar?v=${reader.avatarVersion}`
                      : undefined
                  }
                />
                <span>
                  <strong>
                    <ReaderName
                      name={reader.displayName}
                      verified={reader.isAdmin}
                    />
                  </strong>
                  <small>@{reader.username}</small>
                  <em>
                    {reader.reason ||
                      reader.bio ||
                      "Explore their reading corner"}
                  </em>
                </span>
                <Icon name="arrowUpRight" />
              </a>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
