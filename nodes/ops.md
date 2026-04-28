# Ops

Ops monitors releases, alerts, and runbooks for [[Pipelines]], [[Products]], and [[Incident Review]].

## Responsibilities

Ops keeps the graph reliable while teams move quickly. It owns escalation paths, production readiness reviews, and the practical details that make [[Products]] supportable after launch.

Runbooks should be short, specific, and tested. A good runbook explains the symptom, the likely blast radius, the first safe mitigation, and the signal that confirms recovery. If a runbook needs tribal knowledge, it belongs in [[Incident Review]].

## Alert Review

- Alerts should map to user-visible or business-visible impact.
- Noisy alerts should be tuned or deleted.
- Critical alerts need an owner, escalation policy, and rollback path.
- [[Pipelines]] alerts should distinguish delayed data from incorrect data.
- [[Models]] alerts should distinguish degraded predictions from missing predictions.

## Release Support

Before a major launch, Ops checks dashboards, feature flags, dependency health, and rollback steps. During launch, Ops watches [[Signals]] and coordinates with [[Quality]] when metrics disagree.

After launch, Ops captures follow-up work. If the team had to improvise, the improvisation becomes documentation. If the alert fired too late, the alert is redesigned.

## Incident Template

```text
Impact:
Detection:
Mitigation:
Follow-up:
Linked systems: [[Products]], [[Pipelines]], [[Archives]]
```

## Collaboration

Ops is most effective when it is involved early. Product teams should bring Ops into design reviews when a feature introduces new dependencies, customer promises, or operational load.
