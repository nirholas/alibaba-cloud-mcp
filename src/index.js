#!/usr/bin/env node
// @three-ws/alibaba-cloud-mcp — stdio MCP server for Alibaba Cloud DashScope.
//
// Exposes Qwen models (and other DashScope models) as MCP tools:
// chat, embeddings, and model discovery over the OpenAI-compatible DashScope API.
//
// Architecture: this process talks DIRECTLY to the DashScope REST API using
// YOUR Alibaba Cloud API key. No intermediary backend, no mock path — all
// data comes from DashScope. Configure via environment variables:
//
//   DASHSCOPE_API_KEY       (required) DashScope API key
//                           → https://bailian.console.alibabacloud.com/ → API Keys
//   DASHSCOPE_MODEL_ID      (optional) default chat model, default qwen-plus
//   DASHSCOPE_EMBED_MODEL_ID(optional) default embedding model, default text-embedding-v3
//   DASHSCOPE_BASE_URL      (optional) custom endpoint, defaults to international
//   DASHSCOPE_REGION        (optional) set to "cn" to use China endpoint
//   DASHSCOPE_TIMEOUT_MS    (optional) request timeout, default 60000
//
// Run standalone:
//   DASHSCOPE_API_KEY=... npx @three-ws/alibaba-cloud-mcp
//
// Inspect:
//   npx -y @modelcontextprotocol/inspector npx @three-ws/alibaba-cloud-mcp

import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { loadConfig, DashScopeClient, DashScopeError } from './dashscope.js';
import { buildTools } from './tools.js';

const require = createRequire(import.meta.url);
const { version: PKG_VERSION } = require('../package.json');

export function buildServer() {
	const config = loadConfig();
	const client = new DashScopeClient(config);
	const tools = buildTools(client);

	const server = new McpServer(
		{
			name: 'alibaba-cloud-mcp',
			title: 'Alibaba Cloud DashScope',
			version: PKG_VERSION,
		},
		{
			capabilities: { tools: {} },
			instructions:
				'three.ws Alibaba Cloud MCP — Qwen models and DashScope AI via your own ' +
				'Alibaba Cloud API key. qwen_chat for conversation and reasoning, ' +
				'qwen_embed for text embeddings and semantic search, ' +
				'qwen_list_models to discover available models. ' +
				'Set DASHSCOPE_API_KEY to your DashScope key. ' +
				'Defaults: qwen-plus (chat), text-embedding-v3 (embeddings). ' +
				'Use qwen-max for highest quality, qwen-turbo for lowest latency.',
		},
	);

	for (const tool of tools) {
		server.tool(
			tool.definition.name,
			tool.definition.description,
			tool.definition.inputSchema.properties,
			async (args) => {
				try {
					return await tool.handler(args);
				} catch (err) {
					if (err instanceof DashScopeError) {
						return {
							isError: true,
							content: [
								{
									type: 'text',
									text: `DashScope error: ${err.message}${err.detail ? ` (${err.detail})` : ''}`,
								},
							],
						};
					}
					throw err;
				}
			},
		);
	}

	return server;
}

async function main() {
	let config;
	try {
		config = loadConfig();
	} catch (err) {
		process.stderr.write(`[alibaba-cloud-mcp] configuration error: ${err.message}\n`);
		process.exit(1);
		return;
	}

	const server = buildServer();
	const transport = new StdioServerTransport();
	await server.connect(transport);
	process.stderr.write(
		`[alibaba-cloud-mcp] v${PKG_VERSION} running — model: ${config.chatModel}, endpoint: ${config.baseUrl}\n`,
	);
}

const isMain =
	process.argv[1] &&
	realpathSync(process.argv[1]) === realpathSync(pathToFileURL(import.meta.url).pathname);

if (isMain) main();
