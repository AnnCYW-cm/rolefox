# RoleFox

[中文](README.md) | [English](README.en.md)

> An open-source, browser-local tool for deciding which jobs are worth a closer look.

RoleFox **v0.1.0-alpha.7** is an open-source, browser-local job-triage tool. Define a target role, location, and keywords; add jobs manually, in batches, or from local files; review deterministic scores, hard exclusions, and inspectable reasons; then record your own interested / not-interested decisions. Data stays in the current browser by default.

[Try it online](https://anncyw-cm.github.io/rolefox/) · [Synthetic examples](examples/fake-job-board/README.md) · [Release notes](releases/v0.1.0-alpha.7.md) · [Share feedback](https://github.com/AnnCYW-cm/rolefox/issues/new?template=alpha-feedback.yml)

Alpha.7 rebuilds Alpha.6's Fox Ledger as **Clear Signal** and brings the complete local review workflow into the same release: CSV/JSON import preview, exact- and possible-duplicate checks, job editing, search with six filters, and an interested-jobs JSON export containing the current evaluation evidence. Deterministic scoring, the versioned data schema, storage key, and no-external-action safety boundary are unchanged; Alpha.1–Alpha.6 data require no migration, and Alpha.6 remains an immutable historical release.

## 3–5 minute quickstart

1. Open the [live tool](https://anncyw-cm.github.io/rolefox/) and select “加载合成示例” (load synthetic examples).
2. Review the sample rules, or replace them with your target role, location, preferred keywords, and exclusion keywords, then save.
3. Inspect each job's score, reasons, and concerns, and mark it interested or not interested.
4. Under “导出、备份或彻底清除” (export, back up, or clear), export a full backup. If you want to share test results, export the “无原文汇总” (no-text aggregate) instead; it excludes rule text and job content.

Start with synthetic or fully redacted data. GitHub issues are public: do not post resumes, real job descriptions, company names, contact details, private links, or other personal information.

The v0.1.0-alpha.7 interface and repository example tutorial are currently in Chinese. This English README translates the main controls; an English interface is not part of this Alpha.

You can also use the [copy-and-paste synthetic rules and jobs](examples/fake-job-board/README.md) to test batch input.

## What this Alpha does

| Capability | v0.1.0-alpha.7 status |
| --- | --- |
| Target rules | Target role, location, preferred keywords, and hard exclusions |
| Job input | Manual entry, batch paste using `title \| company \| location \| description`, or local CSV/JSON preview import |
| Duplicate checks | During file import and job editing, blocks exact duplicates against existing jobs or within the file and flags same-title/company/location records with different descriptions as possible duplicates |
| Local evaluation | Deterministic scoring, sorting, reasons, concerns, and hard exclusions |
| Review management | Search title, company, location, or description; switch among all, undecided, recommended, interested, not interested, and excluded filters; edit a job and rescore it |
| Human calibration | Interested / not-interested decisions stored locally, with explicit rule-calibration actions |
| Data control | Browser-local persistence, full JSON backup and restore, interested-jobs export, no-text aggregate, per-job deletion, and full clearing |
| Safe defaults | No external actions; writes are refused when serialized local state exceeds 15 MB; failed storage reads or restore validation lock editing to prevent accidental overwrite |

Scores are explainable local rule results. They are not AI recommendations and do not predict job quality, hiring outcomes, or career fit.

## Explicitly out of scope

This Alpha has **no** accounts, server database, cloud sync, automatic scraping, real job-board connection, AI calls, material generation, automatic applications, message replies, mailbox access, or calendar access. It never takes external actions in the background.

Those capabilities belong to a later productization phase. The repository's domain state machine, policy modules, Connector SDK, AI Provider, Worker, and Runner are foundational contracts or safety stubs—not usable product capabilities. The accepted v0.1 Autopilot documents remain a design baseline for that later phase; they do not mean this Alpha implements the 254 acceptance cases.

## Data and privacy

- Rules, jobs, and calibration choices are kept in the current browser's `localStorage`; there is no account or server copy.
- CSV/JSON job files are read and previewed only in the current browser; they are never uploaded, and no job record is written before confirmation.
- Job-import files, backup-restore files, and serialized local state have a 15 MB safety limit; over-limit reads or writes are refused without overwriting existing local data.
- Clearing site data also removes local records, so export a full backup first.
- A full export can contain personal or job-search information you entered. Treat it as a private file.
- The interested-jobs export contains job text, current scores, and evaluation evidence. Treat it as a private file too.
- The no-text aggregate includes counts, score bands, decision statistics, and rule shape only—not rule text, job content, companies, or locations.
- RoleFox does not solve CAPTCHAs, bypass access controls or platform safeguards, or optimize for indiscriminate bulk applications.

## Run locally

Requires Node.js 20.9+ and pnpm 10.29.1+.

```bash
git clone https://github.com/AnnCYW-cm/rolefox.git
cd rolefox
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). This release is a browser-local tool and makes no Docker or server-deployment commitment. Packaging, self-hosted services, and cross-device modes will be evaluated during productization.

Before submitting changes, run:

```bash
pnpm check
pnpm exec playwright install chromium # run once before the first E2E test
pnpm test:e2e
```

`pnpm test:e2e` builds and serves the static export, then exercises the critical user journeys with synthetic data in isolated Chromium browser contexts. CI, tagged Alpha releases, and the post-deploy Pages check run the corresponding Playwright gates too; failure screenshots, traces, and HTML reports are never included in the release archive.
On a clean Linux environment without Chromium system libraries, use `pnpm exec playwright install --with-deps chromium` instead.

## Verification Gate and the next phase

The Pre-W1 Spec Manifest, Scope Catalog, Evidence, Gate Registry, checkpoints, and trusted-signature verification remain intact. Gate 1 intentionally remains **`BLOCKED_NOT_STARTED`** because no real-user research evidence has been collected. Synthetic examples or the fact that the Alpha is online must not be used to manufacture a PASS.

This does not block v0.1.0-alpha.7 as a narrowly scoped open-source tool. Gate 1 is currently **`BLOCKED_NOT_STARTED`** and is used only to decide whether and how to invest in the next productization phase. W1 in the accepted Autopilot baseline must not start until real interviews, rules replay, a Gate 1 PASS, and a trusted checkpoint all exist. Run `pnpm verification:check` to validate registry structure; the research-readiness command `pnpm verification:ready` should currently fail closed.

Possible next-phase work includes onboarding, a candidate fact store, a persistent database, link import, cross-source deduplication, AI assistance, workflows, and compliant connectors. First-release feedback and Gate 1 evidence—not this release—will determine that scope.

## Docs and participation

- [v0.1.0-alpha.7 release notes](releases/v0.1.0-alpha.7.md)
- [v0.1.0-alpha.6 historical release notes](releases/v0.1.0-alpha.6.md)
- [v0.1.0-alpha.5 historical release notes](releases/v0.1.0-alpha.5.md)
- [v0.1.0-alpha.4 historical release notes](releases/v0.1.0-alpha.4.md)
- [v0.1.0-alpha.3 historical release notes](releases/v0.1.0-alpha.3.md)
- [v0.1.0-alpha.2 historical release notes](releases/v0.1.0-alpha.2.md)
- [v0.1.0-alpha.1 first-public-release record](releases/v0.1.0-alpha.1.md)
- [Synthetic rule and job examples](examples/fake-job-board/README.md)
- [Current open-source release strategy](OPEN_SOURCE_ALPHA.md)
- [Long-term open-source principles](docs/open-source-strategy.md) (accepted historical design baseline)
- [Long-term roadmap](docs/roadmap.md)
- [Product design index](docs/product/README.md) (accepted baseline for the later phase)
- [Verification registry guide](verification/README.md)
- [Contribution guide](CONTRIBUTING.md) and [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security policy](SECURITY.md) (report vulnerabilities privately)
- [Changelog](CHANGELOG.md)

## License

[Apache License 2.0](LICENSE). You may use, modify, and distribute RoleFox under its terms.
