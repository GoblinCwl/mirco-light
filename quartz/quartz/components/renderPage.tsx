import { listedFiles, listedTrie, matchesContentPath } from "../util/contentVisibility"
import {render} from "preact-render-to-string"
import {QuartzComponent, QuartzComponentProps} from "./types"
import HeaderConstructor from "./Header"
import BodyConstructor from "./Body"
import EncryptedContent from "./pages/_EncryptedContent"
import {JSResourceToScriptElement, StaticResources} from "../util/resources"
import {getEncryptedPayload} from "../util/_encrypt"
import {FullSlug, RelativeURL, joinSegments, normalizeHastElement, pathToRoot} from "../util/path"
import {clone} from "../util/clone"
import {visit} from "unist-util-visit"
import {Root, Element, ElementContent} from "hast"
import {GlobalConfiguration} from "../cfg"
import {i18n} from "../i18n"
import {styleText} from "util"
import { VNode } from "preact"
import TableOfContents from "./TableOfContents" // 添加这个导入
import { createHash } from "node:crypto"

interface RenderComponents {
    head: QuartzComponent
    header: QuartzComponent[]
    beforeBody: QuartzComponent[]
    pageBody: QuartzComponent
    afterBody: QuartzComponent[]
    left: QuartzComponent[]
    right: QuartzComponent[]
    footer: QuartzComponent
}

const headerRegex = new RegExp(/h[1-6]/)

export function pageResources(
    baseDir: FullSlug | RelativeURL,
    staticResources: StaticResources,
): StaticResources {
    const resources: StaticResources = {
        css: [
            {
                content: joinSegments(baseDir, "index.css"),
            },
            ...staticResources.css,
        ],
        js: [
            {
                src: joinSegments(baseDir, "prescript.js"),
                loadTime: "beforeDOMReady",
                contentType: "external",
            },
            ...staticResources.js,
        ],
        additionalHead: staticResources.additionalHead,
    }

    resources.js.push({
        src: joinSegments(baseDir, "postscript.js"),
        loadTime: "afterDOMReady",
        moduleType: "module",
        contentType: "external",
    })

    return resources
}

