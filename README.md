# KJ Somaiya School of Engineering Helpdesk: Resilience Testing in CI/CD

A small campus support platform used to demonstrate a complete DevOps pipeline. A student opens a ticket, an agent assigns and resolves it, and a notification worker processes updates. GitHub Actions builds and tests the services, deploys them to Minikube, and uses Chaos Mesh to kill an API pod. A measured gate decides whether the candidate may be promoted.

The project's focus is the **delivery and resilience decision**. The web app gives that decision a real workflow to protect. See the [live demonstration story](docs/demo.md).

```text
GitHub main → EC2 self-hosted runner → tests → two Docker images
             → Minikube: API (2 pods) + worker (1 pod) + PostgreSQL (PVC)
             → worker outage / queued update recovery
             → Chaos Mesh API pod kill / ticket request measurements
             → PASS: promotion decision marker; FAIL: marker skipped
```

## What each component does

| Component | Responsibility |
|---|---|
| Express API and web UI | Create, list, assign, and resolve tickets; expose `/health` and notification activity |
| PostgreSQL | Persist tickets and queued notification events across API pod replacements |
| Notification worker | Poll an authenticated internal API for pending events and mark them delivered in the demo log |
| Chaos Mesh | Terminate one selected API pod inside the `resilience-lab` namespace |
| Python gates | Verify queued worker recovery and measure ticket availability during the pod fault |
| GitHub Actions | Build, test, deploy, run gates, and retain JSON and Kubernetes evidence |

The worker logs simulated deliveries; it does not send real email. There is no login or role authorization in this educational app, so do not expose its NodePort to the public internet or use it for real support requests.

## Lab requirement mapping

| Requirement | Evidence |
|---|---|
| Git/GitHub | Versioned private repository and commit SHA in every run |
| Application build and tests | `npm run build`, `npm test`, Python unit tests |
| Docker | `Dockerfile` and `Dockerfile.worker` |
| CI/CD | `.github/workflows/resilience.yml`, push and manual triggers |
| Deployment | Kubernetes API, worker, PostgreSQL, Service, and PVC manifests |
| Documentation and demo | This README, `docs/`, JSON artifacts, Actions run logs |

## Tested lab architecture

Ubuntu 24.04 on an EC2 `m7i-flex.large` (2 vCPU, 8 GiB RAM), Docker, Node 22, Python 3, kubectl, Helm 3, Minikube with Docker driver and containerd, Kubernetes **v1.35.2**, and Chaos Mesh **v2.8.4**. The repository-scoped Linux x64 GitHub Actions runner runs as `ubuntu` on the same EC2 host. The runner directory belongs **outside** this repository, for example `~/actions-runner`; putting it below this project's `"type": "module"` package can break the runner's own CommonJS scripts.

