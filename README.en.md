# RoleFox

[中文](README.md) | [English](README.en.md)

> **Set your goal. Show up for the interview.**
>
> An open-source, local-by-default, self-hostable autonomous job-search agent controlled by the candidate.

RoleFox aims to take over the routine work between a candidate's goals and a booked interview: discover and evaluate roles, tailor evidence-grounded materials, apply, follow up, handle pre-screen conversations and schedule interviews. After a candidate provides truthful data and a versioned delegation policy, RoleFox should interrupt them only for exceptions or a confirmed interview.

This repository is currently **M0 / pre-alpha**. It includes a static product demo, domain state machine, foundational policy rules and extensibility contracts. It does not connect to real job boards or submit real applications yet.

## Principles

- **Candidate-owned data** — profiles, rules, credentials and audit history stay under the user's control.
- **Policy as authorization** — low-risk L3 actions inside a versioned delegation envelope do not need per-action approval; exceptions do.
- **Explainable outcomes** — users can inspect match reasons, supporting evidence and action risk.
- **Replaceable infrastructure** — job sources, AI providers, storage and notifications are extensible.

RoleFox started from one person's real job search, but that person is the project's zero user, not a hard-coded product persona. A new candidate should be able to use RoleFox by changing workspace data and connectors, not core code.

## Project status

| Capability | Status |
| --- | --- |
| Web workspace with synthetic demo data | Implemented demo |
| Application state machine | M0 foundation implemented; accepted Interview lifecycle, Operation/Saga evidence, and CAS guards are not yet implemented |
| Dry-run, kill switch, level matrix and limit rules | Initial implementation with unit tests |
| Capability-based job, messaging, notification and calendar connector contracts | Initial version |
| Provider-agnostic AI contract | Initial version |
| Worker and local runner | Safe stubs; no authorization store, exception workflow or external execution |
| SQLite, matching and material generation | Planned |
| Real job-board applications | Not implemented |

General-purpose does not mean every job site is supported on day one. The core schema is portable; each real source needs an explicit connector and a review of its permissions and terms.

## Safety model

RoleFox starts in `L2` with `DRY_RUN=true`, so the foundational policy evaluator returns `preview_only`. M0 does not yet implement ActionPlan creation, authorization and exception services, or execution.

The target experience is **L3 Autopilot**, not unbounded L4 autonomy. RoleFox may keep working only while the job, content, answers and calendar slot remain inside the candidate's versioned delegation policy. Missing facts, out-of-range answers, ambiguous times, calendar conflicts and high-risk commitments become exceptions.

```text
Connector draft → core ActionPlan → policy decision
                                      ├─ approval when required
                                      └─ pre-approved L3 rule
                                                   ↓
                                               execution
```

Compensation ranges, start dates and locations may be handled only when explicitly preauthorized and supported by candidate evidence; anything outside that range is escalated. Offer acceptance, legal declarations and unverifiable identity or experience claims always remain with the user. RoleFox will not solve CAPTCHAs or bypass access controls and platform safeguards.

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

The accepted v0.1 support target is Docker Compose on macOS, Windows, and Linux, plus supported native development on macOS. Native Linux and Windows runtimes are best effort. M0 has not completed that installation matrix yet.

Before opening a pull request:

```bash
pnpm check
```

See the [product scope](docs/product-scope.md), [Autopilot decision record](docs/adr/0001-pre-interview-autopilot.md), [accepted v0.1 decision baseline](docs/adr/0002-v0.1-product-decision-baseline.md), [architecture](docs/architecture.md), [roadmap](docs/roadmap.md), [open-source strategy](docs/open-source-strategy.md), and [contribution guide](CONTRIBUTING.md).

## License

[Apache License 2.0](LICENSE). Its long-term governance and hosted-service boundaries will be discussed publicly before outside contributions scale.