function renderTranscludes(
    root: Root,
    cfg: GlobalConfiguration,
    slug: FullSlug,
    componentData: QuartzComponentProps,
    visited: Set<FullSlug>,
) {
    // process transcludes in componentData
    visit(root, "element", (node, _index, _parent) => {
        if (node.tagName === "blockquote") {
            const classNames = (node.properties?.className ?? []) as string[]
            if (classNames.includes("transclude")) {
                const inner = node.children[0] as Element
                const transcludeTarget = (inner.properties["data-slug"] ?? slug) as FullSlug
                if (visited.has(transcludeTarget)) {
                    console.warn(
                        styleText(
                            "yellow",
                            `Warning: Skipping circular transclusion: ${slug} -> ${transcludeTarget}`,
                        ),
                    )
                    node.children = [
                        {
                            type: "element",
                            tagName: "p",
                            properties: {style: "color: var(--secondary);"},
                            children: [
                                {
                                    type: "text",
                                    value: `Circular transclusion detected: ${transcludeTarget}`,
                                },
                            ],
                        },
                    ]
                    return
                }
                visited.add(transcludeTarget)

                const page = componentData.allFiles.find((f) => f.slug === transcludeTarget)
                if (!page) {
                    return
                }

                let blockRef = node.properties.dataBlock as string | undefined
                if (blockRef?.startsWith("#^")) {
                    // block transclude
                    blockRef = blockRef.slice("#^".length)
                    let blockNode = page.blocks?.[blockRef]
                    if (blockNode) {
                        if (blockNode.tagName === "li") {
                            blockNode = {
                                type: "element",
                                tagName: "ul",
                                properties: {},
                                children: [blockNode],
                            }
                        }

                        node.children = [
                            normalizeHastElement(blockNode, slug, transcludeTarget),
                            {
                                type: "element",
                                tagName: "a",
                                properties: {href: inner.properties?.href, class: ["internal", "transclude-src"]},
                                children: [
                                    {type: "text", value: i18n(cfg.locale).components.transcludes.linkToOriginal},
                                ],
                            },
                        ]
                    }
                } else if (blockRef?.startsWith("#") && page.htmlAst) {
                    // header transclude
                    blockRef = blockRef.slice(1)
                    let startIdx = undefined
                    let startDepth = undefined
                    let endIdx = undefined
                    for (const [i, el] of page.htmlAst.children.entries()) {
                        // skip non-headers
                        if (!(el.type === "element" && el.tagName.match(headerRegex))) continue
                        const depth = Number(el.tagName.substring(1))

                        // lookin for our blockref
                        if (startIdx === undefined || startDepth === undefined) {
                            // skip until we find the blockref that matches
                            if (el.properties?.id === blockRef) {
                                startIdx = i
                                startDepth = depth
                            }
                        } else if (depth <= startDepth) {
                            // looking for new header that is same level or higher
                            endIdx = i
                            break
                        }
                    }

                    if (startIdx === undefined) {
                        return
                    }

                    node.children = [
                        ...(page.htmlAst.children.slice(startIdx, endIdx) as ElementContent[]).map((child) =>
                            normalizeHastElement(child as Element, slug, transcludeTarget),
                        ),
                        {
                            type: "element",
                            tagName: "a",
                            properties: {href: inner.properties?.href, class: ["internal", "transclude-src"]},
                            children: [
                                {type: "text", value: i18n(cfg.locale).components.transcludes.linkToOriginal},
                            ],
                        },
                    ]
                } else if (page.htmlAst) {
                    // page transclude
                    node.children = [
                        {
                            type: "element",
                            tagName: "h1",
                            properties: {},
                            children: [
                                {
                                    type: "text",
                                    value:
                                        page.frontmatter?.title ??
                                        i18n(cfg.locale).components.transcludes.transcludeOf({
                                            targetSlug: page.slug!,
                                        }),
                                },
                            ],
                        },
                        ...(page.htmlAst.children as ElementContent[]).map((child) =>
                            normalizeHastElement(child as Element, slug, transcludeTarget),
                        ),
                        {
                            type: "element",
                            tagName: "a",
                            properties: {href: inner.properties?.href, class: ["internal", "transclude-src"]},
                            children: [
                                {type: "text", value: i18n(cfg.locale).components.transcludes.linkToOriginal},
                            ],
                        },
                    ]
                }
            }
        }
    })
}

