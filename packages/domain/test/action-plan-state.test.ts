import { describe, expect, it } from "vitest";
import {
  assertActionPlanTransition,
  canTransitionActionPlan,
} from "../src";

describe("action plan state machine", () => {
  it("supports direct policy authorization", () => {
    expect(canTransitionActionPlan("DRAFT", "AUTHORIZED")).toBe(true);
  });

  it("supports human approval when policy requires it", () => {
    expect(canTransitionActionPlan("DRAFT", "AWAITING_APPROVAL")).toBe(true);
    expect(canTransitionActionPlan("AWAITING_APPROVAL", "AUTHORIZED")).toBe(
      true,
    );
  });

  it("does not execute an unauthorised draft", () => {
    expect(canTransitionActionPlan("DRAFT", "EXECUTING")).toBe(false);
    expect(() =>
      assertActionPlanTransition("DRAFT", "EXECUTING"),
    ).toThrow("Invalid action plan transition");
  });

  it("keeps terminal outcomes terminal", () => {
    expect(canTransitionActionPlan("SUCCEEDED", "EXECUTING")).toBe(false);
    expect(canTransitionActionPlan("FAILED", "AUTHORIZED")).toBe(false);
  });
});
