#!/usr/bin/env node

/**
 * Model Context Protocol (MCP) server for RAG Web Browser Actor
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { defaults } from '../const.js';
import { handleModelContextProtocol } from '../search.js';
import { Input } from '../types.js';

const TOOL_SEARCH = 'search';

const WebBrowserArgsSchema = {
    type: 'object',
    properties: {
        query: {
            type: 'string',
            description: 'Google Search keywords or a URL of a specific web page',
        },
        maxResults: {
            type: 'integer',
            description: 'The maximum number of top organic Google Search results whose web pages will be extracted (default: 1)',
            default: defaults.maxResults,
            minimum: 1, // Ensures the number is positive
        },
    },
    required: ['query'],
};

/**
 * Create an MCP server with a tool to call RAG Web Browser Actor
 */
export class RagWebBrowserServer {
    private server: Server;

    constructor() {
        this.server = new Server(
            {
                name: 'mcp-server-rag-web-browser',
                version: '0.1.0',
            },
            {
                capabilities: {
                    tools: {},
                },
            },
        );
        this.setupErrorHandling();
        this.setupToolHandlers();
    }

    private setupErrorHandling(): void {
        this.server.onerror = (error) => {
            console.error('[MCP Error]', error); // eslint-disable-line no-console
        };
        process.on('SIGINT', async () => {
            await this.server.close();
            process.exit(0);
        });
    }

    private setupToolHandlers(): void {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: TOOL_SEARCH,
                        description: 'Search phrase or a URL at Google and return crawled web pages as text or Markdown',
                        inputSchema: WebBrowserArgsSchema,
                    },
                ],
            };
        });
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            switch (name) {
                case TOOL_SEARCH: {
                    const content = await handleModelContextProtocol(args as unknown as Input);
                    return {
                        content: [{ type: 'text', text: JSON.stringify(content) }],
                    };
                }
                default: {
                    throw new Error(`Unknown tool: ${name}`);
                }
            }
        });
    }

    async connect(transport: Transport): Promise<void> {
        await this.server.connect(transport);
    }
}
