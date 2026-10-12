# Actual run record

Leave these measured fields blank until the **ticketing version** runs. Copy values from its GitHub Actions JSON artifacts. The earlier inventory API's measurements are different experiments.

| Field | Worker recovery | Two API replicas | One API replica |
|---|---|---|---|
| Run URL and commit SHA | | | |
| Ticket ID | | | |
| Fault / outage | Worker scaled to zero | One API pod kill | One API pod kill |
| Initial API replicas | 2 | 2 | 1 |
| Worker event queued while down | | n/a | n/a |
| Worker event delivered after recovery | | n/a | n/a |
| Baseline total / successful / failed | n/a | | |
| Fault-window total / successful / failed | n/a | | |
| Measured ticket availability % | n/a | | |
| Longest recovery, seconds | n/a | | |
| Minimum availability target % | n/a | 95 | 100 |
| Maximum recovery target, seconds | n/a | 10 | 10 |
| API pod replaced and ready replicas | n/a | | |
| Ticket workflow completed | n/a | | |
| Gate result | | | |
| Evidence artifact / screenshot IDs | | | |

Availability = successful composite probes ÷ all composite probes × 100. Each composite probe checks database-backed `/health` and reads the created ticket. Recovery is the longest span from the first failed sample to the next successful one; it is zero when no sampled request fails. At 0.2-second intervals a short outage may be missed, so report *sampled* availability. A pod kill without a replaced original pod UID is invalid evidence, even if every request succeeds.
