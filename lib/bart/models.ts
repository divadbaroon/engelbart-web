// The models Bart can answer with. One list, read by the panel's picker
// and checked by the route; nothing else names a model. The first is the
// default. Change the list, not the code, to swap models.
export type BartModel = { id: string; label: string };

export const BART_MODELS: BartModel[] = [
  { id: "claude-sonnet-5", label: "Sonnet 5" },
  { id: "claude-opus-5", label: "Opus 5" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
];

export const DEFAULT_BART_MODEL = BART_MODELS[0].id;
export const isBartModel = (id: unknown): id is string => typeof id === "string" && BART_MODELS.some((m) => m.id === id);
export const bartModelLabel = (id: string) => BART_MODELS.find((m) => m.id === id)?.label ?? id;
