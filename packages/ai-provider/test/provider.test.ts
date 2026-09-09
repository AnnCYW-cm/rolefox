import { describe, expect, it } from "vitest";
import type { AIProvider } from "../src";
import {
  assertAIProviderCapability,
  validateStructuredGenerationResult,
} from "../src";

const manifest = {
  id: "fake-ai",
  name: "Fake AI",
  version: "0.1.0",
  capabilities: ["embedding"] as const,
  models: ["fake-model"],
  supportsCustomBaseUrl: false,
};

describe("AI provider contract", () => {
  it("rejects a declared capability without an implementation", () => {
    const provider: AIProvider = {
      manifest: { ...manifest, capabilities: [...manifest.capabilities] },
      probe: async () => ({ available: true }),
    };

    expect(() => assertAIProviderCapability(provider, "embedding")).toThrow(
      /does not implement/,
    );
  });

  it("narrows a provider only when the implementation exists", async () => {
    const provider: AIProvider = {
      manifest: { ...manifest, capabilities: [...manifest.capabilities] },
      probe: async () => ({ available: true }),
      embed: async () => ({
        vectors: [[0.1, 0.2]],
        providerId: "fake-ai",
        model: "fake-model",
      }),
    };

    assertAIProviderCapability(provider, "embedding");
    await expect(
      provider.embed({
        context: {
          workspaceId: "workspace_demo",
          taskId: "task_demo",
          taskType: "embedding",
          schemaVersion: 1,
        },
        inputs: ["synthetic text"],
      }),
    ).resolves.toMatchObject({ providerId: "fake-ai" });
  });

  it("requires callers to parse unknown structured output", () => {
    const validated = validateStructuredGenerationResult(
      { data: { score: 92 }, providerId: "fake-ai", model: "fake-model" },
      (value) => {
        if (
          typeof value !== "object" ||
          value === null ||
          !("score" in value) ||
          typeof value.score !== "number"
        ) {
          throw new Error("invalid score result");
        }
        return { score: value.score };
      },
    );

    expect(validated.data.score).toBe(92);
  });
});
