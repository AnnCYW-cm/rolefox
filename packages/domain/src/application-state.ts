export const APPLICATION_STAGES = [
  "DISCOVERED",
  "NORMALIZED",
  "FILTERED",
  "SCORED",
  "SHORTLISTED",
  "MATERIALS_DRAFTED",
  "SUBMITTED",
  "AWAITING_RESPONSE",
  "FOLLOW_UP_DUE",
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
  MATERIALS_DRAFTED: ["SUBMITTED", "CLOSED"],
  SUBMITTED: ["AWAITING_RESPONSE", "CHATTING", "INTERVIEW_PROPOSED", "CLOSED"],
  AWAITING_RESPONSE: [
    "FOLLOW_UP_DUE",
    "CHATTING",
    "INTERVIEW_PROPOSED",
    "CLOSED",
  ],
  FOLLOW_UP_DUE: [
    "AWAITING_RESPONSE",
    "CHATTING",
    "INTERVIEW_PROPOSED",
    "CLOSED",
  ],
  CHATTING: ["AWAITING_RESPONSE", "INTERVIEW_PROPOSED", "CLOSED"],
  INTERVIEW_PROPOSED: ["CHATTING", "SCHEDULED", "CLOSED"],
  SCHEDULED: ["CLOSED"],
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
