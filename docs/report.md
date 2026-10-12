# Technical report outline

**Title:** Campus IT Helpdesk: Continuous Resilience Testing of Microservices in CI/CD

## Abstract

Describe the support-ticket workflow, API and notification worker, PostgreSQL persistence, GitHub Actions pipeline, worker outage check, Chaos Mesh API pod failure, and **actual measured results after running the updated version**.

## 1. Problem and objectives

A normal build and unit test can pass while a release loses ticket availability during a pod failure. A worker failure can also delay notifications. The objective is to make these behaviours observable and gate promotion on measured ticket availability and recovery.

## 2. Architecture

Diagram: private GitHub repository → EC2 self-hosted runner → two Docker images → Minikube. Inside the cluster: Service → two Express API pods → PostgreSQL/PVC; one notification worker consumes pending events through the API. Chaos Mesh targets only an API pod. Explain the limits of one node and one database instance.

## 3. Implementation

Explain ticket create/list/assign/resolve endpoints and UI, database tables and transaction around ticket changes and outbox events, authenticated worker polling, Kubernetes manifests, CI workflow, PodChaos selector, and both Python gates.

## 4. Test cases and expected behaviour

| Test | Expected design behaviour |
|---|---|
| Node unit test | Ticket validation, create, update, and internal token checks pass |
| Worker outage | Ticket creation succeeds while worker is down; event becomes delivered after restart |
| Two-replica pod kill | One API pod is replaced; sampled ticket availability >=95%; recovery <=10 s; ticket resolves |
| One-replica pod kill | Failed ticket probes should cause the 100% availability gate to reject promotion |
| Missing fault injection | No original API pod UID disappears; gate fails |

These are expectations, not observed results. A very short outage may escape sampling.

## 5. Actual results

Insert completed [results template](results-template.md), Actions run URLs, commit SHA, worker recovery JSON, gate JSON, pod events, and screenshots. Report the values from the **ticketing version** only. Explain any unexpected failure instead of altering thresholds after seeing results.

## 6. Evaluation and limits

Compare passing and failing runs against their declared thresholds. Discuss single probe client, 0.2-second sampling, simulated notifications, no login, one Minikube node, one PostgreSQL instance, and no production deployment.

## 7. Conclusion and next steps

State only what the recorded runs support. Future improvements: auth/roles, actual email delivery, database high availability, repeat trials, network fault, and multi-node tests.
