export function atomicPublicationEnabled(): boolean
export function publishedOutput(root: string): string
export type Publication = {
  directory: string
  commit(): Promise<void>
  discard(): Promise<void>
}
export function beginPublication(root: string, inheritCurrent?: boolean): Promise<Publication>
