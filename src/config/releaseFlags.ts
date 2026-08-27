export const TENANT_RELEASE_FLAGS = {
    OPERATIONS_GOLDEN_PATH_V1: 'operations_golden_path_v1',
} as const

export type TenantReleaseFlagKey = typeof TENANT_RELEASE_FLAGS[keyof typeof TENANT_RELEASE_FLAGS]
