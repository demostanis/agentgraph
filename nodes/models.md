# Models

Models turn prepared [[Signals]] into forecasts, risk scores, and ranking inputs for [[Products]], then improve through [[Experiments]].

## Model Lifecycle

Every model begins as a hypothesis about how [[Signals]] can help a user or operator make a better decision. The hypothesis should name the target behavior, the prediction horizon, and the product action it will inform.

Training data is only useful when lineage is clear. The model card should point back to the exact [[Pipelines]] that created each feature, the [[Archives]] snapshot used for validation, and the metrics that [[Quality]] reviews before release.

## Evaluation

- Offline metrics show whether the model learned the intended pattern.
- Shadow-mode checks show how the model behaves against live traffic.
- Product metrics from [[Experiments]] show whether the model actually helps users.
- Alerting from [[Ops]] shows whether the model stays healthy after launch.

## Release Checklist

1. Confirm training and serving features match.
2. Review sensitive attributes and proxy risks.
3. Document fallback behavior for [[Products]].
4. Run canary analysis with [[Experiments]].
5. Store model artifacts and evaluation reports in [[Archives]].

## Monitoring

Model monitoring should separate data drift, prediction drift, and product outcome drift. When those signals disagree, [[Incident Review]] should capture the investigation so future releases can avoid the same ambiguity.

```text
model: relevance-ranker
inputs: Signals -> Pipelines
outputs: Products -> Experiments
```

```ts
type ModelRun = {
  model: string;
  inputs: string[];
  promoted: boolean;
};

const run: ModelRun = {
  model: "relevance-ranker",
  inputs: ["Signals", "Pipelines"],
  promoted: true,
};
```

## Notes

Long-term model quality depends on useful feedback loops. If [[Customer Feedback]] describes confusion, disappointment, or delight that the metrics miss, that feedback should influence the next training cycle.
