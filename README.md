# Bonobo PDF Plugin

First-party Bonobo workspace plugin for converting uploaded PDFs to Markdown.

## Checks

```powershell
pnpm run check
```

The published plugin entrypoint is `dist/backend/worker.js`, described by `bonobo.plugin.json` and `dist/bonobo.artifact.json`.

## Release

1. Bump `version` in `bonobo.plugin.json`.
2. Run `pnpm build:artifact` — syncs `dist/bonobo.artifact.json` (plugin name/displayName/version plus the `files[]` hashes recomputed from disk) and the `package.json` version.
3. Commit and push.
4. Publish the new version from the app's plugin publisher page.
