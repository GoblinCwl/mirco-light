import { QuartzTransformerPlugin } from "../types"
import { Root } from "mdast"
import { ReplaceFunction, findAndReplace } from "mdast-util-find-and-replace"
import { PluggableList } from "unified"

interface Options {
  enabled: boolean
}

const defaultOptions: Options = {
  enabled: true,
}

// 正则表达式匹配Furigana语法 {漢字|かんじ}
// 支持多个音标: {漢字|か|ん|じ}
const furiganaRegex = /\{([^|{}]+)\|([^\}]+)\}/g

export const Furigana: QuartzTransformerPlugin<Partial<Options>> = (userOpts) => {
  const opts = { ...defaultOptions, ...userOpts }

  if (!opts.enabled) {
    return {
      name: "Furigana",
      markdownPlugins() {
        return []
      },
      htmlPlugins() {
        return []
      },
    }
  }

  return {
    name: "Furigana",
    markdownPlugins() {
      const plugins: PluggableList = []
      
      plugins.push(() => {
        return (tree: Root) => {
          // 定义替换函数
          const replaceFurigana: ReplaceFunction = (_value: string, kanji: string, readings: string) => {
            // 分割音标部分，可能有多个音标
            const readingParts = readings.split("|").filter(part => part.trim() !== "")
            
            // 如果只有一个音标，则整个汉字使用该音标
            if (readingParts.length === 1) {
              return {
                type: "html",
                value: `<ruby>${kanji}<rt>${readingParts[0]}</rt></ruby>`,
              }
            } else {
              // 如果有多个音标，则逐个字符对应音标
              const kanjiChars = kanji.split("")
              let result = ""
              
              for (let i = 0; i < kanjiChars.length; i++) {
                if (i < readingParts.length && readingParts[i].trim() !== "") {
                  result += `<ruby>${kanjiChars[i]}<rt>${readingParts[i]}</rt></ruby>`
                } else {
                  result += kanjiChars[i] // 如果没有对应的音标，只显示字符
                }
              }
              
              return {
                type: "html",
                value: result,
              }
            }
          }

          // 应用替换
          findAndReplace(tree, [[furiganaRegex, replaceFurigana]])
        }
      })

      return plugins
    },
    htmlPlugins() {
      // 不需要额外的HTML处理步骤
      return []
    },
  }
}