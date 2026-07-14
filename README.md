# Bonobo PDF Plugin

First-party Bonobo workspace plugin for converting uploaded PDFs to Markdown.

On `files.upload.completed` for `application/pdf`, the worker requests a presigned download URL for the uploaded PDF (`POST /api/v1/files/download-urls` with `[source.fileNodeId]`), POSTs it to the Modal file converter (which downloads the PDF and returns Markdown), and writes `<name>.md` next to the upload (`POST /api/v1/files/write` with the absolute sibling path built from `source.path`).

## Secrets

- `MODAL_FILE_CONVERTER_URL` (required) — full URL of the Modal file converter endpoint the worker POSTs to; it must live on the manifest's outbound origin.
- `MODAL_TOKEN` (required) — bearer token the Modal endpoint expects.

Both default to the publisher secrets, so the publisher's Modal deployment converts the PDFs of every workspace that installs the plugin. A workspace can shadow either with an installation secret of the same name.

## Outbound origins

- `https://ray-thurne-void--bonobo-senate-press-file-converter-asgi.modal.run`

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
