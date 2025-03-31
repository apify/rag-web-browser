import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        exclude: [
            '**/helpers/**',
            '**/node_modules/**',
            'tests/helpers/server.ts', // Explicitly ignore the server helper
        ],
    },
});
