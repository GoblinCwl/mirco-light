/** JSON embedded as JavaScript must not contain an HTML script terminator.
 * Use one JSON unicode escape so SVG markup survives the runtime round trip. */
export const sandboxJSON = (value: unknown) => JSON.stringify(value).replaceAll("<", "\\u003c")
