# Viva questions and answers

1. **Why is this a DevOps project?** Git push starts automated checks, build, containerization, deployment, fault injection, measurement, and a release decision.
2. **Why a self-hosted runner?** It can access the local Minikube API and Docker daemon. A GitHub-hosted runner is isolated from a laptop's cluster.
3. **Why a private repository?** Anyone able to execute workflows on a self-hosted runner could access its host and local cluster; private trusted access reduces that exposure.
4. **Why two replicas?** Killing one leaves a second pod eligible to serve requests while the Deployment creates a replacement.
5. **What does PodChaos do?** Chaos Mesh targets one matching pod and deletes it once; Kubernetes then reconciles the Deployment.
6. **How is failure detected?** The gate checks `/health` and a real persisted ticket on every sample, sees an original pod UID disappear, waits for ready replicas, and compares measured availability/recovery with thresholds.
7. **Can 100% sampled availability prove no outage?** No. It only means these samples succeeded; shorter outages could occur between probes.
8. **What happens if Chaos Mesh accepts YAML but does nothing?** No original pod UID disappears; the gate fails.
9. **What blocks promotion?** A nonzero gate exit stops the Actions job before the promotion decision step.
10. **Is the promotion step a production release?** No. It marks a candidate as eligible. No production environment is configured.
11. **Why no registry?** The runner builds locally and `minikube image load` transfers that exact SHA-tagged image into the cluster.
12. **How do you prove the failed scenario?** Use one replica and a 100% threshold, then show actual failed HTTP samples, a pod replacement, a failing gate, and the skipped promotion marker.
13. **Why two application services?** The API owns the ticket workflow and database; the worker processes queued notification events independently, so ticket creation can continue while notifications are delayed.
14. **What does the worker recovery check prove?** It stops the worker, creates a ticket, confirms its event stays pending, restarts the worker, and confirms eventual processing.
15. **Is PostgreSQL highly available?** No. This lab has one database pod and one PVC; the experiment targets API and worker failures, not database failure.
16. **What would you improve?** Add identity and role authorization, actual email delivery, a managed/high-availability database, repeated trials, and multi-node testing.

## Submission checklist

- [ ] Private GitHub repository and commit history
- [ ] API and worker source, tests, two Dockerfiles, Kubernetes and Chaos Mesh manifests
- [ ] Actions workflow and successful automated test/build evidence
- [ ] Actual worker recovery, two-replica, and one-replica gate artifacts
- [ ] Completed results table with no invented measurements
- [ ] Report with problem, architecture, implementation, test cases, evaluation, limitations, conclusion
- [ ] Demonstration screenshots linked to run IDs and commit SHA
- [ ] Cleanup of PodChaos and isolated test resources
