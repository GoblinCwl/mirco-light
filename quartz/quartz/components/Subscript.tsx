import { QuartzComponentConstructor, QuartzComponentProps } from "./types"
import style from "./styles/subscript.scss"

export default (() => {
  function Subscript(_: QuartzComponentProps) {
    return <></>
  }

  Subscript.css = style
  return Subscript
}) satisfies QuartzComponentConstructor