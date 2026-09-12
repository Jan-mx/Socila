## Task 4 - Agent dataset and live-model evaluation

Implement exactly 80 labeled conversations: 20 single-turn complete, 20 multi-turn completion, 15 ambiguous expressions, 15 corrections/invalid inputs, and 10 out-of-scope or prompt-injection cases. Run three repetitions with the configured real model, compute field precision/recall/F1, exact profile match, tool routing, schema-valid arguments, task completion, and unsupported-policy-number leakage. Select 20 representative cases for rate-limited HTTP/SSE/persistence verification against the isolated database.
