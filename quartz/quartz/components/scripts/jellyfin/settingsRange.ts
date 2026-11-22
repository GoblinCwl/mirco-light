export function mountSettingsRange(
  row: HTMLElement,
  label: string,
  min: number,
  max: number,
  step: number,
  value: number,
  change: (value: number) => void,
  format: (value: number) => string = String,
) {
  row.classList.add("quartz-subtitle-style-row")
  const input = document.createElement("input")
  const output = document.createElement("output")
  input.type = "range"
  input.min = String(min)
  input.max = String(max)
  input.step = String(step)
  input.value = String(value)
  input.setAttribute("aria-label", label)
  output.textContent = format(input.valueAsNumber)
  const caption = document.createElement("label")
  caption.textContent = label
  caption.append(input)
  row.replaceChildren(caption, output)
  input.oninput = () => {
    const next = input.valueAsNumber
    output.textContent = format(next)
    change(next)
  }
  row.addEventListener("keydown", (event) => event.stopPropagation())
  return { input, output }
}
