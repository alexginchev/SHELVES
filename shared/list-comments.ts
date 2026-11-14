export type ListComment = {
  id: string;
  userId: string;
  displayName: string;
  body: string;
  createdAt: string;
};
export type ListConversation = {
  items: ListComment[];
  page: number;
  pages: number;
  total: number;
};
