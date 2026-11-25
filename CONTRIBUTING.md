# Contributing

Short rules that keep the history readable. The README explains how to run the project.

## Once per machine

```bash
git config --global user.name  "Abdalrahman Al-Kahlout"
git config --global user.email "alkhlwtbdalrhmn07@gmail.com"
```

Older commits made under other spellings of the name are shown under this one by `.mailmap`
(`git log`, `git shortlog`, `git blame`). History is never rewritten for this.

## One branch per change

- Start from the newest `main`: `git fetch origin && git switch -c fix/short-name origin/main`
- Names: `feature/...`, `fix/...`, `chore/...`, `docs/...`, `test/...`, `ci/...`
- Commit messages say what changed and why, e.g. `fix(auth): protect answers 500 for server errors`
- Never push to `main` directly, never `git push --force` to a shared branch

## Before merging a branch

```bash
git fetch origin
git switch fix/short-name && git pull

# server (in-memory MongoDB, never the real database)
cd server && npm ci && npm test && cd ..

# client
cd client && npm ci && npm run typecheck && npm run lint && npm test && npm run build && cd ..

# formatting (CI checks it too)
npm ci && npm run format:check
```

## Merging without the default template

Git's editor opens with a template whose lines start with `#`. Saved as it is in some editors, that
text ends up in the commit message. Give the message on the command line instead:

```bash
git switch main && git pull
git merge --no-ff fix/short-name -m "Merge fix/short-name: <one line on what it fixes>"
git push origin main
```

(`git merge --no-edit fix/short-name` also works: it keeps Git's own one-line message.)
Merging a pull request on GitHub with its button is fine too.

## After merging

Delete the branch on GitHub (the branch page, or the button on the merged pull request) once it is
in `main`, so the branch list only shows work that is still open.
