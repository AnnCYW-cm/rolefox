import { describe, expect, it } from "vitest";
import { assertTransition, canTransition } from "../src";

describe("application state machine", () => {
  it("allows a reviewed application to be submitted", () => {
    expect(canTransition("AWAITING_APPROVAL", "SUBMITTED")).toBe(true);
  });

  it("does not allow a discovered job to skip directly to submission", () => {
    expect(canTransition("DISCOVERED", "SUBMITTED")).toBe(false);
    expect(() => assertTransition("DISCOVERED", "SUBMITTED")).toThrow(
      "Invalid application transition",
    );
  });

  it("allows any active funnel item to be closed intentionally", () => {
    expect(canTransition("SCORED", "CLOSED")).toBe(true);
    expect(canTransition("CHATTING", "CLOSED")).toBe(true);
  });
});
