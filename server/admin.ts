// Only server configuration can designate administrators; never accept this from a profile form.
export function isAdmin(id: string): boolean {
  return (process.env.SHELVES_ADMIN_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(id);
}
