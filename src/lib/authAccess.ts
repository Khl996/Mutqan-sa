export const INACTIVE_ACCOUNT_ERROR_NAME = 'InactiveAccountError'

export class InactiveAccountError extends Error {
    constructor() {
        super('The authenticated profile is inactive')
        this.name = INACTIVE_ACCOUNT_ERROR_NAME
    }
}

export function isExplicitlyActiveProfile(
    profile: { is_active?: boolean | null } | null | undefined,
) {
    return profile?.is_active === true
}

export function isInactiveAccountError(error: unknown) {
    return error instanceof Error && error.name === INACTIVE_ACCOUNT_ERROR_NAME
}
