export type Project = {
  slug: string;
  name: string;
  description: string;
  path: string;
  goals: number;
  chats: number;
};

// Sample data
export const SAMPLE_PROJECTS: Project[] = [
  { slug: "hi", name: "hi", description: "", path: "/Users/divadbaroon/Projects/hi", goals: 1, chats: 0 },
  {
    slug: "label-timeline-viewer",
    name: "label-timeline-viewer",
    description:
      "You'll build a working interface that shows individual student traces—the step-by-step record of what they did—colored by what the automated…",
    path: "/Users/divadbaroon/.claude-vault/workspaces/label-timeline-viewer",
    goals: 4,
    chats: 1,
  },
  { slug: "berkeley-research", name: "berkeley-research", description: "", path: "/Users/divadbaroon/Projects/berkeley-research", goals: 3, chats: 8 },
  { slug: "claude-plugins", name: "claude-plugins", description: "Let two people share one goal tree", path: "/Users/divadbaroon/Projects/claude-plugins", goals: 101, chats: 170 },
  {
    slug: "student-action-inspector",
    name: "student-action-inspector",
    description:
      "A tool that shows you a student's first one or two help questions from a coding problem, lets you label each as hint-style or copy-paste, then tells…",
    path: "/Users/divadbaroon/.claude-vault/workspaces/student-action-inspector",
    goals: 4,
    chats: 1,
  },
  {
    slug: "category-failure-explorer",
    name: "category-failure-explorer",
    description:
      "You'll build an interactive window that loads the 628 benchmark questions and shows you which narrative categories (symbolism, character, plot,…",
    path: "/Users/divadbaroon/.claude-vault/workspaces/category-failure-explorer",
    goals: 4,
    chats: 1,
  },
];

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
