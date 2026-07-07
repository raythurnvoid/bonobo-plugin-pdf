# Bonobo PDF Plugin

First-party Bonobo workspace plugin for converting uploaded PDFs to Markdown.

## Checks

```powershell
pnpm run check
```

The published plugin entrypoint is `dist/backend/worker.js`, described by `dist/bonobo.plugin.json`.

## Release

1. Bump `version` in `bonobo.plugin.json`.
2. Run `pnpm build:manifest` — recomputes the `files[]` hashes from disk, syncs the `package.json` version, and byte-copies the manifest to `dist/bonobo.plugin.json`.
3. Commit and push.
4. Publish the new version from the app's plugin publisher page.
