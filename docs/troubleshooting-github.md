# GitHub Troubleshooting (PR Conflicts + MCP Reconnect)

## Resolve PR merge conflicts locally

If GitHub shows **"This branch has conflicts that must be resolved"** in a PR:

1. **Make sure you have the `origin` remote set** (adjust the URL to your repo):
   ```bash
   git remote add origin git@github.com:<owner>/<repo>.git
   git fetch origin
   ```
2. **Update your base branch (usually `main`)**:
   ```bash
   git checkout main
   git pull origin main
   ```
3. **Merge `main` into your PR branch** (replace `<your-branch>`):
   ```bash
   git checkout <your-branch>
   git merge main
   ```
4. **Resolve conflicts** in the files GitHub lists (e.g. `server/src/tool.ts`,
   `ui/src/hooks/useWidgetState.ts`). Remove conflict markers, keep the
   correct version, and save.
5. **Stage and commit the resolution**:
   ```bash
   git add server/src/tool.ts ui/src/hooks/useWidgetState.ts
   git commit -m "Resolve merge conflicts"
   ```
6. **Push the branch**:
   ```bash
   git push origin <your-branch>
   ```

Once pushed, GitHub should clear the conflict banner on the PR.

## If MCP won’t reconnect to GitHub

These steps address the most common connection issues:

1. **Verify your GitHub token / OAuth is still valid**
   - Re-authenticate the GitHub integration if you recently changed your
     password, enabled 2FA, or revoked tokens.
2. **Confirm repo access**
   - Make sure the integration has access to the org/repo and that the repo
     still exists at the same URL.
3. **Disconnect and reconnect the integration**
   - Remove the GitHub connection from your MCP settings, then reconnect it
     and select the repo again.
4. **Check for branch rules or required checks**
   - If the repo now enforces branch protections, your integration may need
     additional permissions to write or update branches.
5. **Try a fresh clone**
   ```bash
   git clone git@github.com:<owner>/<repo>.git
   cd <repo>
   ```

If it still fails, capture the exact error message from MCP logs or UI — that
will identify whether it’s authentication, permissions, or networking.
