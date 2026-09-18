# Release changelog / GitHub-release generation

**Status:** descoped from the conventional-versioning PR.
**Why descoped:** standalone `nx release changelog` requires an explicit
version argument, which is unusable for `projectsRelationship: independent`.
The all-in-one `nx release` command would generate changelogs correctly, but
it gives no hook between the version and publish stages — and our
`rewrite-workspace-protocol` step must run after the version commit (so
committed manifests keep `workspace:*`) and before `nx release publish`
(uncommitted, CI-tree only).

**Options to investigate:**

1. `release.changelog.projectChangelogs` in nx.json + per-project
   `nx release changelog <version>` invocations driven by the version
   step's output.
2. Custom changelog generator option in nx release config.
3. Accept GitHub auto-generated release notes per tag instead of nx's
   changelog pipeline.

**Context:** version step currently commits + tags + pushes per-project
tags (`@nx-devkit/x@y.z`). `contents: write` is already granted for future
GitHub releases.
