import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

const isolatedLegacyPmFiles = [
    'src/pages/maintenance/MaintenancePlanDetailsPage.tsx',
    'src/components/maintenance/AddMaintenancePlanDialog.tsx',
    'src/components/maintenance/AddMaintenanceTaskDialog.tsx',
    'src/components/maintenance/TaskExecutionModal.tsx',
    'src/hooks/useMaintenancePlans.ts',
    'src/hooks/useMaintenanceTasks.ts',
]

export default tseslint.config(
    { ignores: ['dist', 'node_modules', 'api', '.claude', 'dev-server.*.log', ...isolatedLegacyPmFiles] },
    {
        extends: [js.configs.recommended, ...tseslint.configs.recommended],
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
            ecmaVersion: 2020,
            globals: globals.browser,
        },
        plugins: {
            'react-hooks': reactHooks,
            'react-refresh': reactRefresh,
        },
        rules: {
            ...reactHooks.configs.recommended.rules,
            'react-refresh/only-export-components': [
                'warn',
                { allowConstantExport: true },
            ],
            // Relax strict rules for existing codebase
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        },
    },
)
