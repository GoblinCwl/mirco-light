export type SubtitleAppearance = {
  subtitleStyling: "Custom" | "Native"
  textSize: "smaller" | "small" | "normal" | "large" | "larger" | "extralarge"
  textWeight: "normal" | "bold"
  font: "default" | "typewriter" | "print" | "console" | "cursive" | "casual" | "smallcaps"
  textColor: string
  dropShadow: "" | "none" | "raised" | "depressed" | "uniform"
  verticalPosition: number
}

export const defaultSubtitleAppearance: Readonly<SubtitleAppearance> = Object.freeze({
  subtitleStyling: "Custom",
  textSize: "large",
  textWeight: "bold",
  font: "casual",
  textColor: "#ffffff",
  dropShadow: "",
  verticalPosition: -2,
})
export const subtitleFonts = {
  default:
    "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif,Apple Color Emoji,Segoe UI Emoji,Segoe UI Symbol",
  typewriter: '"Courier New",monospace',
  print: "Georgia,Times New Roman,Arial,Helvetica,serif",
  console: "Consolas,Lucida Console,Menlo,Monaco,monospace",
  cursive:
    "Lucida Handwriting,Brush Script MT,Segoe Script,cursive,Quintessential,system-ui,-apple-system,BlinkMacSystemFont,sans-serif",
  casual:
    "Gabriola,Segoe Print,Comic Sans MS,Chalkboard,Short Stack,system-ui,-apple-system,BlinkMacSystemFont,sans-serif",
  smallcaps:
    "Copperplate Gothic,Copperplate Gothic Bold,Copperplate,system-ui,-apple-system,BlinkMacSystemFont,sans-serif",
}
export const subtitleSizes = {
  smaller: 0.8,
  small: 1,
  normal: 1.36,
  large: 1.72,
  larger: 2,
  extralarge: 2.2,
}

export function normalizeSubtitleAppearance(value?: unknown): SubtitleAppearance {
  const result = { ...defaultSubtitleAppearance }
  if (!value || typeof value !== "object" || Array.isArray(value)) return result
  const input = value as Record<string, unknown>
  for (const key of ["subtitleStyling", "textSize", "textWeight", "font", "dropShadow"] as const) {
    const allowed =
      key === "subtitleStyling"
        ? ["Custom", "Native"]
        : key === "textSize"
          ? Object.keys(subtitleSizes)
          : key === "textWeight"
            ? ["normal", "bold"]
            : key === "font"
              ? Object.keys(subtitleFonts)
              : ["", "none", "raised", "depressed", "uniform"]
    if (allowed.includes(input[key] as string)) (result as any)[key] = input[key]
  }
  if (typeof input.textColor === "string" && /^#[\da-f]{6}$/i.test(input.textColor))
    result.textColor = input.textColor
  if (
    typeof input.verticalPosition === "number" &&
    Number.isInteger(input.verticalPosition) &&
    Math.abs(input.verticalPosition) <= 10
  )
    result.verticalPosition = input.verticalPosition
  return result
}

export function subtitleAppearanceStyles(value: SubtitleAppearance, custom = true) {
  const raised =
    "-0.04em -0.04em #fff,0 -0.04em #fff,-0.04em 0 #fff,0.04em 0.04em #000,0 0.04em #000,0.04em 0 #000"
  const depressed =
    "0.04em 0.04em #fff,0 0.04em #fff,0.04em 0 #fff,-0.04em -0.04em #000,0 -0.04em #000,-0.04em 0 #000"
  const uniform = [-0.05, -0.03, 0, 0.03, 0.05]
    .flatMap((x) =>
      [-0.05, -0.03, 0, 0.03, 0.05].filter((y) => x || y).map((y) => `#000 ${x}em ${y}em`),
    )
    .join(",")
  return {
    fontFamily: subtitleFonts[value.font],
    fontVariant: value.font === "smallcaps" ? "small-caps" : "normal",
    fontSize: custom
      ? `${1.7 * subtitleSizes[value.textSize]}rem`
      : `${subtitleSizes[value.textSize]}em`,
    fontWeight: value.textWeight === "bold" ? "700" : "400",
    color: value.textColor,
    backgroundColor: "transparent",
    textShadow: { "": "#000000 0px 0px 7px", none: "none", raised, depressed, uniform }[
      value.dropShadow
    ],
    marginBottom:
      value.verticalPosition < 0
        ? `${Number((1.35 * Math.abs(value.verticalPosition + 1)).toFixed(2))}em`
        : "0px",
    marginTop:
      value.verticalPosition >= 0
        ? `${Number((1.35 * value.verticalPosition).toFixed(2))}em`
        : "0px",
  }
}
