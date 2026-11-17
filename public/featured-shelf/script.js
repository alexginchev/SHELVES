document.addEventListener("DOMContentLoaded", function () {
  // Theme toggle functionality
  const themeToggle = document.getElementById("theme-toggle");
  const body = document.body;

  // Check for saved theme preference or use preferred color scheme
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "dark") {
    body.classList.add("dark-mode");
  } else if (savedTheme === "light") {
    body.classList.remove("dark-mode");
  } else {
    // If no saved preference, check system preference
    if (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    ) {
      body.classList.add("dark-mode");
    }
  }

  // Toggle theme when the button is clicked
  themeToggle.addEventListener("click", () => {
    body.classList.toggle("dark-mode");

    // Save preference to localStorage
    if (body.classList.contains("dark-mode")) {
      localStorage.setItem("theme", "dark");
    } else {
      localStorage.setItem("theme", "light");
    }
  });

  // Get the overlay elements
  const overlay = document.querySelector(".book-title-overlay");
  const overlayText = document.querySelector(".book-title-text");

  // Track the currently active book
  let activeBookIndex = 2; // Start with the last book (index 2)
  let activeBookTimeline = null;

  // Apply hover animations to each book item
  const books = document.querySelectorAll(".books__item");
  const bookTimelines = [];

  books.forEach((book, index) => {
    const hitbox = book.querySelector(".books__hitbox");
    const bookImage = book.querySelector(".books__image");
    const bookEffect = book.querySelector(".books__effect");
    const pages = book.querySelectorAll(".books__page");
    const bookLight = book.querySelector(".books__light");
    const bookTitle = hitbox.getAttribute("data-book-title");
    const bookIndex = hitbox.getAttribute("data-book-index");

    // Get the corresponding shadow (accounting for the side book)
    let shadowIndex = index;
    if (index >= 1) shadowIndex += 1; // Skip the side book's shadow index
    const bookShadow = document.querySelectorAll(".book-shadow__item")[
      shadowIndex
    ];

    // Set initial state for cover image and light effect
    gsap.set(bookImage, {
      boxShadow:
        "var(--book-shadow) 10px 5px 20px, var(--book-shadow) 20px 0px 30px"
    });

    gsap.set(bookLight, {
      opacity: 0.1
    });

    // Set initial state for pages - all stacked at 0
    gsap.set(pages, {
      x: 0
    });

    // Create hover animation timeline (paused by default)
    const hoverIn = gsap.timeline({
      paused: true,
      defaults: {
        duration: 0.7,
        ease: "power2.out"
      }
    });

    // Add the book cover animation - MODIFIED to avoid perspective issues
    hoverIn.to(
      bookImage,
      {
        translateX: -10,
        scaleX: 0.96,
        boxShadow:
          "var(--book-shadow-strong) 20px 5px 20px, var(--book-shadow) 30px 0px 30px"
      },
      0
    );

    // Add the book shadow animation
    hoverIn.to(
      bookShadow,
      {
        width: 130,
        opacity: 0.8
      },
      0
    );

    // Add the book effect animation
    hoverIn.to(
      bookEffect,
      {
        marginLeft: 10
      },
      0
    );

    // Add the light effect animation - MODIFIED to avoid perspective issues
    hoverIn.to(
      bookLight,
      {
        opacity: 0.2
      },
      0
    );

    // Add the page animations to the same timeline
    if (pages.length) {
      hoverIn.to(
        pages[0],
        {
          x: "2px",
          ease: "power1.inOut"
        },
        0
      );

      hoverIn.to(
        pages[1],
        {
          x: "0px",
          ease: "power1.inOut"
        },
        0
      );

      hoverIn.to(
        pages[2],
        {
          x: "-2px",
          ease: "power1.inOut"
        },
        0
      );
    }

    // Store the timeline for later use
    bookTimelines[index] = hoverIn;

    // Hover triggers
    hitbox.addEventListener("mouseenter", () => {
      // If there's an active book and it's not this one, close it
      if (
        activeBookIndex !== null &&
        activeBookIndex !== index &&
        activeBookTimeline
      ) {
        activeBookTimeline.reverse();
      }

      // Set this book as active
      activeBookIndex = index;
      activeBookTimeline = hoverIn;

      // Play this book's animation
      hoverIn.play();

      // Show the book title in the overlay
      overlayText.textContent = bookTitle;
      gsap.to(overlay, {
        opacity: 1,
        duration: 0.3
      });

      // Update the description
      updateDescription(bookIndex);
    });
  });

  // Side book animation
  const sideBook = document.querySelector(".side-book");
  const sideBookShadow = document.querySelector(".book-shadow__item.side");
  const sideBookTitle = sideBook.getAttribute("data-book-title");

  // Create hover animation timeline for side book
  const sideHoverIn = gsap.timeline({
    paused: true,
    defaults: {
      duration: 0.5,
      ease: "power2.out"
    }
  });

  sideHoverIn.to(
    sideBook,
    {
      y: -5,
      boxShadow:
        "var(--book-shadow) 8px -5px 15px, var(--book-shadow) 15px 0px 20px"
    },
    0
  );

  sideHoverIn.to(
    sideBookShadow,
    {
      width: 35,
      opacity: 0.8
    },
    0
  );

  // Hover triggers for side book
  sideBook.addEventListener("mouseenter", () => {
    // If there's an active book, close it
    if (activeBookIndex !== null && activeBookTimeline) {
      activeBookTimeline.reverse();
    }

    // Set side book as active (using a special index)
    activeBookIndex = "side";
    activeBookTimeline = sideHoverIn;

    // Play side book animation
    sideHoverIn.play();

    // Show the book title in the overlay
    overlayText.textContent = sideBookTitle;
    gsap.to(overlay, {
      opacity: 1,
      duration: 0.3
    });

    // Update the description
    updateDescription("side");
  });

  // Set the default open book (last book)
  const defaultBook = books[2];
  const defaultBookTitle = defaultBook
    .querySelector(".books__hitbox")
    .getAttribute("data-book-title");

  // Set the default book as active
  activeBookIndex = 2;
  activeBookTimeline = bookTimelines[2];

  // Play the default book's animation
  bookTimelines[2].play();

  // Show the default book title
  overlayText.textContent = defaultBookTitle;
  gsap.to(overlay, {
    opacity: 1,
    duration: 0.3
  });

  // Handle mouse leaving the entire shelf area
  document
    .querySelector(".shelf-container")
    .addEventListener("mouseleave", () => {
      // Return to the default book when mouse leaves the shelf area

      // If the active book is not the default book, close it
      if (activeBookIndex !== 2 && activeBookTimeline) {
        activeBookTimeline.reverse();
      }

      // Set the default book as active again
      activeBookIndex = 2;
      activeBookTimeline = bookTimelines[2];

      // Play the default book's animation
      bookTimelines[2].play();

      // Show the default book title in the overlay
      overlayText.textContent = defaultBookTitle;
      gsap.to(overlay, {
        opacity: 1,
        duration: 0.3
      });

      // Update the description to show the default book's description
      updateDescription("2");
    });

  // Initialize Split Type for all descriptions
  const descriptions = document.querySelectorAll(".book-description");

  // Process each description
  descriptions.forEach((desc) => {
    const bookIndex = desc.getAttribute("data-book-index");

    // Create Split Type instances for title, author, and paragraph
    const titleElement = desc.querySelector("h3");
    const authorElement = desc.querySelector(".author");
    const textElement = desc.querySelector(".lines-animation p");

    // Split text into lines
    if (window.SplitType) {
      try {
        new SplitType(titleElement, {
          types: "lines",
          lineClass: "line"
        });

        new SplitType(authorElement, {
          types: "lines",
          lineClass: "line"
        });

        new SplitType(textElement, {
          types: "lines",
          lineClass: "line"
        });

        // Add inner wrapper to each line for animation
        desc.querySelectorAll(".line").forEach((line) => {
          const content = line.innerHTML;
          line.innerHTML = `<span class="line-inner">${content}</span>`;
        });
      } catch (e) {
        console.error("Error with SplitType:", e);
      }
    }

    // Make all text visible by default
    if (bookIndex !== "2") {
      // Hide non-active descriptions
      gsap.set(desc.querySelectorAll(".line-inner"), {
        yPercent: 100,
        opacity: 0
      });
    } else {
      // Make default book text visible
      gsap.set(desc.querySelectorAll(".line-inner"), {
        yPercent: 0,
        opacity: 1
      });
    }
  });

  // Function to update the description
  function updateDescription(bookIndex) {
    // Hide all descriptions first
    descriptions.forEach((desc) => {
      const descIndex = desc.getAttribute("data-book-index");

      // If this is not the active description and it's currently visible
      if (descIndex !== bookIndex && desc.classList.contains("active")) {
        // Hide this description
        desc.classList.remove("active");

        // Animate out the text
        gsap.to(desc.querySelectorAll(".line-inner"), {
          yPercent: 100,
          opacity: 0,
          duration: 0.4,
          ease: "power1.in",
          stagger: 0.03
        });
      }
    });

    // Show the selected description
    const activeDescription = document.querySelector(
      `.book-description[data-book-index="${bookIndex}"]`
    );
    if (activeDescription) {
      activeDescription.classList.add("active");

      // Animate in the text
      gsap.fromTo(
        activeDescription.querySelectorAll(".line-inner"),
        { yPercent: 100, opacity: 0 },
        {
          yPercent: 0,
          opacity: 1,
          duration: 0.7,
          stagger: 0.08,
          ease: "power1.out"
        }
      );
    }
  }

  // Initialize the default book's text animation
  updateDescription("2");
});