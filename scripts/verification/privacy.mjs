import { invariant } from "./lib.mjs";

const DEFAULT_FORBIDDEN_KEY_TERMS = [
  "access_token",
  "calendar_content",
  "credential",
  "direct_external_id",
  "email",
  "full_name",
  "identity_mapping",
  "jd_text",
  "job_description",
  "message_text",
  "name",
  "password",
  "phone",
  "raw_data",
  "raw_interview",
  "recording",
  "refresh_token",
  "resume_text",
  "secret",
  "transcript",
];

export function normalizePublicKey(key) {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

export function publicKeyIsForbidden(key, additionalTerms = []) {
  const normalized = normalizePublicKey(key);
  const terms = [...DEFAULT_FORBIDDEN_KEY_TERMS, ...additionalTerms].map(
    normalizePublicKey,
  );
  return terms.some(
    (term) =>
      normalized === term ||
      normalized.startsWith(`${term}_`) ||
      normalized.endsWith(`_${term}`) ||
      normalized.includes(`_${term}_`),
  );
}

export function assertNoSensitivePublicData(
  value,
  label,
  additionalForbiddenTerms = [],
  seen = new Set(),
) {
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    invariant(
      !/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu.test(value),
      `${label} contains an email-like value.`,
    );
    invariant(
      !/-----BEGIN [^-]*(?:PRIVATE KEY|CERTIFICATE)-----/u.test(value),
      `${label} contains credential material.`,
    );
    invariant(
      !/\b(?:bearer\s+|sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{16,})/iu.test(
        value,
      ),
      `${label} contains token-like material.`,
    );
    return;
  }
  if (typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertNoSensitivePublicData(
        entry,
        `${label}[${index}]`,
        additionalForbiddenTerms,
        seen,
      ),
    );
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    invariant(
      !publicKeyIsForbidden(key, additionalForbiddenTerms),
      `${label} contains forbidden public field ${key}.`,
    );
    assertNoSensitivePublicData(
      entry,
      `${label}.${key}`,
      additionalForbiddenTerms,
      seen,
    );
  }
}
