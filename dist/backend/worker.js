const TEMPORARY_URL_EXPIRES_SECONDS = 15 * 60;
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
const MAX_MARKDOWN_BYTES = 900_000;
const MODAL_FILE_CONVERTER_URL = "https://ray-thurne-void--bonobo-senate-press-file-converter-asgi.modal.run";

function normalizeContentType(value) {
	return typeof value === "string" ? value.split(";")[0].trim().toLowerCase() : null;
}

function skipped() {
	return new Response(null, {
		status: 204,
		headers: { "X-Bonobo-Skipped": "unsupported_content_type" },
	});
}

function json(body, status = 200) {
	return Response.json(body, { status });
}

async function readEvent(request) {
	try {
		return await request.json();
	} catch {
		return null;
	}
}

function getSource(event) {
	const source = event && typeof event === "object" ? event.source : null;
	if (!source || typeof source !== "object" || typeof source.name !== "string") {
		return null;
	}

	return source;
}

async function requireSecret(env, name) {
	const value = await env.BONOBO.secrets.get(name);
	if (!value) {
		throw new Error(`${name} is not configured`);
	}
	return value;
}

function parseJson(text, serviceName) {
	try {
		return JSON.parse(text);
	} catch {
		throw new Error(`${serviceName} returned invalid JSON`);
	}
}

async function sourceTemporaryUrl(env) {
	const result = await env.BONOBO.files.source.temporaryUrl({
		expiresInSeconds: TEMPORARY_URL_EXPIRES_SECONDS,
	});
	if (!result || typeof result.url !== "string") {
		throw new Error("Source temporary URL is unavailable");
	}
	return result.url;
}

export default {
	async fetch(request, env) {
		const event = await readEvent(request);
		const source = getSource(event);
		if (!source) {
			return json({ error: "Upload source is missing" }, 400);
		}
		if (normalizeContentType(source.contentType) !== "application/pdf") {
			return skipped();
		}

		const [sourceUrl, modalToken] = await Promise.all([
			sourceTemporaryUrl(env),
			// Publisher secret MODAL_TOKEN is configured with MODAL_FILE_CONVERTER_URL
			// as its only allowed origin in the host secret policy.
			requireSecret(env, "MODAL_TOKEN"),
		]);
		// Security review: MODAL_TOKEN is sent only to the fixed, declared
		// Modal converter endpoint above and is never written to outputs.
		const response = await env.BONOBO.outbound.fetch({
			url: MODAL_FILE_CONVERTER_URL,
			method: "POST",
			headers: {
				Authorization: `Bearer ${modalToken}`,
				"Content-Type": "application/json",
			},
			bodyText: JSON.stringify({
				sourceUrl,
				filename: source.name,
				contentType: source.contentType,
				maxBytes: MAX_UPLOAD_BYTES,
				maxMarkdownBytes: MAX_MARKDOWN_BYTES,
			}),
			responseType: "text",
		});
		if (!response.ok) {
			throw new Error(`Modal file converter returned HTTP ${response.status}`);
		}

		const payload = parseJson(response.bodyText ?? "", "Modal file converter");
		if (!payload || typeof payload.markdown !== "string") {
			throw new Error("Modal file converter returned no markdown");
		}

		const path = `${source.name}.md`;
		await env.BONOBO.files.writeMarkdown({
			path,
			markdown: payload.markdown,
			overwrite: "replace",
		});

		return json({ ok: true, files: [path] });
	},
};
