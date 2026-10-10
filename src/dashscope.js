// Alibaba Cloud DashScope REST client.
//
// A thin, dependency-free wrapper over the DashScope OpenAI-compatible API.
// DashScope exposes Qwen models (and others) through an OpenAI-compatible
// endpoint, so authentication is a simple bearer token — no IAM dance needed.
//
// International endpoint: https://dashscope-intl.aliyuncs.com/compatible-mode/v1
// China endpoint:         https://dashscope.aliyuncs.com/compatible-mode/v1
//
// Every method calls a real DashScope endpoint. There is no mock path — a
// missing credential or upstream failure surfaces as a thrown DashScopeError.

export const INTL_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
export const CN_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

export class DashScopeError extends Error {
	constructor(message, { status, detail } = {}) {
		super(message);
		this.name = 'DashScopeError';
		this.status = status;
		this.detail = detail;
	}
}

export function loadConfig(env = process.env) {
	const apiKey = env.DASHSCOPE_API_KEY?.trim();
	if (!apiKey) {
		throw new DashScopeError(
			'DASHSCOPE_API_KEY is not set. Create an API key at ' +
				'https://bailian.console.alibabacloud.com/ → API Keys and export it as DASHSCOPE_API_KEY.',
		);
	}

	const baseUrl = (
		env.DASHSCOPE_BASE_URL?.trim() ||
		(env.DASHSCOPE_REGION === 'cn' ? CN_BASE_URL : INTL_BASE_URL)
	).replace(/\/$/, '');

	return {
		apiKey,
		baseUrl,
		chatModel: env.DASHSCOPE_MODEL_ID?.trim() || 'qwen-plus',
		embedModel: env.DASHSCOPE_EMBED_MODEL_ID?.trim() || 'text-embedding-v3',
		timeoutMs: Number(env.DASHSCOPE_TIMEOUT_MS) || 60_000,
	};
}

export class DashScopeClient {
	constructor(config) {
		this.config = config;
	}

	async _fetch(url, init) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
		try {
			return await fetch(url, { ...init, signal: controller.signal });
		} catch (err) {
			if (err.name === 'AbortError') {
				throw new DashScopeError(
					`Request to ${url} timed out after ${this.config.timeoutMs}ms.`,
				);
			}
			throw new DashScopeError(`Network error calling ${url}: ${err.message}`);
		} finally {
			clearTimeout(timer);
		}
	}

	async _json(res) {
		const text = await res.text();
		if (!text) return {};
		try {
			return JSON.parse(text);
		} catch {
			return { _raw: text };
		}
	}

	async _post(path, payload) {
		const res = await this._fetch(`${this.config.baseUrl}${path}`, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${this.config.apiKey}`,
				'content-type': 'application/json',
				accept: 'application/json',
			},
			body: JSON.stringify(payload),
		});
		const data = await this._json(res);
		if (!res.ok) throw this._upstreamError(res.status, data);
		return data;
	}

	async _get(path) {
		const res = await this._fetch(`${this.config.baseUrl}${path}`, {
			method: 'GET',
			headers: {
				authorization: `Bearer ${this.config.apiKey}`,
				accept: 'application/json',
			},
		});
		const data = await this._json(res);
		if (!res.ok) throw this._upstreamError(res.status, data);
		return data;
	}

	_upstreamError(status, data) {
		const message =
			data?.error?.message ||
			data?.message ||
			data?._raw ||
			'DashScope request failed';
		return new DashScopeError(`DashScope error (${status}): ${message}`, {
			status,
			detail: data?.error?.code || data?.error?.type,
		});
	}

	// Chat completion. messages is an array of { role, content }.
	async chat(messages, { model, maxTokens, temperature, topP } = {}) {
		const body = {
			model: model || this.config.chatModel,
			messages,
		};
		if (maxTokens != null || temperature != null || topP != null) {
			body.max_tokens = maxTokens;
			if (temperature != null) body.temperature = temperature;
			if (topP != null) body.top_p = topP;
		}
		const data = await this._post('/chat/completions', body);
		const choice = data.choices?.[0];
		return {
			text: choice?.message?.content ?? '',
			finishReason: choice?.finish_reason,
			usage: data.usage,
			model: data.model || body.model,
		};
	}

	// Text embeddings for one or more input strings.
	async embed(inputs, { model, dimensions } = {}) {
		const body = {
			model: model || this.config.embedModel,
			input: Array.isArray(inputs) ? inputs : [inputs],
			encoding_format: 'float',
		};
		if (dimensions) body.dimensions = dimensions;
		const data = await this._post('/embeddings', body);
		const sorted = (data.data || []).sort((a, b) => a.index - b.index);
		return {
			model: data.model || body.model,
			vectors: sorted.map((d) => d.embedding),
			inputCount: sorted.length,
			dimensions: sorted[0]?.embedding?.length ?? 0,
			usage: data.usage,
		};
	}

	// List models available on this account.
	async listModels() {
		const data = await this._get('/models');
		return (data.data || []).map((m) => ({
			id: m.id,
			object: m.object,
			owned_by: m.owned_by,
			created: m.created,
		}));
	}
}
