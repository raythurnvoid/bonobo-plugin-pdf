const DOWNLOAD_URL_EXPIRES_SECONDS = 15 * 60;
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
const MAX_MARKDOWN_BYTES = 900_000;

/** @param {unknown} value */
function normalizeContentType(value) {
	return typeof value === "string" ? value.split(";")[0].trim().toLowerCase() : null;
}

function skipped() {
	return new Response(null, {
		status: 204,
		headers: { "X-Bonobo-Skipped": "unsupported_content_type" },
	});
}

/** @param {unknown} body */
function json(body, status = 200) {
	return Response.json(body, { status });
}

/** @param {import("bonobo-plugin-sdk").Request} request */
async function readEvent(request) {
	try {
		return /** @type {import("bonobo-plugin-sdk").BonoboUploadCompletedEvent} */ (await request.json());
	} catch {
		return null;
	}
}

/** @param {import("bonobo-plugin-sdk").BonoboUploadCompletedEvent} event */
function getSource(event) {
	const source = event && typeof event === "object" ? event.source : null;
	if (
		!source ||
		typeof source !== "object" ||
		typeof source.fileNodeId !== "string" ||
		typeof source.name !== "string" ||
		typeof source.path !== "string"
	) {
		return null;
	}

	return source;
}

/**
 * @param {import("bonobo-plugin-sdk").BonoboEnv} env
 * @param {string} name
 */
async function requireSecret(env, name) {
	const value = await env.BONOBO.secrets.get(name);
	if (!value) {
		throw new Error(`${name} is not configured`);
	}
	return value;
}

/**
 * @param {string} text
 * @param {string} serviceName
 */
function parseJson(text, serviceName) {
	try {
		return JSON.parse(text);
	} catch {
		throw new Error(`${serviceName} returned invalid JSON`);
	}
}

/**
 * POSTs JSON to one of the public Bonobo host APIs and returns the parsed response body.
 * @param {import("bonobo-plugin-sdk").BonoboEnv} env
 * @param {string} path
 * @param {unknown} body
 */
async function hostFetch(env, path, body) {
	const response = await fetch(`${env.BONOBO.host.apiOrigin}${path}`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${env.BONOBO.host.token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});
	if (!response.ok) {
		throw new Error(`Host API ${path} returned HTTP ${response.status}`);
	}
	return parseJson(await response.text(), `Host API ${path}`);
}

/**
 * @param {import("bonobo-plugin-sdk").BonoboEnv} env
 * @param {string} fileNodeId
 */
async function sourceDownloadUrl(env, fileNodeId) {
	const result = await hostFetch(env, "/api/v1/files/download-urls", {
		fileNodeIds: [fileNodeId],
		expiresInSeconds: DOWNLOAD_URL_EXPIRES_SECONDS,
	});
	const item = result?.items?.[0];
	if (!item || typeof item.url !== "string") {
		throw new Error("Source download URL is unavailable");
	}
	return item.url;
}

/** @type {import("bonobo-plugin-sdk").BonoboPluginHandler} */
export default {
	async fetch(request, env) {
		const event = await readEvent(request);
		const source = event ? getSource(event) : null;
		if (!event || !source) {
			return json({ error: "Upload source is missing" }, 400);
		}
		if (normalizeContentType(source.contentType) !== "application/pdf") {
			return skipped();
		}

		const [sourceUrl, modalUrl, modalToken] = await Promise.all([
			sourceDownloadUrl(env, source.fileNodeId),
			requireSecret(env, "MODAL_FILE_CONVERTER_URL"),
			requireSecret(env, "MODAL_TOKEN"),
		]);

		// Absolute sibling of the upload: /folder/report.pdf -> /folder/report.pdf.md.
		const path = `${source.path}.md`;
		// Create the output file empty right away — after every secret is known to exist, so a
		// missing secret still fails before any file appears — and let the user see where the
		// Markdown will land while conversion runs. The write below fills this same node in place.
		await hostFetch(env, "/api/v1/files/touch", { paths: [path] });

		const response = await fetch(modalUrl, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${modalToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				sourceUrl,
				filename: source.name,
				contentType: source.contentType,
				maxBytes: MAX_UPLOAD_BYTES,
				maxMarkdownBytes: MAX_MARKDOWN_BYTES,
			}),
		});
		if (!response.ok) {
			throw new Error(`Modal file converter returned HTTP ${response.status}`);
		}

		const payload = parseJson(await response.text(), "Modal file converter");
		if (!payload || typeof payload.markdown !== "string") {
			throw new Error("Modal file converter returned no markdown");
		}

		await hostFetch(env, "/api/v1/files/write", {
			path,
			content: payload.markdown,
			overwrite: "replace",
		});

		return json({ ok: true, files: [path] });
	},
};
