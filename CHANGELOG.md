# Changelog

All notable public changes to RoleFox are recorded here. Release status refers only to the scope stated for that release; it does not imply that the later Autopilot design has been implemented or that a research Gate has passed.

## Unreleased

## [0.1.0-alpha.8](releases/v0.1.0-alpha.8.md) - 2026-09-24

Browser-verification and release-reliability release. This version adds repeatable Chromium coverage for the existing Alpha.7 product workflow and makes that coverage a required part of CI, tagged releases, and the deployed GitHub Pages check without changing product capabilities, UI, data, or safety behavior.

### Added

- Added seven Playwright Chromium journeys covering the initial privacy and version boundary, search and all six filters, manual entry with persisted decisions and edits, CSV duplicate review, JSON import preview, interested-jobs export, and full backup / clear / restore persistence.
- Added a Node-based static-export harness so local and automated browser checks exercise the same generated site that is packaged for release.
- Added retained HTML reports, traces, screenshots, and test-result artifacts when an automated browser run fails.

### Changed

- Made the full browser E2E suite a required CI and tagged-release gate after the existing repository checks.
- Added a post-deployment GitHub Pages smoke test against the deployed base path, including the live version and browser-local privacy boundary.

### Compatibility and scope

- Kept the Alpha.7 product workflow, UI, deterministic scoring, stored-data schema, storage key, validation behavior, and no-external-action safety boundary unchanged; Alpha.1–Alpha.7 local data require no migration.
- Did not add accounts, server storage, cloud sync, automatic scraping, background collection, AI, connectors, generated materials, applications, messages, mailbox access, calendar access, or other external actions.
- Kept Pre-W1 Gate 1 `BLOCKED_NOT_STARTED`; automated browser verification is release evidence for the existing open-source tool, not user-research evidence for later productization.
- Preserved v0.1.0-alpha.7 as an immutable historical release. Alpha.8 does not rewrite its tag, release notes, changelog record, or verification lineage.

## [0.1.0-alpha.7](releases/v0.1.0-alpha.7.md) - 2026-09-23

Clear Signal interface rebuild and local-review workflow release. This version combines the new workspace with safer file import, duplicate review, job editing, search and filtering, and a focused interested-jobs export while keeping deterministic scoring, the stored-data schema, storage key, and no-external-action boundary intact.

### Added

- Added browser-local CSV/JSON job import with a preview step before any selected record is written.
- Added exact-duplicate checks against existing jobs and within an import file, plus possible-duplicate warnings for matching title, company, and location with different descriptions.
- Added job editing with duplicate review and immediate deterministic rescoring after a saved change.
- Added title, company, location, and description search with six result filters: all, undecided, recommended, interested, not interested, and excluded.
- Added an interested-jobs JSON export containing job text, the current score and label, eligibility, reasons, and concerns.
- Added a 15 MB safety limit for job-import and backup-restore files and for serialized browser-local state. Over-limit reads or writes are refused without overwriting existing local data.

### Changed

- Replaced Fox Ledger's warm-paper editorial treatment with a cool-white, graphite, and scarce fox-orange visual system focused on clarity and scanning.
- Consolidated product identity, task navigation, and browser-local status into a single 64px app bar.
- Organized the primary workflow around a continuous result ledger and a dedicated input dock, reducing first-screen chrome around the work itself.
- Removed stacked-card composition and floating shadows from the core workspace, using spacing, typography, and restrained rules to express structure.
- Removed ultra-small interface text and strengthened the readable type hierarchy without changing the underlying content or decisions.

### Compatibility and scope

- Kept deterministic scoring and ordering, rules, synthetic examples, calibration decisions, the versioned storage schema, storage key, and validation model compatible with Alpha.1–Alpha.6 data; no migration is required.
- Did not add accounts, server storage, cloud sync, automatic scraping or background collection, AI, connectors, generated materials, applications, messages, mailbox access, calendar access, or other external actions.
- Kept Pre-W1 Gate 1 `BLOCKED_NOT_STARTED`; the interface and workflow changes are not research evidence, and that Gate does not block the narrowly scoped open-source Alpha release.
- Preserved v0.1.0-alpha.6 as an immutable historical release. Alpha.7 does not rewrite its tag, release notes, changelog record, or verification lineage.

