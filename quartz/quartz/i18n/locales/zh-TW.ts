import { Translation } from "./definition"

export default {
  propertyDefaults: {
    title: "無標題",
    description: "沒有提供描述",
  },
  components: {
    callout: {
      note: "筆記",
      abstract: "摘要",
      info: "資訊",
      todo: "待辦",
      tip: "提示",
      success: "成功",
      question: "問題",
      warning: "警告",
      failure: "失敗",
      danger: "危險",
      bug: "錯誤",
      example: "範例",
      quote: "引用",
    },
    backlinks: {
      title: "反向連結",
      noBacklinksFound: "沒有找到反向連結",
    },
    themeToggle: {
      lightMode: "淺色模式",
      darkMode: "深色模式",
    },
    readerMode: {
      title: "閱讀模式",
    },
    explorer: {
      title: "星域",
    },
    footer: {
      createdWith: "創建於",
    },
    graph: {
      title: "關係圖",
    },
    recentNotes: {
      title: "近期筆記",
      seeRemainingMore: ({ remaining }) => `查看剩餘的 ${remaining} 篇 →`,
    },
    transcludes: {
      transcludeOf: ({ targetSlug }) => `${targetSlug} 的嵌入內容`,
      linkToOriginal: "連結到原始檔案",
    },
    search: {
      title: "搜尋",
      searchBarPlaceholder: "搜尋某些內容",
    },
    tableOfContents: {
      title: "目錄",
    },
    contentMeta: {
      readingTime: ({ minutes }) => `${minutes} 分鐘閱讀`,
    },
  },
  pages: {
    rss: {
      recentNotes: "近期筆記",
      lastFewNotes: ({ count }) => `最近 ${count} 篇筆記`,
    },
    error: {
      title: "找不到頁面",
      notFound: "此頁面可能是私密頁面或不存在。",
      home: "回到首頁",
    },
    folderContent: {
      folder: "資料夾",
      itemsUnderFolder: ({ count }) =>
        count === 1 ? "此資料夾中有 1 個項目。" : `此資料夾中有 ${count} 個項目。`,
    },
    tagContent: {
      tag: "標籤",
      tagIndex: "標籤索引",
      itemsUnderTag: ({ count }) =>
        count === 1 ? "此標籤下有 1 個項目。" : `此標籤下有 ${count} 個項目。`,
      showingFirst: ({ count }) => `顯示前 ${count} 個標籤。`,
      totalTags: ({ count }) => `總共找到 ${count} 個標籤。`,
    },
    encryptedContent: {
      loading: "載入中 🔃",
      password: "密碼",
      submit: "提交",
      enterPassword: "此頁面已鎖定。請輸入密碼以解鎖:",
      modernBrowser: "請使用更現代化的瀏覽器來解鎖此頁面。",
      wrongPassword: "密碼錯誤。請重新輸入密碼:",
      noPayload: "沒有加密內容。",
      decrypting: "解密中...",
      defaultDescription: "此頁面已加密。",
    },
  },
} as const satisfies Translation