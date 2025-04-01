import apifyTypescriptConfig from '@apify/eslint-config/ts.js';

// eslint-disable-next-line import/no-default-export
export default [
    { ignores: ['**/dist'] }, // Ignores need to happen first
    ...apifyTypescriptConfig,
    {
        languageOptions: {
            sourceType: 'module',

            parserOptions: {
                project: 'tsconfig.eslint.json', // Or your other tsconfig
            },
        },
    },
];
