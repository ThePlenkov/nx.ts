# MAYOR.md — Mayor (coordinator) operating procedure

This file is read by the mayor and any coordinator agent **before** slinging any pr-feedback or rework bead. It encodes the local, in-repo rules for that workflow. Hard-won from PR #18 (https://github.com/ThePlenkov/nx.ts/pull/18): vague beads fail.

## Before slinging a pr-feedback or rework bead

1. **Pull the actual PR state** with `gh` and GraphQL. Never trust memory, never trust previous conversation, never infer from a "looks like the same issue" pattern.

   ```bash
   REPO="ThePlenkov/nx.ts"
   PR_NUMBER=18
   gh pr view "$PR_NUMBER" --repo "$REPO" --json state,mergeable,statusCheckRollup
   gh api graphql -F number="$PR_NUMBER" -f query='query($number: Int!) { repository(owner:"ThePlenkov", name:"nx.ts") { pullRequest(number:$number) { reviewDecision state url reviewThreads(first:100) { nodes { id isResolved isOutdated comments(last:5) { nodes { author { login } body path line } } } } } } }'
   ```

   Notes:
   - `REPO` and `PR_NUMBER` are exported once per run; replace the literal `18` with the target PR.
   - `first:100` covers the GitHub `first:N` cap for a single page; if the PR has more than 100 threads, paginate with `after: <endCursor>`.
   - `comments(last:5)` returns the most recent replies in each thread, which is what a coordinator needs to judge whether the latest agent already addressed the feedback.

2. **Check whether the work is already done.** Look at the branch head and recent commits:
   ```bash
   BRANCH="branch-name"
   gh api "repos/ThePlenkov/nx.ts/commits?sha=${BRANCH}&per_page=5" --jq '.[] | "\(.sha[0:7]) \(.commit.message | split("\n")[0])"'
   ```
   If the fix is already committed and pushed, do NOT sling a fix bead. Either close prior failed beads, or sling a "verify and resolve threads" bead instead.

3. **Enumerate every open review thread** with its GraphQL ID, file:line, author, and one-line claim. Save the list. This list goes INTO the bead body — see next section.

## Required structure of a pr-feedback bead body

The body MUST contain, verbatim:

1. **PR header** — `gh pr view N --repo ...` URL, branch name, author of PR, current `mergeable` state.
2. **Per-thread instructions** — one section per open thread:
   - Heading: `## Thread T<number> — <author> on <path>:<line>`
   - GraphQL thread ID (from pre-flight query)
   - One-paragraph summary of the claim
   - **Investigation step** — exact file/grep to run to verify the claim against the code
   - **Required reply** — a template for what to post in the thread, with placeholders for the actual answer
   - **Resolve command** — `gh api graphql -F id="$THREAD_ID" -f query='mutation($id: ID!) { resolveReviewThread(input:{threadId:$id}) { thread { isResolved } } }'`
3. **Hard constraints section** — explicit "do not touch" list (executor.ts, package.json, nx.json, .github/workflows/*, lockfiles, anything not in this PR).
4. **Escalation section** — what to do if gh/api/permissions fail, or if the investigation reveals a code bug outside scope: stop and mail the mayor, do not loop.
5. **Done criteria** — exact commands to run after all threads are resolved, including a final `gh pr view N` to confirm `reviewDecision` is non-null.

## Forbidden bead phrasings

A pr-feedback or rework bead body MUST NOT contain any of these (they have all caused loops on PR #18):

- "Run `gh pr view 18 --comments` to see all review comments" — too vague, polecat does not know what to do
- "Address each unresolved comment thread" — no structure
- "If it's a relevant code fix, make the change" — polecat cannot judge relevance without investigation
- "Push your changes" — without specifying which branch, which files, or what commit message
- "Call gt_done" without enumerating acceptance criteria first
- Any reference to "previous attempts" or "as discussed" — polecats are stateless; the bead body is the only context

## When a pr-feedback bead has failed twice in a row

1. **Mail the mayor** with: bead ID, the two failure reasons (from the bead's `last_dispatch_attempt_at` and agent log if available), and the current PR state.
2. **Do not create a third retry bead.** Escalate to the user.
3. The mayor will either: (a) approve a third attempt with a corrected body, (b) close the PR as-is, or (c) file a code-fix bead separately.

## After landing

When a PR is merged, the mayor should:

1. Confirm the convoy closes (`gt_convoy_status` shows `closed_beads == total_beads`).
2. List the merged commits for the user.
3. If a follow-up convoy was planned (e.g. cross-link verification), confirm it has been dispatched.

## Out of scope

This file is **not** a substitute for `AGENTS.md` (which is for working polecats, not coordinators) or `REVIEW.md` (which is for AI code reviewers). It only covers the mayor's slinging workflow for pr-feedback / rework beads.
