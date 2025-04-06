import express from 'express';
import fs from 'node:fs';
import type { Server } from 'node:http';
import path from 'node:path';

/**
 * Creates and returns an Express server with test routes
 */
export function createTestServer() {
    const app = express();

    app.get('/basic', (_req, res) => {
        const htmlPath = path.join(__dirname, 'html', 'basic.html');
        const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
        res.send(htmlContent);
    });

    return app;
}

/**
 * Starts a test server on the specified port
 * @param port Port number to use
 * @returns HTTP server instance
 */
export function startTestServer(port = 3030): Server {
    const app = createTestServer();
    return app.listen(port, () => {
        console.log(`Test server is running on port ${port}`);
    });
}

/**
 * Stops the test server
 * @param server Server instance to stop
 */
export function stopTestServer(server: Server): Promise<void> {
    return new Promise((resolve, reject) => {
        server.close((err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}
