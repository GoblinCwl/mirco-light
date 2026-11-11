export type DriveView = "guest" | "storage" | "share"
export type DriveRoute = { view: DriveView; share: string; path: string; valid: boolean }
export const DRIVE_BASE: string
export function isDriveShareId(value: unknown): value is string
export function driveRoute(url: URL): DriveRoute
export function driveHref(view: DriveView, path?: string, share?: string, directory?: boolean): string
export function driveDirectoryTitle(view: DriveView, path: string, share?: string): string
