#!/usr/bin/env python3
"""Measure HTTP availability while Chaos Mesh kills one application pod."""
import argparse
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

NAMESPACE = 'resilience-lab'
SELECTOR = 'app=resilience-api'
EXPERIMENT = 'chaos/pod-kill.yaml'


def kubectl(*args):
    return subprocess.run(['kubectl', *args], check=True, capture_output=True, text=True).stdout


def pods():
    data = json.loads(kubectl('-n', NAMESPACE, 'get', 'pods', '-l', SELECTOR, '-o', 'json'))
    return {item['metadata']['uid'] for item in data['items']}


def request_json(url, path, method='GET', body=None):
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(url + path, data=data, method=method,
                                     headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=2) as response:
        return response.status, json.load(response)


def probe(url, ticket_id):
    try:
        health_status, health = request_json(url, '/health')
        ticket_status, ticket = request_json(url, f'/api/tickets/{ticket_id}')
        return health_status == ticket_status == 200 and health.get('status') == 'ok' and ticket.get('id') == ticket_id
    except (OSError, ValueError, urllib.error.URLError):
        return False


def measure(url, ticket_id, seconds, interval):
    observations = []
    start = time.monotonic()
    while time.monotonic() - start < seconds:
        at = time.monotonic()
        observations.append((at, probe(url, ticket_id)))
        time.sleep(max(0, interval - (time.monotonic() - at)))
    return observations


def summarize(observations):
    success = sum(ok for _, ok in observations)
    failures = len(observations) - success
    recovery = 0.0
    outage_start = None
    for at, ok in observations:
        if not ok and outage_start is None:
            outage_start = at
        elif ok and outage_start is not None:
            recovery = max(recovery, at - outage_start)
            outage_start = None
    if outage_start is not None:
        recovery = None
    return {'total': len(observations), 'successful': success, 'failed': failures,
            'availability_percent': round(success * 100 / len(observations), 2),
            'recovery_seconds': None if recovery is None else round(recovery, 3)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', required=True)
    parser.add_argument('--replicas', type=int, default=2)
    parser.add_argument('--min-availability', type=float, default=95)
    parser.add_argument('--max-recovery', type=float, default=10)
    parser.add_argument('--output', default='results/latest.json')
    parser.add_argument('--duration', type=float, default=40)
    parser.add_argument('--interval', type=float, default=0.2)
    args = parser.parse_args()
    if args.replicas < 1 or not 0 <= args.min_availability <= 100 or args.duration <= 0 or args.interval <= 0:
        parser.error('invalid threshold or measurement setting')

    before = pods()
    if len(before) != args.replicas:
        raise RuntimeError(f'expected {args.replicas} pods, found {len(before)}')
    created_status, ticket = request_json(args.url, '/api/tickets', 'POST',
                                          {'title': f'CI resilience check {time.time_ns()}',
                                           'description': 'Verify ticket survives an API pod failure',
                                           'requester': 'CI pipeline', 'priority': 'high'})
    if created_status != 201:
        raise RuntimeError('ticket creation failed')
    ticket_id = ticket['id']
    baseline = summarize(measure(args.url, ticket_id, 3, args.interval))
    if baseline['failed']:
        raise RuntimeError('baseline health failed; no chaos injected')

    # Remove a previous one-shot resource so every invocation creates a new fault.
    kubectl('-n', NAMESPACE, 'delete', 'podchaos', 'resilience-pod-kill', '--ignore-not-found')
    try:
        kubectl('apply', '-f', EXPERIMENT)
        observations = measure(args.url, ticket_id, args.duration, args.interval)
        during = summarize(observations)
        after = pods()
        injected = len(before - after) > 0
        rollout = subprocess.run(['kubectl', '-n', NAMESPACE, 'rollout', 'status',
                                  'deployment/resilience-api', '--timeout=90s'], capture_output=True).returncode == 0
        ready = int(kubectl('-n', NAMESPACE, 'get', 'deployment', 'resilience-api',
                            '-o', 'jsonpath={.status.readyReplicas}').strip() or '0')
        healthy = probe(args.url, ticket_id)
        try:
            update_status, updated = request_json(args.url, f'/api/tickets/{ticket_id}', 'PATCH',
                                                  {'status': 'resolved', 'assignee': 'CI pipeline'})
            workflow_complete = update_status == 200 and updated.get('status') == 'resolved'
        except (OSError, ValueError, urllib.error.URLError):
            workflow_complete = False
        passed = (injected and rollout and ready == args.replicas and healthy and workflow_complete
                  and during['availability_percent'] >= args.min_availability
                  and during['recovery_seconds'] is not None
                  and during['recovery_seconds'] <= args.max_recovery)
        result = {'experiment': 'pod-kill', 'replicas': args.replicas,
                  'fault': 'one pod termination', 'measurement_seconds': args.duration,
                  'baseline': baseline, 'during_fault': during, 'pod_replaced': injected,
                  'rollout_complete': rollout, 'ready_replicas': ready,
                  'final_health': healthy, 'ticket_id': ticket_id,
                  'ticket_workflow_complete': workflow_complete,
                  'min_availability_percent': args.min_availability,
                  'max_recovery_seconds': args.max_recovery, 'gate': 'PASS' if passed else 'FAIL'}
        path = Path(args.output)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(result, indent=2) + '\n')
        print(json.dumps(result, indent=2))
        return 0 if passed else 1
    finally:
        kubectl('-n', NAMESPACE, 'delete', 'podchaos', 'resilience-pod-kill', '--ignore-not-found')


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (subprocess.CalledProcessError, RuntimeError, urllib.error.URLError) as exc:
        print(f'gate error: {exc}', file=sys.stderr)
        sys.exit(2)
