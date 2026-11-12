// One palette for Canvas nodes and their HTML filter controls.
export const graphPalette = {
  article: { light: '#84a59d', dark: '#84a59d' },
  share:   { light: '#ac6767', dark: '#ce8b8b' },
  repo:    { light: '#957391', dark: '#ba9db7' },
  video:   { light: '#777fbb', dark: '#9fa7dc' },
  tag:     { light: '#81858a', dark: '#a4a8ae' },
} as const
export type GraphPaletteKind = keyof typeof graphPalette
export function graphFilterColorStyle(kind: GraphPaletteKind) {
  const colors=graphPalette[kind]
  return `--graph-type-light:${colors.light};--graph-type-dark:${colors.dark}`
}
