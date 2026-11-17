export function BrandMark() {
  return (
    <img
      className="shelves-logo"
      src="/branding/shelves.svg"
      alt="Shelves"
      width="308"
      height="84"
    />
  );
}
export function BrandLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="brand-loading" role="status">
      <img src="/branding/shelves-loading.svg" alt="" width="48" height="48" />
      <span>{label}</span>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <a className="footer-wordmark" href="#home" aria-label="Shelves home">
        <BrandMark />
      </a>
      <span>© {new Date().getFullYear()} Shelves</span>
      <nav aria-label="Site information">
        <a href="#terms">Terms of use</a>
        <a href="#cookies">Cookies</a>
      </nav>
    </footer>
  );
}

export function SiteInformation({ page }: { page: "terms" | "cookies" }) {
  return (
    <article className="view-panel site-information">
      <a className="plain-link" href="#home">
        Back to Home
      </a>
      <h2>{page === "terms" ? "Terms of use" : "Cookies on Shelves"}</h2>
      {page === "terms" ? (
        <>
          <p>
            Shelves is a place to keep track of your reading, discover books and
            share recommendations. Please use it with care for the people and
            stories you find here.
          </p>
          <h3>Your account</h3>
          <p>
            Keep your sign-in details secure. You are responsible for what you
            publish through your account. Do not impersonate another person or
            try to access someone else’s account.
          </p>
          <h3>What you share</h3>
          <p>
            Only post content you have the right to share. Credit other people’s
            words, avoid posting substantial copyrighted passages, and mark
            reviews that contain spoilers. Do not publish another person’s
            private information.
          </p>
          <h3>Respect other readers</h3>
          <p>
            Disagreement about a book is welcome. Harassment, threats, hateful
            content, spam and deceptive activity are not. Do not misuse the
            service or attempt to disrupt its operation.
          </p>
          <h3>Public and private spaces</h3>
          <p>
            Posts, public reviews and comments are shared with other readers.
            Your reading notes, private ratings and personal shelves stay
            private. Book lists are private unless you choose to publish them.
          </p>
          <h3>Community moderation</h3>
          <p>
            You can report inappropriate content and mute or block readers.
            Shelves administrators can remove reported content or suspend
            accounts that misuse the community.
          </p>
          <h3>Managing your data</h3>
          <p>
            You can edit or remove your own posts and reviews, manage your
            lists, and delete your account in Account settings. Book information
            comes from external catalogues and may be incomplete or inaccurate.
          </p>
        </>
      ) : (
        <>
          <p>
            Shelves uses a sign-in cookie to remember your account between
            visits. It is used for authentication, not advertising.
          </p>
          <h3>The sign-in cookie</h3>
          <dl className="cookie-facts">
            <dt>Name</dt>
            <dd>shelves_session</dd>
            <dt>Purpose</dt>
            <dd>Keeps you signed in and connects requests to your account.</dd>
            <dt>Duration</dt>
            <dd>Up to seven days after sign-in. Signing out clears it.</dd>
            <dt>Contents</dt>
            <dd>
              A random session token. It does not contain your password or
              reading notes.
            </dd>
          </dl>
          <h3>Your choices</h3>
          <p>
            You can browse public pages without signing in. You can also delete
            or block cookies through your browser settings. Blocking the sign-in
            cookie prevents account features from working.
          </p>
          <h3>External content</h3>
          <p>
            Some book covers and fonts load from external providers. Your
            browser contacts those providers when it loads their content.
            Starter-book covers are served directly by Shelves.
          </p>
          <h3>Advertising and analytics</h3>
          <p>
            This version of Shelves does not set advertising or analytics
            cookies. If that changes, the cookie information and relevant
            choices will be updated.
          </p>
        </>
      )}
    </article>
  );
}
