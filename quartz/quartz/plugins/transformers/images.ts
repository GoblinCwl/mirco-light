import { QuartzTransformerPlugin } from "../types"
import { visit } from "unist-util-visit"
import { Element, Root as HRoot } from "hast"
import { PluggableList } from "unified"
import { JSResource, CSSResource } from "../../util/resources"
import imageLoadingScript from "../../components/scripts/imageLoading.inline"
import imageLoadingStyles from "../../components/styles/imageLoading.scss"

export interface Options {
  imageEffects: boolean
}

const defaultOptions: Options = {
  imageEffects: true,
}

export const Images: QuartzTransformerPlugin<Partial<Options>> = (userOpts) => {
  const opts = { ...defaultOptions, ...userOpts }

  return {
    name: "Images",
    htmlPlugins() {
      const plugins: PluggableList = []

      if (opts.imageEffects) {
        plugins.push(() => {
          return (tree: HRoot) => {
            visit(tree, "element", (node, index, parent) => {
              // 为图片添加容器包装以应用加载效果
              if (node.tagName === "img" && parent && typeof index !== 'undefined') {
                // HAST may represent data attributes in camelCase or their HTML spelling.
                if (Object.hasOwn(node.properties, "dataNoLightbox") || Object.hasOwn(node.properties, "data-no-lightbox")) return
                // 创建一个容器元素
                const container: Element = {
                  type: "element",
                  tagName: "span",
                  properties: {
                    className: ["image-container"]
                  },
                  children: [
                    node,
                    {
                      type: "element",
                      tagName: "span",
                      properties: {
                        className: ["image-loading-overlay"],
                        "aria-hidden": "true",
                      },
                      children: [
                        {
                          type: "element",
                          tagName: "span",
                          properties: { className: ["image-loading-spinner"] },
                          children: [],
                        },
                      ],
                    },
                  ]
                }

                // 将容器替换原来的图片节点
                parent.children[index] = container
              }
            })
          }
        })
      }

      return plugins
    },
    externalResources() {
      if (opts.imageEffects) {
        return {
          js: [{
            script: `(()=>{${imageLoadingScript}})();`,
            loadTime: "beforeDOMReady",
            contentType: "inline"
          }] as JSResource[],
          css: [{
            content: imageLoadingStyles,
            inline: true
          }] as CSSResource[]
        }
      }
      return {}
    }
  }
}
