export const APPLICATION_STAGES = [
  "DISCOVERED",
  "NORMALIZED",
  "FILTERED",
  "SCORED",
  "SHORTLISTED",
  "MATERIALS_DRAFTED",
  "AWAITING_APPROVAL",
  "SUBMITTED",
  "CHATTING",
  "INTERVIEW_PROPOSED",
  "SCHEDULED",
  "CLOSED",
] as const;

export type ApplicationStage = (typeof APPLICATION_STAGES)[number];

const transitions = {
  DISCOVERED: ["NORMALIZED", "CLOSED"],
  NORMALIZED: ["FILTERED", "CLOSED"],
  FILTERED: ["SCORED", "CLOSED"],
  SCORED: ["SHORTLISTED", "CLOSED"],
  SHORTLISTED: ["MATERIALS_DRAFTED", "CLOSED"],
  MATERIALS_DRAFTED: ["AWAITING_APPROVAL", "CLOSED"],
  AWAITING_APPROVAL: ["MATERIALS_DRAFTED", "SUBMITTED", "CLOSED"],
  SUBMITTED: ["CHATTING", "INTERVIEW_PROPOSED", "CLOSED"],
  CHATTING: ["INTERVIEW_PROPOSED", "CLOSED"],
  INTERVIEW_PROPOSED: ["CHATTING", "SCHEDULED", "CLOSED"],
  SCHEDULED: ["CHATTING", "CLOSED"],
  CLOSED: [],
} as const satisfies Record<ApplicationStage, readonly ApplicationStage[]>;

export function canTransition(
  from: ApplicationStage,
  to: ApplicationStage,
): boolean {
  return (transitions[from] as readonly ApplicationStage[]).includes(to);
}

export function assertTransition(
  from: ApplicationStage,
  to: ApplicationStage,
): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid application transition: ${from} -> ${to}`);
  }
}
