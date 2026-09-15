export type Paper = { id: string; name: string; meta: string; isNew?: boolean };

// Sample data
export const SAMPLE_PAPERS: Paper[] = [
  { id: "p1", name: "Augmenting Human Intellect: A Conceptual Framework", meta: "Engelbart · 1962" },
  { id: "p2", name: "Attention Is All You Need", meta: "Vaswani et al. · 2017" },
  { id: "p3", name: "ReAct: Synergizing Reasoning and Acting in Language Models", meta: "Yao et al. · 2022" },
];

export const paperTabValue = (id: string) => `paper:${id}`;
export const isPaperTab = (tab: string) => tab.startsWith("paper:");
