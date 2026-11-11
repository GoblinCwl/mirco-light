import { QuartzConfig } from "./quartz/cfg"
import * as Plugin from "./quartz/plugins"
// @ts-ignore JavaScript shared with the CLI build controller
import { readContentPolicy } from "./quartz/cli/contentPolicy.js"
const contentPolicy = readContentPolicy()

/**
 * Quartz 4 Configuration
 *
 * See https://quartz.jzhao.xyz/configuration for more information.
 */
const config: QuartzConfig = {
  configuration: {
    pageTitle: "微光集",
    pageTitleSuffix: " · 微光集",
    enableSPA: true,
    enablePopovers: true,
    analytics: null,
    locale: "zh-CN",
    baseUrl: "goblincwl.site",
    ignorePatterns: contentPolicy.ignorePatterns,
    unlistedPatterns: contentPolicy.unlistedPatterns,
    defaultDateType: "modified",
    passProtected: {
      enabled: true,
      iteration: 2e6,
    },
    theme: {
      fontOrigin: "local",
      cdnCaching: true,
      typography: {
        header: "Schibsted Grotesk",
        body: "Source Sans Pro",
        code: { name: "Hack", local: true },
      },
      colors: {
        lightMode: {
          moreLight: "#ffffff",
          light: "#faf8f8",
          lightgray: "#e5e5e5",
          gray: "#b8b8b8",
          darkgray: "#4e4e4e",
          dark: "#2b2b2b",
          secondary: "#284b63",
          tertiary: "#84a59d",
          highlight: "rgba(143, 159, 169, 0.15)",
          textHighlight: "#fff23688",
        },
        darkMode: {
          moreLight: "#202022",
          light: "#161618",
          lightgray: "#393639",
          gray: "#646464",
          darkgray: "#d4d4d4",
          dark: "#ebebec",
          secondary: "#7b97aa",
          tertiary: "#84a59d",
          highlight: "rgba(143, 159, 169, 0.15)",
          textHighlight: "#b3aa0288",
        },
      },
    },
  },
  plugins: {
    transformers: [
      Plugin.FrontMatter(),
      Plugin.CreatedModifiedDate({
        priority: ["frontmatter", "filesystem"],
      }),
      Plugin.SyntaxHighlighting({
        theme: {
          light: "github-light",
          dark: "github-dark",
        },
        keepBackground: false,
      }),
      Plugin.Excalidraw(),
      Plugin.ObsidianFlavoredMarkdown({ enableInHtmlEmbed: false }),
      Plugin.GitHubFlavoredMarkdown(),
      // 与 Obsidian 阅读视图一致：段落内的单换行也保留为换行。
      Plugin.HardLineBreaks(),
      Plugin.TableOfContents(),
      Plugin.CrawlLinks({ markdownLinkResolution: "shortest" }),
      Plugin.Description(),
      Plugin.Latex({ renderEngine: "katex" }),
        // 日语注音
      Plugin.Furigana({ enabled: true }),
      // 角标插件
      Plugin.Subscript({ enabled: true }),
      Plugin.MeldEncrypt(),
      Plugin.Images({ imageEffects: true }),
      Plugin.ViewImage(),
    ],
    filters: [Plugin.RemoveDrafts(),Plugin.ExplicitPublish()],
    emitters: [
      Plugin.AliasRedirects(),
      Plugin.ComponentResources(),
      Plugin.ContentPage(),
      Plugin.HomePage(),
      Plugin.ToolsPage(),
      Plugin.RepoPage(),
      Plugin.VideoPage(),
      Plugin.PortalPages(),
      Plugin.FolderPage(),
      Plugin.TagPage(),
      Plugin.ArchivePage(),
      Plugin.CommentsPage(),
      Plugin.SiteMap({
        enableSiteMap: true,
        enableRSS: true,
      }),
      Plugin.Assets(),
      Plugin.Static({ ignorePatterns: [] }),
      Plugin.KatexResources(),
      Plugin.Favicon(),
      Plugin.NotFoundPage(),
      // Comment out CustomOgImages to speed up build time
      Plugin.CustomOgImages(),
    ],
  },
}

export default config
