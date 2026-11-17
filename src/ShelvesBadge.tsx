export function ShelvesBadge({ verified }: { verified?: boolean }) {
  if (!verified) return null;
  return (
    <span
      className="shelves-badge"
      role="img"
      aria-label="Verified Shelves administrator"
      title="Verified Shelves administrator"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="currentColor" />
        <path
          d="m7.5 12 3 3 6-6"
          fill="none"
          stroke="white"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
export function ReaderName({
  name,
  verified,
}: {
  name: string;
  verified?: boolean;
}) {
  const split = name.lastIndexOf(" ");
  return (
    <span className="reader-name">
      {verified ? (
        <>
          {split >= 0 ? name.slice(0, split + 1) : ""}
          <span className="reader-name-tail">
            {name.slice(split + 1)}
            <ShelvesBadge verified />
          </span>
        </>
      ) : (
        name
      )}
    </span>
  );
}
