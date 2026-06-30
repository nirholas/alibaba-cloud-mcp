import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { loadConfig, DashScopeClient, DashScopeError, INTL_BASE_URL, CN_BASE_URL } from '../src/dashscope.js';

describe('loadConfig', () => {
	it('throws if DASHSCOPE_API_KEY is absent', () => {
		assert.throws(() => loadConfig({}), (err) => {
			assert(err instanceof DashScopeError);
			assert(err.message.includes('DASHSCOPE_API_KEY'));
			return true;
		});
	});

	it('uses international endpoint by default', () => {
		const cfg = loadConfig({ DASHSCOPE_API_KEY: 'test-key' });
		assert.equal(cfg.baseUrl, INTL_BASE_URL);
	});

	it('uses China endpoint when DASHSCOPE_REGION=cn', () => {
		const cfg = loadConfig({ DASHSCOPE_API_KEY: 'test-key', DASHSCOPE_REGION: 'cn' });
		assert.equal(cfg.baseUrl, CN_BASE_URL);
	});

	it('honours DASHSCOPE_BASE_URL override', () => {
		const cfg = loadConfig({ DASHSCOPE_API_KEY: 'test-key', DASHSCOPE_BASE_URL: 'https://custom.example.com/v1' });
		assert.equal(cfg.baseUrl, 'https://custom.example.com/v1');
	});

	it('strips trailing slash from base URL', () => {
		const cfg = loadConfig({ DASHSCOPE_API_KEY: 'test-key', DASHSCOPE_BASE_URL: 'https://custom.example.com/v1/' });
		assert.equal(cfg.baseUrl, 'https://custom.example.com/v1');
	});

	it('defaults to qwen-plus and text-embedding-v3', () => {
		const cfg = loadConfig({ DASHSCOPE_API_KEY: 'test-key' });
		assert.equal(cfg.chatModel, 'qwen-plus');
		assert.equal(cfg.embedModel, 'text-embedding-v3');
	});

	it('respects model overrides', () => {
		const cfg = loadConfig({
			DASHSCOPE_API_KEY: 'test-key',
			DASHSCOPE_MODEL_ID: 'qwen-max',
			DASHSCOPE_EMBED_MODEL_ID: 'text-embedding-v2',
		});
		assert.equal(cfg.chatModel, 'qwen-max');
		assert.equal(cfg.embedModel, 'text-embedding-v2');
	});
});

describe('DashScopeError', () => {
	it('carries status and detail', () => {
		const err = new DashScopeError('test error', { status: 401, detail: 'invalid_api_key' });
		assert.equal(err.name, 'DashScopeError');
		assert.equal(err.status, 401);
		assert.equal(err.detail, 'invalid_api_key');
	});
});
