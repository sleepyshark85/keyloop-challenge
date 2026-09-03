# 10. Quality requirements

> Owner: architect · Written: phase 2

## 10.1 Quality tree

## 10.2 Quality scenarios

Each scenario is written so it can be executed, and names the test that enforces it. CI fails if a
scenario names a test that does not exist.

| id | Scenario | Enforced by |
|---|---|---|
| QS-1 | *(stimulus → response, measurable)* | *(test path)* |

*"The system should be fast" is not a quality scenario. "No two confirmed appointments may share a
bay with overlapping intervals under any interleaving of concurrent requests" is.*
