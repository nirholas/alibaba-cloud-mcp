// MCP tool definitions for the Alibaba Cloud DashScope MCP server.
//
// Each entry pairs an MCP tool definition (name + JSON-Schema input) with a
// handler that maps validated arguments onto a DashScopeClient call. Handlers
// trust their inputs (the schema is the boundary) and let DashScopeError
// propagate — the server maps those to MCP tool errors with the upstream cause.

const generativeAnnotations = {
	readOnlyHint: true,
	openWorldHint: true,
	idempotentHint: false,
};
const deterministicAnnotations = {
	readOnlyHint: true,
	openWorldHint: true,
	idempotentHint: true,
};

function jsonResult(structured, summary) {
	const text = summary
		? `${summary}\n\n${JSON.stringify(structured, null, 2)}`
		: JSON.stringify(structured, null, 2);
	return { content: [{ type: 'text', text }], structuredContent: structured };
}

const samplingProps = {
	max_tokens: {
		type: 'integer',
		minimum: 1,
		maximum: 32768,
		description: 'Maximum tokens to generate.',
	},
	temperature: {
		type: 'number',
		minimum: 0,
		maximum: 2,
		description: 'Sampling temperature. 0 is greedy/deterministic.',
	},
	top_p: {
		type: 'number',
		minimum: 0,
		maximum: 1,
		description: 'Nucleus sampling probability mass.',
	},
};

export function buildTools(client) {
	return [
		{
			definition: {
				name: 'qwen_chat',
				title: 'Qwen Chat',
				annotations: generativeAnnotations,
				description:
					'Chat completion with an Alibaba Cloud Qwen model via DashScope. ' +
					'Pass a list of role/content messages and get the assistant reply plus ' +
					'token usage. Defaults to qwen-plus; use qwen-max for highest quality, ' +
					'qwen-turbo for fastest/cheapest, or qwen-long for very large contexts.',
				inputSchema: {
					type: 'object',
					properties: {
						messages: {
							type: 'array',
							minItems: 1,
							description: 'Conversation so far, oldest first.',
							items: {
								type: 'object',
								properties: {
									role: {
										type: 'string',
										enum: ['system', 'user', 'assistant'],
									},
									content: { type: 'string' },
								},
								required: ['role', 'content'],
							},
						},
						model: {
							type: 'string',
							description:
								'Override the model id. Options: qwen-max, qwen-plus (default), ' +
								'qwen-turbo, qwen-long, qwen-max-latest.',
						},
						...samplingProps,
					},
					required: ['messages'],
				},
			},
			handler: async (args) => {
				const result = await client.chat(args.messages, {
					model: args.model,
					maxTokens: args.max_tokens,
					temperature: args.temperature,
					topP: args.top_p,
				});
				return jsonResult(result, result.text);
			},
		},

		{
			definition: {
				name: 'qwen_embed',
				title: 'Qwen Text Embeddings',
				annotations: deterministicAnnotations,
				description:
					'Generate text embeddings using Alibaba Cloud text-embedding models. ' +
					'Returns a float vector per input string. Useful for semantic search, ' +
					'clustering, and RAG retrieval. Defaults to text-embedding-v3 (1024-dim).',
				inputSchema: {
					type: 'object',
					properties: {
						inputs: {
							oneOf: [
								{ type: 'string' },
								{ type: 'array', items: { type: 'string' }, minItems: 1 },
							],
							description: 'One string or an array of strings to embed.',
						},
						model: {
							type: 'string',
							description:
								'Embedding model id (default: text-embedding-v3). ' +
								'Alternatives: text-embedding-v2, text-embedding-async-v3.',
						},
						dimensions: {
							type: 'integer',
							minimum: 64,
							maximum: 2048,
							description:
								'Output vector dimensions. text-embedding-v3 supports 64–2048 (default 1024).',
						},
					},
					required: ['inputs'],
				},
			},
			handler: async (args) => {
				const inputs = Array.isArray(args.inputs) ? args.inputs : [args.inputs];
				const result = await client.embed(inputs, {
					model: args.model,
					dimensions: args.dimensions,
				});
				return jsonResult(
					result,
					`Embedded ${result.inputCount} string(s) with ${result.model} → ${result.dimensions}-dim vectors.`,
				);
			},
		},

		{
			definition: {
				name: 'qwen_list_models',
				title: 'List DashScope Models',
				annotations: deterministicAnnotations,
				description:
					'List the models available on this DashScope account. ' +
					'Returns model ids, owners, and creation timestamps.',
				inputSchema: {
					type: 'object',
					properties: {},
				},
			},
			handler: async () => {
				const models = await client.listModels();
				return jsonResult(
					{ count: models.length, models },
					`${models.length} models available on this DashScope account.`,
				);
			},
		},
	];
}
