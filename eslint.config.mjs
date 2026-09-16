import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'

export default defineConfig([
  ...nextVitals,
  {
    rules: {
      // Existing booking forms synchronise quote state from API inputs.
      // Keep that behaviour while the forms are migrated incrementally.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // These are exercised by their own Python and Playwright test commands.
    'static/**',
    'tests/e2e/**',
    '.coder/**',
    'agent-lab/**',
    'graph/**',
  ]),
])