export async function renderPage(
    cfg: GlobalConfiguration,
    slug: FullSlug,
    componentData: QuartzComponentProps,
    components: RenderComponents,
    pageResources: StaticResources,
): Promise<string> {
    // Emission reads artifacts from the caller's props, even when rendering
    // below uses a filtered copy for public navigation.
    const renderOutput = componentData
    // make a deep copy of the tree so we don't remove the transclusion references
    // for the file cached in contentMap in build.ts
    const root = clone(componentData.tree) as Root
    const visited = new Set<FullSlug>([slug])
    renderTranscludes(root, cfg, slug, componentData, visited)

    const originalData = { ...componentData }
    const visibleFiles = listedFiles(componentData.allFiles, cfg)
    if (visibleFiles !== componentData.allFiles) {
        componentData = { ...componentData, allFiles: visibleFiles,
            ctx: { ...componentData.ctx, trie: listedTrie(visibleFiles), directoryDates: undefined } }
    }
    // A directly opened hidden directory may list its own contents. Global widgets stay filtered.
    originalData.tree = root
    const bodyData = slug.endsWith("/index") && matchesContentPath(slug.slice(0, -6), cfg.unlistedPatterns)
        ? originalData : componentData

    // set componentData.tree to the edited html that has transclusions rendered
    componentData.tree = root

    const {
        head: Head,
        header,
        beforeBody,
        pageBody: Content,
        afterBody,
        left,
        right,
        footer: Footer,
    } = components
    const Header = HeaderConstructor()
    const Body = BodyConstructor()
    const Encrypted = EncryptedContent()
    const ArticleGraph = slug !== "index" ? right.find((component) => component.isGraph) : undefined

    const LeftComponent = (
        <div class="left sidebar">
            {left.map((BodyComponent) => (
                <BodyComponent {...componentData} />
            ))}
        </div>
    )

    const RightComponent = (
        <div class="right sidebar">
            {right.map((BodyComponent) => (
                <BodyComponent {...componentData} {...(BodyComponent === ArticleGraph ? { displayClass: "desktop-only" as const } : {})} />
            ))}
        </div>
    )

    // 加密文章
    let content = <Content {...bodyData} />
    if (cfg.passProtected?.enabled && componentData.fileData.frontmatter?.passphrase) {
        // 文章内容
        componentData.encryptedContent = await getEncryptedPayload(
            render(content),
            componentData.fileData.frontmatter.passphrase.toString(),
            cfg.passProtected?.iteration,
            `${slug}:content`,
        )

        // 文章目录
        const TocComponent = TableOfContents()
        const tocProps: any = {
            fileData: componentData.fileData,
            cfg: {
                ...componentData.cfg,
                passProtected: {
                    ...componentData.cfg?.passProtected,
                    enabled: false  // 临时关闭
                }
            },
            displayClass: componentData.displayClass
        };
        const tocElement: VNode = <TocComponent {...tocProps} /> as any
        componentData.encryptedToc = await getEncryptedPayload(
            render(tocElement),
            componentData.fileData.frontmatter.passphrase.toString(),
            cfg.passProtected?.iteration,
            `${slug}:toc`,
        )
        const payload = JSON.stringify({ content: componentData.encryptedContent, toc: componentData.encryptedToc, iterations: cfg.passProtected?.iteration ?? 2e6 })
        const revision = createHash("sha256").update(payload).digest("hex").slice(0, 16)
        componentData.encryptedPayload = payload
        componentData.encryptedPayloadSlug = `${slug}.${revision}.encrypted` as FullSlug
        Object.assign(renderOutput, {
            encryptedPayload: componentData.encryptedPayload,
            encryptedPayloadSlug: componentData.encryptedPayloadSlug,
        })
        componentData.encryptedPayloadUrl = joinSegments(pathToRoot(slug), `${componentData.encryptedPayloadSlug}.json`)
        componentData.encryptedCacheId = `${slug}:v2:${Buffer.from(componentData.encryptedContent, "base64").subarray(0, 16).toString("hex")}:${Buffer.from(componentData.encryptedToc, "base64").subarray(0, 16).toString("hex")}`
        // 填充
        content = <Encrypted {...componentData} />
    }

    const lang = componentData.fileData.frontmatter?.lang ?? cfg.locale?.split("-")[0] ?? "en"
    const direction = i18n(cfg.locale).direction ?? "ltr"
    const articleViewport = <>
        {slug !== "observatory/index" && slug !== "friends/index" && <div class="page-header">
            <Header {...componentData}>
                {header.map((HeaderComponent) => <HeaderComponent {...componentData} />)}
            </Header>
            <div class="popover-hint">
                {beforeBody.map((BodyComponent) => <BodyComponent {...componentData} />)}
            </div>
        </div>}
        {content}
        {slug !== "comments/index" && slug !== "friends/index" && !slug.startsWith("observatory/") && <hr/>}
        {ArticleGraph && <ArticleGraph {...componentData} displayClass="mobile-only" articleMobileGraph />}
    </>
    const doc = (
        <html lang={lang} dir={direction}>
        <Head {...componentData} />
        <body data-slug={slug}>
        <div id="quartz-root" class="page">
            <Body {...componentData}>
                {LeftComponent}
                <div class="center">
                    {ArticleGraph ? <div class="article-viewport">{articleViewport}</div> : articleViewport}
                    <div class="page-footer">
                        {afterBody.map((BodyComponent) => (
                            <BodyComponent {...componentData} />
                        ))}
                    </div>
                </div>
                {RightComponent}
                <Footer {...componentData} />
            </Body>
        </div>
        </body>
        {pageResources.js
            .filter((resource) => resource.loadTime === "afterDOMReady")
            .map((res) => JSResourceToScriptElement(res, true))}
        </html>
    )

    return "<!DOCTYPE html>\n" + render(doc)
}
