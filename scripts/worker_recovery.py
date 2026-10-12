#!/usr/bin/env python3
"""Show that ticket updates queue while the notification worker is unavailable."""
import argparse
import json
import subprocess
import sys
import time
import urllib.request
from pathlib import Path


def request(url, path, method='GET', body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(url + path, data=data, method=method,
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=3) as response:
        return json.load(response)


def worker_pods():
    output = subprocess.check_output(['kubectl', '-n', 'resilience-lab', 'get', 'pods',
                                      '-l', 'app=notification-worker', '-o', 'json'], text=True)
    return json.loads(output)['items']


def notification(url, ticket_id):
    items = request(url, '/api/notifications')['notifications']
    return next((item for item in items if item['ticket_id'] == ticket_id), None)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', required=True)
    parser.add_argument('--output', default='results/worker-recovery.json')
    args = parser.parse_args()
    scale = ['kubectl', '-n', 'resilience-lab', 'scale', 'deployment/notification-worker']
    if not worker_pods():
        raise RuntimeError('notification worker must be running before this check')
    subprocess.run([*scale, '--replicas=0'], check=True)
    try:
        deadline = time.monotonic() + 60
        while worker_pods() and time.monotonic() < deadline:
            time.sleep(1)
        if worker_pods():
            raise RuntimeError('worker did not stop')
        ticket = request(args.url, '/api/tickets', 'POST',
                         {'title': f'Worker outage check {time.time_ns()}',
                          'description': 'Notification must wait in the outbox',
                          'requester': 'CI pipeline', 'priority': 'normal'})
        pending = notification(args.url, ticket['id'])
        queued = bool(pending and pending['delivered_at'] is None)
    finally:
        subprocess.run([*scale, '--replicas=1'], check=True)
    subprocess.run(['kubectl', '-n', 'resilience-lab', 'rollout', 'status',
                    'deployment/notification-worker', '--timeout=120s'], check=True)
    deadline = time.monotonic() + 45
    delivered = False
    while time.monotonic() < deadline:
        item = notification(args.url, ticket['id'])
        if item and item['delivered_at']:
            delivered = True
            break
        time.sleep(1)
    result = {'ticket_id': ticket['id'], 'queued_while_worker_down': queued,
              'delivered_after_recovery': delivered,
              'gate': 'PASS' if queued and delivered else 'FAIL'}
    path = Path(args.output)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))
    return 0 if queued and delivered else 1


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, subprocess.CalledProcessError, RuntimeError) as error:
        print(f'worker recovery error: {error}', file=sys.stderr)
        sys.exit(2)
