import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/next-env.d.ts', '**/coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
