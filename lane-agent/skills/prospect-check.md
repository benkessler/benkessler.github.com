# Prospect check (cheap gate)

Look at the calendar. Is there a meeting with people outside every client's domains (and not personal, vendor, or job-interview) that either:
- starts in the next 36 hours and has no brief yet (state `prospect:briefed`), or
- ended in the last 4 days and has no proposal yet (state `prospect:proposed`)?

If yes, the last line is RUN. Otherwise SKIP.
