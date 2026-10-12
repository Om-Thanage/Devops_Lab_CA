# Troubleshooting and safe recovery

Run these commands on the Linux runner host. The workflow requires `kubectl config current-context` to be `minikube`; never change to an unrelated cluster to make a demo pass.

| Symptom | Diagnostic command and interpretation | Safe correction |
|---|---|---|
| Docker unavailable | `docker info`: daemon connection error means Docker is stopped or the runner lacks socket access | Start Docker; give the dedicated runner account the necessary local access, then reconnect the runner |
| Minikube fails to start | `minikube logs --problems`: look for Docker/resource errors | Check `docker info`, free memory/disk, then retry the pinned v1.35.2 command in README |
| Wrong Kubernetes context | `kubectl config current-context`: anything other than `minikube` is unsafe for this workflow | `kubectl config use-context minikube`; verify `kubectl get nodes` |
| Chaos Mesh install fails | `helm -n chaos-mesh status chaos-mesh` and `kubectl -n chaos-mesh get pods`: inspect Pending/CrashLoop pods | Check `kubectl -n chaos-mesh describe pod <pod-name>` and node resources; retry the documented Helm command only after fixing the cause |
| PodChaos does not start | `kubectl -n resilience-lab describe podchaos resilience-pod-kill` and `kubectl -n chaos-mesh logs deployment/chaos-controller-manager --tail=100`: inspect validation/controller errors | Confirm `kubectl get crd podchaos.chaos-mesh.org`, controller readiness, and experiment namespace annotation |
| Selector misses pods | `kubectl -n resilience-lab get pods -l app=resilience-api --show-labels`: no matching pods means wrong namespace/label | Compare `chaos/pod-kill.yaml` with `k8s/deployment.yaml`; apply the intended manifests |
| Image unavailable | `kubectl -n resilience-lab describe pod <pod-name>`: `ErrImageNeverPull` means an API or worker image is absent in Minikube | Rebuild and `minikube image load <exact-image-tag>`; ensure Deployment tag matches |
| Database not ready | `kubectl -n resilience-lab get pods,pvc` and `kubectl -n resilience-lab logs deployment/ticketing-db --tail=100` | Ensure the PVC is Bound and `ticketing-secrets` existed before the first database start; do not recreate its password against an existing PVC |
| API startup or health fails | `kubectl -n resilience-lab logs deployment/resilience-api --tail=100` and `curl "http://$(minikube ip):30080/health"` | Check database readiness, secret keys, Service endpoints, and API rollout |
| Worker events stay pending | `kubectl -n resilience-lab logs deployment/notification-worker --tail=100` | Check worker rollout and `worker-token` secret; restart the worker only after fixing its error |
| Workflow not triggered | GitHub Actions tab and `git branch --show-current`: workflow triggers only on `main` push or manual dispatch | Enable Actions, push trusted commit to `main`, or use **Run workflow** |
| Runner offline or lacks permission | Repository **Settings → Actions → Runners** and runner terminal: offline/unmatched labels queue the job | Start the registered Linux runner from a directory outside the repository; ensure label `resilience-lab`, connectivity, and access to Docker/Minikube |
| Gate times out or says no pod replaced | `kubectl -n resilience-lab get podchaos,pods,events` and gate JSON: inspect whether a matching pod was deleted | Check Chaos Mesh controller/daemon, selectors and annotation; rerun after cleanup |
| Resources remain after interruption | `kubectl -n resilience-lab get podchaos,pods` | `kubectl -n resilience-lab delete podchaos resilience-pod-kill --ignore-not-found`; wait for recovery with `kubectl -n resilience-lab rollout status deployment/resilience-api` |

The Actions artifact includes `results/worker-recovery.json` and `results/latest.json` when those checks reach measurement, plus Kubernetes status and application/worker logs. If a preliminary check fails, no measurements exist; use the job log to diagnose setup. A `FAIL` is a measured gate rejection, while `gate error` signals setup/command failure.
