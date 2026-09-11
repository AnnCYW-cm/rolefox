# RoleFox

[中文](README.md) | [English](README.en.md)

> **Set your goal. Show up for the interview.**
>
> An open-source, local-by-default, self-hostable autonomous job-search agent controlled by the candidate.

RoleFox aims to take over the routine work between a candidate's goals and a booked interview: discover and evaluate roles, tailor evidence-grounded materials, apply, follow up, handle pre-screen conversations and schedule interviews. After a candidate provides truthful data and a versioned delegation policy, RoleFox should interrupt them only for exceptions or a confirmed interview.

This repository is currently **M0 / pre-alpha**. It includes a static product demo, domain state machine, foundational policy rules and extensibility contracts. It does not connect to real job boards or submit real applications yet.

The Pre-W1 verification control plane now includes a Spec Manifest bound to both normative inputs and the verifier toolchain, a Required Release Scope Catalog, immutable authority snapshots, a frozen Candidate Scope, a schema and writer for two-layer content-addressed Evidence, an append-only Gate Registry, and chained checkpoints. RoleFox uses a sole-maintainer governance model: `github:AnnCYW-cm` makes the human product and Gate decisions, while protected-main GitHub Actions OIDC is only the target machine provenance and signing identity. This currently proves only that the registry structure is reproducible: the protocol and scope still need verifiable maintainer approval, no real interviews or rule replays have been collected, Gate 1 remains `BLOCKED_NOT_STARTED`, and W1 has not started. See the [verification registry guide](verification/README.md).

The v0.1 release has a separate real-provider gate that a demo cannot satisfy: RoleFox must connect to a real mailbox and a real calendar provider and verify inbound mail, controlled L2 replies after the seven-day Shadow gate, busy-time query and reconciliation, a candidate-private tentative event, recruiter confirmation, and failure compensation end to end. Reaching limited L3 is not required for v0.1—capabilities may remain at L2—but a fake inbox, test calendar, or application handoff cannot replace this release evidence. M0 has not implemented or passed this gate.

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
| Application state machine | M0 legacy foundation only: string transitions and illegal-transition tests exist; the accepted Application/Interview lifecycles, Operation/Saga evidence, CAS and recovery semantics are not implemented |
| Dry-run, kill switch, level matrix and limit rules | M0 legacy evaluator only: it compares caller-supplied usage and configuration; system hard ceilings, atomic counters/reservations, authorization records and L3 readiness are not implemented |
| Capability-based job, messaging, notification and calendar connector contracts | Initial version |
| Provider-agnostic AI contract | Initial version |
| Worker and local runner | Safe stubs; no authorization store, exception workflow or external execution |
| SQLite, matching and material generation | Planned |
| Real job-board applications | Not implemented |

General-purpose does not mean every job site is supported on day one. The core schema is portable; each real source needs an explicit connector and a review of its permissions and terms.

## Safety model

RoleFox starts in `L2` with `DRY_RUN=true`, so the legacy foundational policy evaluator returns `preview_only`. M0 does not yet implement accepted hard ceilings, atomic usage counters/reservations, ActionPlan creation, authorization and exception services, L3 readiness, or execution.

The target experience is **L3 Autopilot**, not unbounded L4 autonomy. RoleFox may keep working only while the job, content, answers and calendar slot remain inside the candidate's versioned delegation policy. Missing facts, out-of-range answers, ambiguous times, calendar conflicts and high-risk commitments become exceptions.

```text
Connector draft → immutable ActionPlan → durable policy evaluation
                                           ↓
                         current 7-day pre-L2 Shadow receipt gate
                                           ↓
                           L2 approval or current limited L3 grant
                                           ↓
            atomic Authorization / Operation / AuditIntent / Outbox
                                           ↓
          execution-time binding + receipt recheck → external execution
```

Human approval never bypasses Shadow. The exact field bindings, composite scheduling receipt set, and three-state reconciliation rules are defined by the [common mutation sequence](docs/product/uml/05-sequence-flows.md).

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

Run `pnpm verification:check` to validate the Pre-W1 registry structure. W1 may start only when `pnpm verification:ready` succeeds; it currently fails closed by design.

See the [product scope](docs/product-scope.md), [Autopilot decision record](docs/adr/0001-pre-interview-autopilot.md), [accepted v0.1 decision baseline](docs/adr/0002-v0.1-product-decision-baseline.md), [safety-control Shadow boundary](docs/adr/0003-shadow-safety-control-exceptions.md), [JD raw-retention and preparation-pack decision](docs/adr/0004-jd-raw-retention-and-preparation-pack.md), [sole-maintainer governance decision](docs/adr/0005-sole-maintainer-governance.md), [implementation evidence and release-closure contract](docs/product/implementation-verification-v0.1.md), [architecture](docs/architecture.md), [roadmap](docs/roadmap.md), [public changelog](CHANGELOG.md), [open-source strategy](docs/open-source-strategy.md), and [contribution guide](CONTRIBUTING.md).

## License

[Apache License 2.0](LICENSE). Its long-term governance and hosted-service boundaries will be discussed publicly before outside contributions scale.
