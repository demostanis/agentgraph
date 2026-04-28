# Signals

Signals collects telemetry, customer events, and product instrumentation before they move into [[Pipelines]], inform [[Models]], and capture themes from [[Customer Feedback]].

## Intake

Signals starts with a mix of event streams, batch drops, support tags, survey exports, and operational counters. Each source needs a clear owner, freshness expectation, and backfill strategy before it can be trusted by [[Pipelines]].

The most useful signal definitions include a plain-language description, a producer, a sample payload, and known caveats. This keeps downstream consumers from treating exploratory instrumentation as production truth.

## Quality Checks

- Confirm event names are stable across releases.
- Compare daily volume against expected traffic bands.
- Track null rates on attributes used by [[Models]].
- Flag schema drift before it reaches [[Products]].
- Attach customer context from [[Customer Feedback]] when numbers need interpretation.

## Operating Notes

Signal reviews should happen before launch, after the first traffic spike, and whenever [[Incident Review]] identifies a measurement gap. A small amount of review here prevents noisy dashboards and brittle automations later.

```json
{ "source": "product-event", "owner": "analytics", "freshness": "15m" }
```

## Open Questions

Which signals should graduate from exploratory to canonical? Which ones are only useful for a single experiment? Which product areas still need better instrumentation before [[Experiments]] can be trusted?
