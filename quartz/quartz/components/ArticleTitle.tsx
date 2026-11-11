// @ts-ignore
import titleLinkScript from "./scripts/titleLink.inline"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"
import EncryptedMark from "./EncryptedMark"

const ArticleTitle: QuartzComponent = ({ fileData, displayClass, cfg }: QuartzComponentProps) => {
  if (fileData.slug === "observatory/index") return null
  const title = fileData.frontmatter?.title
  const encrypted = Boolean(cfg.passProtected?.enabled && fileData.frontmatter?.passphrase)
  if (title) {
    return (
      <h1 class={classNames(displayClass, "article-title")}>
        <span class="article-title-copy" role="button" tabIndex={0} aria-label={`复制文章链接：${title}`} title="复制文章链接">
          {encrypted && <EncryptedMark />}
          {title}
          <span class="article-title-link" aria-hidden="true">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </span>
        </span>
      </h1>
    )
  } else {
    return null
  }
}

ArticleTitle.css = `
.article-title {
  margin: 2rem 0 0 0;
}

.article-title-copy {
  cursor: pointer;
}

.article-title-link {
  display: inline-block;
  margin: 0 0.5rem;
  opacity: 0;
  transform: translateY(-0.1rem);
  transition: opacity 0.2s ease;
  vertical-align: middle;
}

.article-title-copy:hover .article-title-link,
.article-title-copy:focus-visible .article-title-link {
  opacity: 1;
}

.copy-link-toast {
  position: fixed;
  left: 50%;
  top: 1.5rem;
  z-index: 1000;
  padding: 0.5rem 0.8rem;
  border-radius: 999px;
  background: var(--dark);
  color: var(--light);
  font-size: 0.85rem;
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, -0.5rem);
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;

  &.visible {
    opacity: 0.95;
    transform: translate(-50%, 0);
  }
}
`

ArticleTitle.afterDOMLoaded = titleLinkScript

export default (() => ArticleTitle) satisfies QuartzComponentConstructor
