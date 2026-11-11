const normalize = (value: string) => "/" + value.split("/").filter(Boolean).join("/")

// URLs/route validation use absolute storage paths; OpenList's authenticated
// filesystem APIs already prepend base_path and must receive relative paths.
export function absoluteStoragePath(path: string, base: string) {
  return normalize(`${base}/${path}`)
}
export function relativeStoragePath(path: string, base: string): string | null {
  const target = normalize(path), root = normalize(base)
  if (target === "/" || root === "/") return target
  if (target === root) return "/"
  return target.startsWith(`${root}/`) ? target.slice(root.length) : null
}
