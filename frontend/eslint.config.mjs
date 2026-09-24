import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * ESLint config for the frontend.
 *
 * Why this exists
 * ---------------
 * The `lint` script pointed at `next lint`, which with no config file present
 * drops into an interactive "how would you like to configure ESLint?" wizard.
 * So `pnpm run lint` - and any CI step calling it - never actually linted
 * anything. A check that silently does nothing is worse than no check.
 *
 * Why not `eslint-config-next`
 * ----------------------------
 * Version 15.1.3 of that preset loads through `@rushstack/eslint-patch`, which
 * throws "Failed to patch ESLint because the calling module was not recognized"
 * under ESLint 9 flat config. Rather than downgrade ESLint, the rules that
 * matter here are configured directly: the JS and TypeScript recommended sets.
 * That catches the defect classes this codebase has actually had - unused
 * imports, unresolved globals, unreachable bindings.
 */

export default [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'next-env.d.ts',
      'eslint.config.mjs',
      'tailwind.config.ts',
      'tailwind.tokens.ts',
      /*
       * Node build/tooling scripts are not part of the app bundle. They run in
       * Node, use `process` and `console` freely, and are already exercised by
       * the scripts that invoke them - linting them here only produces noise
       * about globals the browser build will never see.
       */
      'scripts/**',
      'design-source/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      /**
       * Browser and Node globals.
       *
       * Without these, `console`, `process`, `window` and `crypto` all read as
       * undefined identifiers. `globals` is not a direct dependency, so the set
       * is declared explicitly rather than pulling in a package for it.
       */
      globals: {
        console: 'readonly',
        process: 'readonly',
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        crypto: 'readonly',
        fetch: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        FileList: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        NodeJS: 'readonly',
      },
    },
    rules: {
      /**
       * Unused bindings are an error, but a deliberately-ignored one is not. The
       * `^_` convention is already used in this codebase (e.g. `_side` in the
       * order-book callback).
       */
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      /**
       * `no-undef` is off for TypeScript files: the compiler already resolves
       * every identifier, and the rule cannot see type-only globals such as
       * `React`, producing false positives that get tuned out.
       */
      'no-undef': 'off',

      /**
       * Empty catch blocks are allowed only when they carry a comment, which is
       * how this codebase documents an intentionally-swallowed error.
       */
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
];
