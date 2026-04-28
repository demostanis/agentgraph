# Incident Review

Incident Review connects [[Ops]] alerts with [[Archives]] and captures follow-up work for [[Quality]].

## Purpose

Incident Review turns production surprises into shared learning. It is not a blame document; it is a structured memory of what happened, how teams responded, and what should change next.

The review should link to [[Ops]] timelines, [[Archives]] snapshots, and any [[Signals]] that helped or failed to help detection. If the incident touched a user-facing workflow, it should also cite themes from [[Customer Feedback]].

## Review Flow

1. Summarize the customer impact in plain language.
2. Build a timeline from detection through mitigation.
3. Identify where dashboards, alerts, or docs were misleading.
4. Assign follow-ups to [[Quality]], [[Pipelines]], [[Models]], or [[Products]].
5. Revisit the review after follow-ups ship.

## Good Follow-Ups

- Add a missing invariant to [[Quality]].
- Improve a dashboard that [[Ops]] used during mitigation.
- Backfill corrupted data through [[Pipelines]].
- Store forensic context in [[Archives]].
- Change a [[Products]] fallback path so users see a safer state.

## Anti-Patterns

Avoid vague action items like "monitor better" or "communicate more." Prefer specific changes with owners, dates, and a verification step. If the team cannot verify that the follow-up worked, the incident can repeat.

## Example Decision Log

```text
Decision: Disable ranking experiment for enterprise accounts.
Reason: [[Models]] confidence dropped after delayed feature generation.
Owner: Ops lead
Review: Quality follow-up after backfill completes.
```

## Closing Notes

A strong review makes the next incident easier to detect, easier to explain, and easier to resolve. The goal is a better system, not a longer document.
