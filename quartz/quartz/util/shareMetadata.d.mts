export type ShareMetadata = { tags: string[]; comment: boolean; order?: number; sharedAt?: string; jellyfin?: boolean; aliases?: Record<string, string> }
export function parseShareMetadata(raw: unknown, strict?: boolean): ShareMetadata
export function sharePageKey(id: string): string
