export function isSafeProofStoragePath(value: string): boolean {
    if (value.length === 0 || value.length > 512) return false
    if (value.startsWith('/') || value.includes('\\') || value.includes('\0')) return false
    if (value.includes('://') || value.split('/').some((part) => part === '..' || part === '')) return false
    return /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value)
}
