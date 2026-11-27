import { useState } from "react";
import { Icon } from "./components";

export function RatingStars({ rating }: { rating: number }) {
  return (
    <span
      className="rating-stars"
      role="img"
      aria-label={`${rating} out of 5 stars`}
    >
      {Array.from({ length: 5 }, (_, index) => (
        <span className={index < rating ? "filled" : ""} key={index}>
          <Icon name="star" />
        </span>
      ))}
    </span>
  );
}

export function StarRatingInput({
  initial = 0,
  label = "Your rating",
  allowNone = true,
}: {
  initial?: number;
  label?: string;
  allowNone?: boolean;
}) {
  const [rating, setRating] = useState(initial);
  return (
    <fieldset className="star-rating-input">
      <legend>{label}</legend>
      <div className="star-rating-options">
        {allowNone ? (
          <label className="star-rating-none">
            <input
              type="radio"
              name="rating"
              value="0"
              checked={rating === 0}
              onChange={() => setRating(0)}
            />
            No rating
          </label>
        ) : null}
        {[1, 2, 3, 4, 5].map((number) => (
          <label
            key={number}
            className={number <= rating ? "filled" : ""}
            title={`${number} ${number === 1 ? "star" : "stars"}`}
          >
            <input
              type="radio"
              name="rating"
              value={number}
              checked={rating === number}
              onChange={() => setRating(number)}
              aria-label={`${number} ${number === 1 ? "star" : "stars"}`}
            />
            <Icon name="star" />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
