# Live demonstration story: campus Wi-Fi outage

**Characters:** A student reports that campus Wi-Fi fails before an exam. A helpdesk agent assigns the ticket to a technician. The CI pipeline must prove a new release keeps that ticket available when an API pod disappears.

**Claim to test:** With two API replicas, a single pod failure should preserve at least 95% of sampled ticket read requests, recover any observed outage within 10 seconds, replace the pod, and leave the ticket workflow usable. These are lab targets, not production service levels.

## Scene 1 — The report (about one minute)

Open the KJ Somaiya School of Engineering helpdesk web page through an SSH tunnel and `kubectl port-forward -n resilience-lab service/resilience-api 8080:80` as described in README. Visit `http://localhost:8080` on your PC. Show the seeded mix of open, in-progress, and resolved requests. If this was a manual deployment, run the demo seed command in README first. Create a high-priority ticket titled **Campus Wi-Fi unavailable before exam**, with a student name and short description. Show its ID and `open` status. Assign it to a technician and move it to `in progress`.

Explain: the browser talks to the API service; two API pods share ticket data in PostgreSQL. The notification worker handles queued updates separately. The UI's notification activity shows pending or delivered events; no real email is sent.

## Scene 2 — The delivery pipeline (about two minutes)

Show the GitHub commit, then Actions → **Resilience gate**. The workflow runs source checks and tests, builds separate API and worker images, loads them into Minikube, deploys PostgreSQL and both services, and waits for ready replicas. Show `kubectl -n resilience-lab get pods,deploy,svc,pvc`.

Explain: GitHub Actions runs on the repository's EC2 self-hosted runner, which can reach its local Minikube cluster. The PostgreSQL PVC preserves tickets when API pods are replaced.

## Scene 3 — A worker outage (about one minute)

Show the **Verify queued notifications recover** step. It stops the worker, creates a ticket, verifies its notification is pending, restarts the worker, and verifies the event becomes delivered. The JSON artifact records `queued_while_worker_down` and `delivered_after_recovery`. Ticket creation continues while the worker is down.

## Scene 4 — An API pod failure (about two minutes)

Show `chaos/pod-kill.yaml`: it targets only `app=resilience-api` in `resilience-lab`. In a second terminal, watch `kubectl -n resilience-lab get pods -l app=resilience-api -w`. In Actions, show **Inject fault and evaluate resilience**. The Python gate creates a real ticket, checks both `/health` and that ticket throughout the 40-second fault window, then resolves the ticket after the pod is replaced.

Read the actual JSON: baseline and fault-window counts, availability, longest recovery, `pod_replaced`, `ready_replicas`, `ticket_workflow_complete`, and `gate`. Only call the run a pass if the measured gate says `PASS`. Show the final promotion marker and downloaded evidence artifact.

## Scene 5 — The unsafe topology (about one minute)

Use **Run workflow** with `replicas=1` and `min_availability=100`. The same pod kill now removes the only API pod. Show the actual failed ticket probes, `FAIL`, and the skipped promotion marker. If no failed sample is observed, repeat the experiment rather than claiming an outage.

## Scene 6 — Correction (about one minute)

Run again with `replicas=2` and `min_availability=95`. Show the new measured result and compare it with the failed run. Do not copy the earlier inventory API's measurements into this ticketing version; use only evidence from the updated pipeline.

## Evidence to capture

| Capture | What it proves |
|---|---|
| Ticket UI: open, assigned, resolved | Real workflow and persistent data |
| Git commit and Actions run URL | Versioned automatic delivery |
| Test and Docker build logs | Automated checks and separate images |
| Pods, Deployments, Service, PVC | Deployed microservices and database |
| Worker recovery JSON | Queued updates survived a worker outage |
| Pod watch and Chaos Mesh resource | Scoped fault and pod replacement |
| Passing and failing gate JSON | Measured release decision |
| Skipped promotion on failed run | CI/CD gate blocked the release marker |

The demonstration uses a simulated notification log. It does not send external email or promote to a production environment.
