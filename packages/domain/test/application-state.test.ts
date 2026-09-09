import { describe, expect, it } from "vitest";
import { assertTransition, canTransition } from "../src";

describe("application state machine", () => {
  it("allows an authorized application to be submitted", () => {
    expect(canTransition("MATERIALS_DRAFTED", "SUBMITTED")).toBe(true);
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

  it("supports waiting and follow-up without skipping to an interview", () => {
    expect(canTransition("SUBMITTED", "AWAITING_RESPONSE")).toBe(true);
    expect(canTransition("AWAITING_RESPONSE", "FOLLOW_UP_DUE")).toBe(true);
    expect(canTransition("FOLLOW_UP_DUE", "AWAITING_RESPONSE")).toBe(true);
    expect(canTransition("FOLLOW_UP_DUE", "SCHEDULED")).toBe(false);
  });

  it("reaches scheduled only from a confirmed interview proposal", () => {
    expect(canTransition("INTERVIEW_PROPOSED", "SCHEDULED")).toBe(true);
    expect(canTransition("CHATTING", "SCHEDULED")).toBe(false);
    expect(canTransition("SCHEDULED", "CHATTING")).toBe(false);
  });
});
