import fs from "fs"
import sourceMapSupport from "source-map-support"
import { fileURLToPath } from "url"

export const options: sourceMapSupport.Options = {
  // Each build process loads one fixed bundle URL with its adjacent source map.
  retrieveSourceMap(source) {
    if (source.includes(".quartz-cache")) {
      let realSource = fileURLToPath(source) + ".map"
      return {
        map: fs.readFileSync(realSource, "utf8"),
      }
    } else {
      return null
    }
  },
}
