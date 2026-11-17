import type { Book } from "../shared/types.ts";
export const seedBooks: Book[] = [
  {
    id: "seed-garden",
    title: "The Secret Garden",
    author: "Frances Hodgson Burnett",
    genre: "Classic",
    pages: 288,
    description:
      "A lonely girl discovers a hidden garden and the friendships that bring it back to life.",
    cover: "/covers/garden.jpg",
    color: "sage",
    year: 1911,
  },
  {
    id: "seed-creatures",
    title: "Remarkably Bright Creatures",
    author: "Shelby Van Pelt",
    genre: "Fiction",
    pages: 368,
    description:
      "A widow, a young man, and a perceptive octopus find unexpected connections in a coastal town.",
    cover: "/covers/creatures.jpg",
    color: "mist",
    year: 2022,
  },
  {
    id: "seed-overstory",
    title: "The Overstory",
    author: "Richard Powers",
    genre: "Literary",
    pages: 512,
    description:
      "Interwoven lives reveal the extraordinary world of trees and the people moved to protect it.",
    cover: "/covers/overstory.jpg",
    color: "sage",
    year: 2018,
  },
  {
    id: "seed-sweetgrass",
    title: "Braiding Sweetgrass",
    author: "Robin Wall Kimmerer",
    genre: "Nature",
    pages: 408,
    description:
      "A botanist brings Indigenous knowledge and scientific observation together in reflections on the living world.",
    cover: "/covers/sweetgrass.jpg",
    color: "lavender",
    year: 2013,
  },
  {
    id: "seed-smallthings",
    title: "Small Things Like These",
    author: "Claire Keegan",
    genre: "Literary",
    pages: 128,
    description:
      "A coal merchant in a small Irish town faces a choice between silence and compassion.",
    cover: "/covers/smallthings.jpg",
    color: "coral",
    year: 2021,
  },
  {
    id: "seed-piranesi",
    title: "Piranesi",
    author: "Susanna Clarke",
    genre: "Fantasy",
    pages: 272,
    description:
      "In a house of endless halls, a solitary explorer begins to question everything he knows.",
    cover: "/covers/piranesi.jpg",
    color: "mist",
    year: 2020,
  },
];
