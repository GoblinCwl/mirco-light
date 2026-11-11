import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import style from "./styles/footer.scss"
import pureModeStyle from "./styles/puremode.scss"

interface Options {
  links: Record<string, string>
}

export default ((opts?: Options) => {
  const Footer: QuartzComponent = ({ displayClass }: QuartzComponentProps) => {
    const links = opts?.links ?? []
    
    // 在服务端渲染时只返回标准页脚，纯净模式由客户端JavaScript处理
    return (
      <footer class={`${displayClass ?? ""}`}>
        <ul>
          {Object.entries(links).map(([text, link]) => (
            <li>
              <a href={link}  target="_blank" rel="noopener noreferrer">{text}</a>
            </li>
          ))}
        </ul>
      </footer>
    )
  }

  Footer.css = style + "\n" + pureModeStyle
  return Footer
}) satisfies QuartzComponentConstructor
