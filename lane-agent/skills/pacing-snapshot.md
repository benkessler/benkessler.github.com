# Pacing snapshot

Fast and cheap. For each client in scope: month-to-date spend, leads, calls, cost per lead, projected month-end for each vs goal, and open urgent issues from `perf-sweep:last:<client>`.

Write the snapshot to `set_state` key `pacing:snapshot` (JSON with a timestamp). If any client is projected to miss a goal by more than 20% or overspend budget by more than 10%, and that wasn't true in the previous snapshot, post one line to the client's channel. Otherwise post nothing.
