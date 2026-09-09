import type { ActionPlanStatus } from "./types";

const transitions = {
  DRAFT: ["AWAITING_APPROVAL", "AUTHORIZED", "EXPIRED", "CANCELLED"],
  AWAITING_APPROVAL: ["AUTHORIZED", "EXPIRED", "CANCELLED"],
  AUTHORIZED: ["EXECUTING", "EXPIRED", "CANCELLED"],
  EXECUTING: ["SUCCEEDED", "FAILED", "CANCELLED"],
  SUCCEEDED: [],
  FAILED: [],
  EXPIRED: [],
  CANCELLED: [],
} as const satisfies Record<ActionPlanStatus, readonly ActionPlanStatus[]>;

export function canTransitionActionPlan(
  from: ActionPlanStatus,
  to: ActionPlanStatus,
): boolean {
  return (transitions[from] as readonly ActionPlanStatus[]).includes(to);
}

export function assertActionPlanTransition(
  from: ActionPlanStatus,
  to: ActionPlanStatus,
): void {
  if (!canTransitionActionPlan(from, to)) {
    throw new Error(`Invalid action plan transition: ${from} -> ${to}`);
  }
}
