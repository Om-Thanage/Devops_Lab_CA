# Continuous Resilience Testing in CI/CD Using Chaos Mesh

## Purpose and architecture

**Problem:** a conventional pipeline can pass unit tests while a release loses service availability after a pod failure. **Objective:** make a measured Kubernetes fault experiment a release gate. This repository supplies a small Express 5 inventory API using ECMAScript modules, automated tests, a Docker image, a two-replica Kubernetes deployment, one Chaos Mesh `PodChaos` experiment, and a GitHub Actions gate.

```text
push to private GitHub main
  -> Linux self-hosted runner: checks + tests + Docker build
  -> minikube image load -> Kubernetes test deployment
  -> NodePort health samples -> Chaos Mesh kills one pod
  -> availability/recovery calculation -> gate
  -> pass: eligible for promotion; fail: promotion step skipped
```

**Selected execution architecture:** a repository-scoped Linux x86-64 self-hosted GitHub Actions runner on the same host as Docker and Minikube. The runner has `node`, `npm`, `python3`, `docker`, `kubectl`, and `minikube` in `PATH`. Minikube uses the Docker driver and containerd runtime. The pipeline builds an image tagged with the commit SHA and loads it into Minikube; no registry credential is needed. This is simpler and more repeatable for a student demonstration than installing a fresh Minikube, Chaos Mesh, and runner prerequisites inside every GitHub-hosted job. An ephemeral cluster on a hosted runner could work after validating privileged Chaos Mesh components, nested container runtime access, and job time limits; it adds setup time and failure modes to every run. A GitHub-hosted runner cannot reach the laptop's private cluster by default. The cost is a persistent, trusted runner that must be online and secured. The project deliberately avoids Istio, Flagger, canary routing, and registry promotion.

| Lab CA requirement | Implemented by |
|---|---|
| Git/GitHub | Commit this repository to a private GitHub repository; `push` to `main` triggers Actions |
| Application build | `npm run build` checks the deployable Node source |
| Automated tests | `npm test` exercises `/health`, `/items`, and 404 behaviour |
| Docker | `Dockerfile` and `docker build` |
| CI/CD | `.github/workflows/resilience.yml` |
| Deployment | `k8s/` manifests in local Minikube |
| Documentation | This guide and `docs/` |
| Demonstration | `docs/demo.md`, Actions evidence artifact, and actual gate output |

## Stack and prerequisites

Assumed host: **Ubuntu 24.04 x86-64**, with at least 4 CPU cores, 8 GiB RAM, and 25 GiB free disk. Windows users can use an Ubuntu machine or WSL2 with working Docker access and a Linux runner; verify that the runner and Minikube use the same `kubectl` context. Use a **private repository** with trusted collaborators only. The workflow triggers on `push` to `main` and manual dispatch, never on external pull requests.

