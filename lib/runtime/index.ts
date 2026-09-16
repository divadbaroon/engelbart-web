import { e2bRuntime } from "@/lib/runtime/e2b";
import type { Runtime } from "@/lib/runtime/types";

export type { Runtime, Recorder, PrepareOutcome, LaunchOutcome, LaunchOptions, LaunchRecipe } from "@/lib/runtime/types";

// The hosted app runs code in E2B. Swap this to pick a different runtime.
export function getRuntime(): Runtime {
  if (!process.env.E2B_API_KEY) throw new Error("E2B_API_KEY is not set.");
  return e2bRuntime;
}
