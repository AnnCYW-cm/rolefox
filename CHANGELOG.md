# Changelog

All notable public changes to RoleFox are recorded here. Release status refers only to the scope stated for that release; it does not imply that the later Autopilot design has been implemented or that a research Gate has passed.

## Unreleased

## [0.1.0-alpha.1](releases/v0.1.0-alpha.1.md) - 2026-09-13

First public open-source Alpha: a browser-local tool for testing whether explicit rules make job triage more useful and explainable.

### Added

- Added target-role, target-location, preferred-keyword, and hard-exclusion rules.
- Added manual job entry, validated batch paste, built-in synthetic examples, deterministic scoring, inspectable reasons and concerns, and interested / not-interested calibration.
- Added versioned browser-local persistence, validated full JSON backup and restore, anonymous aggregate export, per-job deletion, and confirmed full clearing.
- Added responsive browser UI, keyboard-safe confirmation dialogs, public feedback templates with personal-data warnings, and GitHub Pages deployment.
- Added public project essentials: Apache-2.0 license, bilingual README, contribution and security policies, Code of Conduct, changelog, synthetic examples, CI, and release notes.
- Added a tag-gated release workflow that verifies protected `main`, packages the static build, publishes a SHA-256 checksum, and creates GitHub Actions OIDC provenance.
- Added the fail-closed Pre-W1 verification control plane: a Spec Manifest, Required Release Scope Catalog, immutable authority snapshots, frozen Candidate Scope, two-layer content-addressed Evidence, append-only Gate Registry, chained checkpoints, and trusted protected-`main` provenance checks.

### Changed

- Defined v0.1.0-alpha.1 as a narrow browser-local open-source tool. Accounts, server storage, automatic collection, AI, outbound applications, messaging, mailbox access, and calendar access are explicitly deferred.
- Reframed the accepted v0.1 Autopilot materials as the design baseline for a later productization phase, not as implemented Alpha functionality.
- Clarified sole-maintainer governance: `github:AnnCYW-cm` makes product and Gate decisions; machine signatures prove provenance but never replace that decision.
- Moved Docker, service deployment, and cross-device packaging out of the Alpha commitment and into future evaluation.

### Security

- External recruiting-platform, mailbox, calendar, and AI-provider execution remains absent and disabled.
- Invalid or unsupported stored data fails closed: editing is locked instead of silently overwriting the user's local copy.
- Full export and destructive operations surface explicit privacy warnings and confirmations.
- Gate 1 remains `BLOCKED` until real-user research and trusted evidence exist. The public Alpha and synthetic examples do not satisfy that Gate, which applies only to starting the later productization work.

### Design history included in this Alpha

- On 2026-09-09, the v0.1 product and UML design baseline and 254 traceable P0 cases were accepted as design inputs; implementation remains unverified unless bound evidence says otherwise.
- On 2026-09-11, the repository added accepted Shadow-safety, raw-JD retention, preparation-pack, sole-maintainer governance, and implementation-evidence decisions. These remain future-product controls rather than claims about the browser-local Alpha.