## [0.1.0-alpha.6](releases/v0.1.0-alpha.6.md) - 2026-09-15

Fox Ledger visual and responsive-interface rebuild of v0.1.0-alpha.5. This release keeps the same browser-local job-triage capabilities, stored-data schema, storage key, and safety boundary.

### Changed

- Replaced the generic light SaaS palette with warm paper, near-black ink, and one restrained fox-orange editorial accent.
- Replaced the gradient app tile with a bold geometric fox mark and introduced a display-serif / utilitarian-sans type hierarchy without remote font requests.
- Removed glass navigation, pill clusters, soft shadows, hover lift, and nested rounded-card surfaces from the core interface.
- Rebuilt the result area as a continuous opportunity ledger with rule dividers, typographic score columns, and inline expanded reasoning.
- Unified the rule and job-entry surfaces into one editing rail while preserving results-first DOM, keyboard, and visual ordering when jobs exist.
- Kept task navigation visible at intermediate and mobile widths, and verified the interface in real browsers at 1440, 820, 390, and 320px.

### Compatibility and scope

- Did not change scoring, rules, synthetic examples, job input, calibration, export, restore, clearing, or any other product capability.
- Kept the existing storage key, browser-local data schema, and validation behavior; Alpha.1 through Alpha.5 local data require no migration.
- Did not add accounts, server storage, cloud sync, collection, AI, connectors, generated materials, applications, messages, mailbox access, calendar access, or other external actions.
- Kept Pre-W1 Gate 1 `BLOCKED_NOT_STARTED`; this redesign is not research evidence and does not block the narrowly scoped open-source Alpha release.
- Preserved v0.1.0-alpha.5 as an immutable historical release. Alpha.6 does not rewrite its tag, release notes, changelog record, or verification lineage.

## [0.1.0-alpha.5](releases/v0.1.0-alpha.5.md) - 2026-09-14

Quiet Utility / Quiet Intelligence visual and responsive-interface rebuild of v0.1.0-alpha.4. This release keeps the same browser-local job-triage capabilities, stored-data schema, storage key, and safety boundary.

### Changed

- Replaced Signal Desk's orange-and-lime accents and black console surfaces with a unified light-neutral system and one restrained indigo accent.
- Replaced serif display type, clipped corners, hard rules, and heavy frames with an all-sans-serif type stack, rounded surfaces, light borders, and quieter spacing and hierarchy.
- Made result cards more compact and integrated rank into the score block for faster scanning without changing score values or ordering.
- Removed the fixed mobile bottom dock while preserving results-first DOM, keyboard, and visual ordering when jobs exist.
- Kept key button targets touch-safe and long titles, companies, locations, reasons, and concerns resilient at narrow widths.

### Compatibility and scope

- Did not change scoring, rules, synthetic examples, job input, calibration, export, restore, clearing, or any other product capability.
- Kept the existing storage key, browser-local data schema, and validation behavior; Alpha.1 through Alpha.4 local data require no migration.
- Did not add accounts, server storage, cloud sync, collection, AI, connectors, generated materials, applications, messages, mailbox access, calendar access, or other external actions.
- Kept Pre-W1 Gate 1 `BLOCKED_NOT_STARTED`; this redesign is not research evidence and does not block the narrowly scoped open-source Alpha release.
- Preserved v0.1.0-alpha.4 as an immutable historical release. Alpha.5 does not rewrite its tag, release notes, changelog record, or verification lineage.

## [0.1.0-alpha.4](releases/v0.1.0-alpha.4.md) - 2026-09-14

Signal Desk visual and responsive-interface rebuild of v0.1.0-alpha.3. This release keeps the same browser-local job-triage capabilities, stored-data schema, and safety boundary.

### Changed

