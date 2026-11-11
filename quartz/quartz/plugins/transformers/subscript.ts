import { QuartzTransformerPlugin } from "../types"
import { Root } from "mdast"
import { ReplaceFunction, findAndReplace } from "mdast-util-find-and-replace"

interface Options {
  enabled: boolean
}

const defaultOptions: Options = {
  enabled: true,
}

const subscriptRegex = /\^\[([^\]]*)\]/g

export const Subscript: QuartzTransformerPlugin<Partial<Options>> = (userOpts) => {
  const opts = { ...defaultOptions, ...userOpts }

  return {
    name: "Subscript",
    textTransform(_ctx, src) {
      if (!opts.enabled) return src
      
      return src.replace(subscriptRegex, (_match, content) => {
        const processedContent = content
          .replace(/&/g, '&amp;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&apos;');
        
        return `<span class="subscript-wrapper"><span class="subscript" title="${processedContent}">^</span></span>`
      })
    },
    markdownPlugins() {
      if (!opts.enabled) return []
      
      return [() => {
        return (tree: Root) => {
          const replaceSubscript: ReplaceFunction = (_value: string, content: string) => {
            const processedContent = content
              .replace(/&/g, '&amp;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&apos;');
            
            return {
              type: "html",
              value: `<span class="subscript-wrapper"><span class="subscript" title="${processedContent}">^</span></span>`,
            }
          }

          findAndReplace(tree, [[subscriptRegex, replaceSubscript]])
        }
      }]
    },
    htmlPlugins() {
      return []
    },
  }
}