The runner requires the custom `resilience-lab` label and access to Docker and the Minikube context. Keep the repository private and run only trusted code on this persistent self-hosted runner. The app Service is a Minikube NodePort (`30080`) reachable from EC2; keep EC2 inbound security-group access limited to SSH. See [GitHub's self-hosted runner documentation](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners).

### One-time cluster setup

These commands run on the EC2 Ubuntu host as `ubuntu`. Skip components you have already installed. Chaos Mesh 2.8 supports Kubernetes 1.35; see its [supported releases](https://chaos-mesh.org/supported-releases/).

```bash
minikube start --driver=docker --container-runtime=containerd \
  --kubernetes-version=v1.35.2 --cpus=2 --memory=5120
kubectl wait --for=condition=Ready node/minikube --timeout=180s

helm repo add chaos-mesh https://charts.chaos-mesh.org
helm repo update
helm upgrade --install chaos-mesh chaos-mesh/chaos-mesh \
  --namespace chaos-mesh --create-namespace --version 2.8.4 \
  --set chaosDaemon.runtime=containerd \
  --set chaosDaemon.socketPath=/run/containerd/containerd.sock \
  --set controllerManager.enableFilterNamespace=true \
  --set controllerManager.replicaCount=1 \
  --set dashboard.create=false
kubectl -n chaos-mesh get pods
kubectl get crd podchaos.chaos-mesh.org
```

The namespace annotation in `k8s/namespace.yaml` enables injection only for this lab namespace. The PodChaos selector narrows the fault to `app=resilience-api`. See the [Chaos Mesh Helm instructions](https://chaos-mesh.org/docs/production-installation-using-helm/) and [namespace filtering](https://chaos-mesh.org/docs/configure-enabled-namespace/).

Create one Kubernetes Secret before the new workflow runs. Its random values stay in the cluster and are never printed or committed. **Do this only once while the PostgreSQL PVC is new; changing the database password afterward requires a database password change too.**

```bash
kubectl apply -f k8s/namespace.yaml
kubectl -n resilience-lab create secret generic ticketing-secrets \
  --from-literal=db-password="$(openssl rand -hex 24)" \
  --from-literal=worker-token="$(openssl rand -hex 24)"
```

The two keys are `db-password` and `worker-token`. The API and PostgreSQL read the first; the API and worker read the second. There are no GitHub repository secrets for this local-cluster build.

## Develop and check

```bash
npm ci --ignore-scripts
npm run check
npm test
python3 -m unittest discover -s tests -p 'test_*.py'
npm run build
```

`npm run build` validates the deployable JavaScript source because no transpilation is needed. Docker creates the deployable artifacts. The Node unit test uses an in-memory test store; the full Actions deployment and Python gates exercise PostgreSQL and Kubernetes.

### API endpoints

| Endpoint | Behaviour |
|---|---|
| `GET /` | Ticketing web UI |
| `GET /health` | Checks database connectivity and returns `{ "status": "ok" }` |
| `GET /api/tickets` | Lists recent tickets |
| `POST /api/tickets` | Creates a ticket from `title`, `requester`, optional `description` and `priority` |
| `GET /api/tickets/:id` | Reads one persisted ticket |
| `PATCH /api/tickets/:id` | Sets `status` to `open`, `in_progress`, or `resolved`, and `assignee` |
| `GET /api/notifications` | Shows pending and delivered demo events |

Internal notification endpoints require the secret worker token. The browser uses text nodes when displaying user input to avoid HTML injection.

## Manual deployment on EC2

Run from the repository directory after the one-time setup:

```bash
docker build -t resilience-api:local .
docker build -f Dockerfile.worker -t helpdesk-worker:local .
minikube image load resilience-api:local
minikube image load helpdesk-worker:local
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/postgres.yaml
kubectl -n resilience-lab rollout status deployment/ticketing-db --timeout=180s
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/worker.yaml
kubectl -n resilience-lab rollout status deployment/resilience-api --timeout=120s
kubectl -n resilience-lab rollout status deployment/notification-worker --timeout=120s
kubectl -n resilience-lab get pods,deploy,svc,pvc
curl "http://$(minikube ip):30080/health"
```

For the web UI on your PC, open an SSH tunnel to EC2 and port-forward the Kubernetes Service there. In one EC2 terminal run `kubectl -n resilience-lab port-forward service/resilience-api 8080:80`. On the PC, in a second terminal, run `ssh -i <path-to-your-pem> -L 8080:127.0.0.1:8080 ubuntu@<ec2-public-ip>`, then open `http://localhost:8080`. Keep both terminals open while using the UI. This does not require opening port 30080 in the EC2 security group.

### Demo tickets

The Actions workflow adds eight fictional KJ Somaiya School of Engineering support tickets after deployment. They use Indian student, faculty, and technician names and cover Wi-Fi, classrooms, student access, labs, and the library. The initial mix of open, in-progress, and resolved tickets fills the dashboard and creates notification events for the worker. The script skips matching tickets already returned by the API, so rerunning it during a normal demo does not duplicate the seed set.

For a manual deployment, run this once from the repository directory on EC2 after the API is ready:

```bash
node scripts/seed-demo.js --url "http://$(minikube ip):30080"
```

Or, while the `kubectl port-forward` above is active, run `node scripts/seed-demo.js --url http://127.0.0.1:8080`. The seed command creates demo records only when invoked directly or by the workflow; starting the API alone never inserts them. It does not delete existing tickets. The API lists the latest 100 tickets, so this skip check assumes the seed records are still in that window.

## Pipeline and resilience checks

The workflow on `main` or **Actions → Resilience gate → Run workflow** checks tools, runs Node/Python tests, builds both images with the commit SHA, loads them into Minikube, deploys the database and services, and verifies ready replicas. It then runs two checks:

1. `scripts/worker_recovery.py` scales the notification worker to zero, creates a ticket, verifies its notification is queued, restores the worker, and verifies delivery. A `finally` block restores the worker even on a failed check.
2. `scripts/resilience_gate.py` creates a ticket, records a 3-second baseline, applies `chaos/pod-kill.yaml`, samples `/health` and `GET /api/tickets/:id` every 0.2 seconds for 40 seconds, checks pod replacement and restored replicas, and resolves the ticket. The gate requires at least **95% sampled availability** and recovery within **10 seconds** by default. These are lab demonstration thresholds.

Only a passing gate reaches the **Promote verified candidate** step, which is a decision marker, not a production deployment. JSON and Kubernetes/log evidence are uploaded even if a gate fails.

Run the gates manually after deployment with:

```bash
python3 scripts/worker_recovery.py --url "http://$(minikube ip):30080"
python3 scripts/resilience_gate.py --url "http://$(minikube ip):30080" --replicas 2
cat results/worker-recovery.json
cat results/latest.json
```

For the failure demonstration, manually dispatch the workflow with `replicas=1` and `min_availability=100`. A real failed probe during the single-pod outage should produce `FAIL` and skip promotion. Confirm the actual JSON; timing can cause a run to miss a brief outage. Rerun with two replicas and 95% to demonstrate the correction.

## Evidence, limitations, and cleanup

Follow [the demonstration story](docs/demo.md), fill in [the results template](docs/results-template.md), and use the [report outline](docs/report.md). Use the JSON and Actions log as the source for measured outcomes; do not reuse results from the earlier inventory API.

This is one Minikube node with a single PostgreSQL instance. The API has two replicas, but the database is a single point of failure. The worker's delivery log is a simulation, and the UI lacks authentication. Sampled availability from one probe client does not establish production reliability. A future version could use a managed/high-availability database, identity and roles, real email delivery, and repeated multi-node experiments.

To remove the lab application after saving evidence:

```bash
kubectl -n resilience-lab delete podchaos resilience-pod-kill --ignore-not-found
kubectl delete namespace resilience-lab
```

Deleting the namespace also deletes the ticketing PVC and its database data. To pause without removing data, use `minikube stop` and stop the EC2 instance when your demo is finished.
