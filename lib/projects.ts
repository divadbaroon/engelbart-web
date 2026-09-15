// A project as the workspace shows it. Rows come from hc_projects, the table
// the existing Engelbart CLI syncs to; the counts are its top-level goals and
// its chats. Kept free of React and of Supabase so the desktop app can share it.
export type Project = {
  id: string;
  name: string;
  description: string;
  path: string;
  goals: number;
  chats: number;
  updatedAt: string | null;
};

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
