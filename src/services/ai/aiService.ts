/**
 * SERVICEGRID AI service — the ONLY bridge between UI and AI providers.
 *
 *   AI UI  →  aiService.ts  →  MockAIProvider (today)
 *   AI UI  →  aiService.ts  →  RealAIProvider → API (tomorrow)
 *
 * To connect a real API later: implement the AIProvider interface in a new
 * `aiRealProvider.ts`, set VITE_AI_PROVIDER to its id, and point ACTIVE at it.
 * No UI component changes required. No secret may ever live in frontend code —
 * route real calls through a backend endpoint and keep keys server-side.
 *
 * Configuration (all optional — the app works fully offline on defaults):
 *   VITE_AI_ENABLED=false   → hides every AI surface; app runs as before
 *   VITE_AI_PROVIDER=mock   → active provider id (only "mock" exists today)
 *   VITE_AI_API_URL=        → reserved placeholder for the future provider
 */
import type { AIProvider } from "./aiTypes";
import { MockAIProvider } from "./aiMockProvider";

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

export const AI_ENABLED: boolean = (env.VITE_AI_ENABLED ?? "true") !== "false";
export const AI_PROVIDER_ID: string = env.VITE_AI_PROVIDER ?? "mock";
export const AI_API_URL: string = env.VITE_AI_API_URL ?? "";

const PROVIDERS: Record<string, AIProvider> = {
  mock: MockAIProvider,
};

function active(): AIProvider {
  return PROVIDERS[AI_PROVIDER_ID] ?? MockAIProvider;
}

/** Provider id currently in use (always "mock" until a real provider ships). */
export function aiProviderId(): string {
  return active().id;
}

/** Staged progress UX: emits each message with a local mock delay. */
export async function runAiStages(
  onStage: (msg: string) => void,
  stages: string[] = ["Analyzing equipment data…", "Reviewing service history…", "Generating recommendation…"],
  stepMs = 450,
): Promise<void> {
  for (const s of stages) {
    onStage(s);
    await new Promise((r) => setTimeout(r, stepMs));
  }
}

export const diagnoseFault: AIProvider["diagnose"] = (input) => active().diagnose(input);
export const recommendTechnician: AIProvider["recommend"] = (input) => active().recommend(input);
export const predictMaintenance: AIProvider["predict"] = (input) => active().predict(input);
export const generateServiceSummary: AIProvider["summarize"] = (input) => active().summarize(input);
