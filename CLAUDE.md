# Gearva

Before doing any task, read README.md, flow.md and database.md.
They are the source of truth. If code and docs disagree, tell me
and fix one of them in the same change.

Work on one roadmap phase at a time (README section 6) and stop
at that phase's "Done when" list.
Follow the architecture rules in README section 5, especially
tenant isolation and money in cents.
Do not add packages, folders or dependencies the current phase
does not need.

After every step, append an entry to docs/progress.md (time,
summary, files changed, doc changes, how it was verified, commit)
ending with a `---` line, and update the status table at its top.