- Replaced the warm beige and muted-orange palette with cool graphite, mist white, electric fox orange, and small semantic lime/blue accents.
- Replaced the former mascot with a geometric negative-space fox/F mark and introduced an editorial masthead, hard rules, redlines, and clipped-corner controls.
- Kept the desktop configuration rail beside a continuous opportunity ledger, while making advanced rules collapsible and result rows denser and easier to scan.
- Added mobile bottom task navigation and results-first DOM and visual ordering when jobs exist; empty-state rule input remains in the first screen.
- Kept the sample loader reachable at every viewport and restored 44px targets for destructive and technical-detail controls.
- Preserved visible focus, reduced-motion behavior, modal focus trapping, Escape cancellation, trigger focus return, and a results-heading fallback after confirmed deletion.

### Compatibility and scope

- Did not change scoring, rules, synthetic examples, job input, calibration, export, restore, clearing, or any other product capability.
- Kept the existing storage key, browser-local data schema, and validation behavior; Alpha.1 through Alpha.3 local data require no migration.
- Did not add accounts, server storage, cloud sync, collection, AI, connectors, generated materials, applications, messages, mailbox access, calendar access, or other external actions.
- Kept Pre-W1 Gate 1 `BLOCKED`; this redesign is not research evidence and changes no verification state.
- Preserved v0.1.0-alpha.3 as an immutable historical release. Alpha.4 does not rewrite its tag, release notes, changelog record, or verification lineage.

## [0.1.0-alpha.3](releases/v0.1.0-alpha.3.md) - 2026-09-14

Complete Quiet Workbench UI and information-architecture rebuild of v0.1.0-alpha.2. This release keeps the same browser-local job-triage capabilities, stored-data schema, and safety boundary.

### Changed

- Replaced the marketing-style full-height sidebar and oversized hero composition with a restrained warm-gray-and-white workspace, fox-orange accents, and a flat top bar.
- Reorganized the desktop experience into a configuration rail beside a continuous results list, with flatter panels, clearer hierarchy, and denser job rows.
- Reduced first-screen chrome and vertical stacking on smaller screens so the core rules, job-entry, and results workflow appears sooner on mobile.
- Consolidated local-only status and privacy detail without weakening the existing disclosure, recovery, export, destructive-action, keyboard, or screen-reader behavior.

### Compatibility and scope

- Did not change scoring, rules, synthetic examples, job input, calibration, export, restore, clearing, or any other product capability.
- Kept the existing browser-local data schema and storage behavior; Alpha.1 and Alpha.2 local data require no migration and remain readable.
- Did not add accounts, server storage, cloud sync, collection, AI, connectors, generated materials, applications, messages, mailbox access, calendar access, or other external actions.
- Kept Pre-W1 Gate 1 `BLOCKED`; this redesign is not research evidence and changes no verification state.
- Preserved v0.1.0-alpha.2 as an immutable historical release. Alpha.3 does not rewrite its tag, release notes, or changelog record.

## [0.1.0-alpha.2](releases/v0.1.0-alpha.2.md) - 2026-09-14

UI follow-up to the first public Alpha. This release keeps the same browser-local job-triage capabilities and safety boundary as v0.1.0-alpha.1.

### Changed

- Refreshed the visual system, brand mark, responsive layout, navigation, and content hierarchy without changing the tool's underlying workflow.
- Reorganized the page around define, add, and calibrate steps; added a compact decision-progress summary; and moved project resources into the footer.
- Improved keyboard focus visibility, semantic landmarks, status messaging, and responsive reading order while retaining the existing skip-navigation and dialog focus/Escape behavior.
- Clarified browser-storage status, full-backup controls, the no-text aggregate label, and the public nature of GitHub feedback.

### Scope and security

- Did not add accounts, server storage, cloud sync, collection, AI, connectors, generated materials, applications, messages, mailbox access, calendar access, or other external actions.
- Kept the existing browser-local data model and fail-closed storage and restore behavior.
- Kept Pre-W1 Gate 1 `BLOCKED`; this UI release is not research evidence and does not start the later productization W1.

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