Install Docker Engine, Node.js **22**, Python **3.10+**, `git`, `curl`, `kubectl`, Helm **3**, and Minikube using the linked official installers: [Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/), [Node.js downloads](https://nodejs.org/en/download), [Python on Unix](https://docs.python.org/3/using/unix.html), [kubectl on Linux](https://kubernetes.io/docs/tasks/tools/install-kubectl-linux/), [Helm installation](https://helm.sh/docs/intro/install/), and [Minikube start](https://minikube.sigs.k8s.io/docs/start/). Follow each installer for the current package version and then verify:

```bash
git --version; node --version; npm --version; python3 --version
docker version; kubectl version --client; helm version; minikube version
```

The Docker daemon must answer `docker info`. A host running the Actions runner needs outbound access to GitHub. It must be able to reach `http://$(minikube ip):30080` from its own shell. If Docker's group is granted to the runner account, treat that account as having host-level privileges. Keep secrets and unrelated workloads off this machine. Register the runner **only with this private repository**, use the custom `resilience-lab` label, and do not run untrusted PR workflows. See [GitHub's runner setup](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners) and [security guidance](https://docs.github.com/en/actions/reference/security/secure-use).

## One-time setup

Run on the Linux host as the same user that will run GitHub Actions:

```bash
minikube start --driver=docker --container-runtime=containerd --cpus=4 --memory=6144
kubectl config current-context  # must print minikube
docker info
minikube status
helm repo add chaos-mesh https://charts.chaos-mesh.org
helm repo update
helm upgrade --install chaos-mesh chaos-mesh/chaos-mesh \
  --namespace chaos-mesh --create-namespace --version 2.8.4 \
  --set chaosDaemon.runtime=containerd \
  --set chaosDaemon.socketPath=/run/containerd/containerd.sock \
  --set controllerManager.enableFilterNamespace=true
kubectl -n chaos-mesh get pods
kubectl get crd podchaos.chaos-mesh.org
```

Wait until controller, daemon, and other installed components are healthy. Chaos Mesh's daemon requires privileged access to the node/container runtime; install it **only in the isolated local lab cluster**. The namespace filter confines injection to namespaces annotated `chaos-mesh.org/inject=enabled`; `k8s/namespace.yaml` provides that annotation. The experiment additionally selects only `app=resilience-api` in `resilience-lab`. The installation values and PodChaos fields follow [Chaos Mesh 2.8.4 installation](https://chaos-mesh.org/docs/production-installation-using-helm/), [namespace filtering](https://chaos-mesh.org/docs/configure-enabled-namespace/), and [PodChaos](https://chaos-mesh.org/docs/simulate-pod-chaos-on-kubernetes/).

Create an **empty private GitHub repository** without generated starter files. In this project directory, run the following, replacing `ACCOUNT/REPOSITORY` with the repository path GitHub gives you:

```bash
git add .
git commit -m "Build resilience testing lab"
git remote add origin https://github.com/ACCOUNT/REPOSITORY.git
git push -u origin main
```

On its **Settings → Actions → Runners → New self-hosted runner** page, choose Linux x64 and execute the download, checksum, configuration, and start commands displayed there. Registration tokens and runner versions change, so use the generated commands rather than a copied token. Add `resilience-lab` to the runner labels during configuration. Check the runner shows **Idle**. A repository runner is scoped to this repository; an organization runner needs an access group restricted to this repository. Do not trigger code from untrusted contributors on this runner.

Clone the project on any machine with Git using the URL of **your** private repository:

```bash
git clone <your-private-repository-url>
cd <cloned-directory>
npm ci --ignore-scripts
npm run check
npm test
npm run build
npm start
```

With `npm start` running, `curl http://127.0.0.1:3000/health` returns `{"status":"ok"}` and `curl http://127.0.0.1:3000/items` returns one sample inventory item. `GET /health` is both the Kubernetes readiness/liveness endpoint and the gate's HTTP target. Unknown paths return JSON 404. The server closes on SIGTERM/SIGINT and logs startup as JSON.

## Each pipeline run

The workflow checks the Minikube context and Chaos Mesh CRD, runs quality checks and unit tests, builds the Docker image, loads it with `minikube image load`, applies namespace/service/deployment, waits for ready replicas, runs the chaos gate, and uploads JSON/Kubernetes/log evidence even if the gate fails. Its final "Promote verified candidate" step is a **promotion decision marker**, not a production deployment. A failing gate skips it. No release target was specified in the assignment.

To do a local full run from this repository on the Linux host (use a unique tag if rerunning):

```bash
docker build -t resilience-api:local .
minikube image load resilience-api:local
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/deployment.yaml
kubectl -n resilience-lab rollout status deployment/resilience-api --timeout=120s
kubectl -n resilience-lab get pods,deploy,svc
curl "http://$(minikube ip):30080/health"
python3 scripts/resilience_gate.py --url "http://$(minikube ip):30080" --replicas 2
```

For a push-driven run, commit and push to `main`, then open the repository **Actions → Resilience gate** and follow each stage. Manual **Run workflow** defaults to 2 replicas and 95% minimum availability. Jobs are serialized by the cluster concurrency group. A new image tag prevents accidentally assessing an older candidate.

## Experiment and gate

**Steady state:** two ready replicas behind the `resilience-api` NodePort Service; `/health` responds successfully. **Fault:** Chaos Mesh `PodChaos` with `mode: one` and `action: pod-kill` terminates one selected pod once. **Hypothesis:** the remaining replica maintains at least **95%** successful health requests in a 40-second fault window; any detected outage recovers within **10 seconds**; a pod is actually replaced and the original replica count becomes ready again. These values are **demonstration targets**, not industry standards.

The Python gate takes a 3-second clean baseline, deletes any old one-shot PodChaos, applies `chaos/pod-kill.yaml`, sends health requests every 0.2 seconds for 40 seconds, and checks that an original pod UID disappeared. It then waits for rollout and checks ready replica count and final health. Availability = successful requests ÷ total requests × 100. Recovery time = the longest observed span from a failed sample to the next successful sample; it is 0 if no request failed, and undefined if an outage had not recovered by the end of the window. All criteria must pass. Exit codes: **0 pass**, **1 measured gate failure**, **2 setup/command error**. `results/latest.json` contains measured values. Sampling is from one runner to one NodePort, so it estimates availability at that probe frequency and does not measure user latency or traffic from multiple regions. A one-time pod kill has no duration; the 40 seconds is the observation window.

For manual observation while an Actions run is in progress:

```bash
kubectl -n resilience-lab get podchaos resilience-pod-kill -o yaml
kubectl -n resilience-lab get pods -l app=resilience-api -w
kubectl -n resilience-lab get events --sort-by=.lastTimestamp
```

The gate cleans up PodChaos even when it fails. If an interruption prevents cleanup, run `kubectl -n resilience-lab delete podchaos resilience-pod-kill --ignore-not-found`.

## Failure demonstration and evaluation

Choose **Run workflow → replicas `1` → min_availability `100`**. The same real pod-kill experiment now has no surviving replica while Kubernetes starts a replacement. The expected result is failed HTTP probes, a measured availability below 100%, and a `FAIL` gate; the promotion marker is skipped. Timing depends on the host, so inspect the actual JSON rather than assuming a result. Correct the topology by rerunning with **2 replicas and 95%**. A failure scenario is meaningful only if the artifact shows a pod replacement and actual failed requests. If it does not, rerun or investigate; do not label it a demonstrated failure.

Record baseline and fault-window counts in [results template](docs/results-template.md). Compare normal versus injected-fault availability, then state whether the hypothesis was supported by that run. No experimental outcome is claimed by this repository alone.

## File map

| Path | Purpose |
|---|---|
| `src/server.js`, `tests/server.test.js`, `package.json` | API, unit tests, build/check scripts |
| `Dockerfile`, `.dockerignore` | Minimal non-root container image |
| `k8s/` | Restricted namespace, two-replica deployment, NodePort Service |
| `chaos/pod-kill.yaml` | One-pod fault, explicitly scoped to application |
| `scripts/resilience_gate.py` | Baseline, injection, measured HTTP gate, cleanup, JSON evidence |
| `.github/workflows/resilience.yml` | Automated delivery and release decision |
| `docs/` | Demo, report, results, troubleshooting, viva |

## Cleanup, limits, and next steps

```bash
kubectl -n resilience-lab delete podchaos resilience-pod-kill --ignore-not-found
kubectl delete namespace resilience-lab --ignore-not-found
# Only when finished with the dedicated lab cluster:
helm uninstall chaos-mesh -n chaos-mesh
kubectl delete namespace chaos-mesh --ignore-not-found
minikube stop
```

The project tests one pod failure on one local node and one HTTP health path. It does not prove production resilience or deploy a production release. If later required, add a second independent node or a measured network fault, longer repeated trials, latency/functional probes, and an actual protected promotion environment. Each addition should have its own measurable hypothesis.

See [troubleshooting](docs/troubleshooting.md), [live demo](docs/demo.md), [report outline](docs/report.md), and [viva guide](docs/viva.md).
