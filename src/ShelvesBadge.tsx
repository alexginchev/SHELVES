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
        <path
          fill="currentColor"
          d="m12 1 3 2 3.6.4 1 3.5 2.4 2.7-1.2 3.4.3 3.6-3.2 1.7-2 3-3.5-.7-3.5.7-2-3-3.2-1.7.3-3.6L.8 9.6l2.4-2.7 1-3.5L9 3Z"
        />
        <path
          d="m7 12 3 3 7-7"
          fill="none"
          stroke="white"
          strokeWidth="2"
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
  return (
    <span className="reader-name">
      {name}
      {verified ? (
        <>
           <ShelvesBadge verified />
        </>
      ) : null}
    </span>
  );
}
