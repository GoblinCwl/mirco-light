import type { DriveView } from "./driveClient"

export const isSpaceRootOperationDisabled = (view: DriveView, path: string, kind: string) =>
  view === "storage" && path === "/" && ["batch", "move", "copy", "rename", "delete", "upload", "folder", "offline"].includes(kind)

export const isDriveImageViewDisabled = (view: DriveView, path: string) =>
  path === "/" && view === "storage"
