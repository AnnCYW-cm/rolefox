# RoleFox

[中文](README.md) | [English](README.en.md)

> Open-source, local-by-default, self-hostable job-search automation controlled by the candidate.

RoleFox aims to turn a fragmented job search into an explainable, approval-driven and auditable workflow: discover roles, normalize and deduplicate listings, score fit, prepare materials, approve applications, assist with recruiter conversations and notify users about interviews.

This repository is currently **M0 / pre-alpha**. It includes a static product demo, domain state machine, foundational policy rules and extensibility contracts. It does not connect to real job boards or submit real applications yet.

## Principles

- **Candidate-owned data** — profiles, rules, credentials and audit history stay under the user's control.
- **Controlled automation** — an AI-generated draft never becomes an external action without policy evaluation.
- **Explainable outcomes** — users can inspect match reasons, supporting evidence and action risk.
- **Replaceable infrastructure** — job sources, AI providers, storage and notifications are extensible.

RoleFox started from one person's real job search, but that person is the project's zero user, not a hard-coded product persona. A new candidate should be able to use RoleFox by changing workspace data and connectors, not core code.

## Project status

| Capability | Status |
| --- | --- |
| Web workspace with synthetic demo data | Implemented demo |
| Application state machine | Implemented |
| Dry-run, kill switch, level matrix and limit rules | Initial implementation with unit tests |
| Capability-based connector contract | Initial version |
| Provider-agnostic AI contract | Initial version |
| Worker and local runner | Safe stubs; no approval service or external execution |
| SQLite, matching and material generation | Planned |
| Real job-board applications | Not implemented |

General-purpose does not mean every job site is supported on day one. The core schema is portable; each real source needs an explicit connector and a review of its permissions and terms.

## Safety model

RoleFox starts in `L2` with `DRY_RUN=true`, so the foundational policy evaluator returns `preview_only`. M0 does not yet implement ActionPlan creation, an approval service, or execution.

```text
Connector draft → core ActionPlan → policy decision
                                      ├─ approval when required
                                      └─ pre-approved L3 rule
                                                   ↓
                                               execution
```

Sensitive commitments such as compensation, start date, visa status, identity claims and offer decisions are always escalated to the user. RoleFox will not solve CAPTCHAs or bypass access controls and platform safeguards.

## Run locally

Requires Node.js 20.9+ and pnpm 10.29.1+.

```bash
git clone https://github.com/AnnCYW-cm/rolefox.git
cd rolefox
pnpm install
cp .env.example .env
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). The current UI uses synthetic data only.

Before opening a pull request:

```bash
pnpm check
```

See the [product scope](docs/product-scope.md), [architecture](docs/architecture.md), [roadmap](docs/roadmap.md), [open-source strategy](docs/open-source-strategy.md), and [contribution guide](CONTRIBUTING.md).

## License

[Apache License 2.0](LICENSE). Its long-term governance and hosted-service boundaries will be discussed publicly before outside contributions scale.
