// Shared CSS variables update detail colors even if the summary arrives later.
const variable = (name: string) => `--activity-category-${Array.from(name.trim()).map(char => char.codePointAt(0)!.toString(16)).join("-")}`

export function setActivityCategoryColors(categories: { name: string; color: string }[]) {
  for (const category of categories) {
    if (typeof category.name === "string" && /^#[a-f\d]{3}(?:[a-f\d]{3})?$/i.test(category.color)) {
      document.documentElement.style.setProperty(variable(category.name), category.color)
    }
  }
}

export const activityCategoryColor = (name: string) => `var(${variable(name)}, var(--tertiary))`
