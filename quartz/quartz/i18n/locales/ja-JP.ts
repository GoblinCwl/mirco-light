import { Translation } from "./definition"

export default {
  propertyDefaults: {
    title: "タイトルなし",
    description: "説明はありません",
  },
  components: {
    callout: {
      note: "ノート",
      abstract: "抄録",
      info: "情報",
      todo: "やるべきこと",
      tip: "ヒント",
      success: "成功",
      question: "質問",
      warning: "警告",
      failure: "失敗",
      danger: "危険",
      bug: "バグ",
      example: "例",
      quote: "引用",
    },
    backlinks: {
      title: "バックリンク",
      noBacklinksFound: "バックリンクはありません",
    },
    themeToggle: {
      lightMode: "ライトモード",
      darkMode: "ダークモード",
    },
    readerMode: {
      title: "リーダーモード",
    },
    explorer: {
      title: "エクスプローラー",
    },
    footer: {
      createdWith: "作成",
    },
    graph: {
      title: "グラフビュー",
    },
    recentNotes: {
      title: "最近のノート",
      seeRemainingMore: ({ remaining }) => `${remaining} 件以上表示 →`,
    },
    transcludes: {
      transcludeOf: ({ targetSlug }) => `${targetSlug} のインクルード`,
      linkToOriginal: "元記事へのリンク",
    },
    search: {
      title: "検索",
      searchBarPlaceholder: "検索する",
    },
    tableOfContents: {
      title: "目次",
    },
    contentMeta: {
      readingTime: ({ minutes }) => `${minutes} 分で読了`,
    },
  },
  pages: {
    rss: {
      recentNotes: "最近のノート",
      lastFewNotes: ({ count }) => `直近 ${count} 件のノート`,
    },
    error: {
      title: "見つかりません",
      notFound: "このページは非公開であるか、存在しません。",
      home: "ホームに戻る",
    },
    folderContent: {
      folder: "フォルダ",
      itemsUnderFolder: ({ count }) =>
        count === 1 ? "このフォルダには1つのアイテムがあります。" : `このフォルダには${count}個のアイテムがあります。`,
    },
    tagContent: {
      tag: "タグ",
      tagIndex: "タグ一覧",
      itemsUnderTag: ({ count }) =>
        count === 1 ? "このタグが付いたアイテムは1つあります。" : `このタグが付いたアイテムは${count}個あります。`,
      showingFirst: ({ count }) => `最初の ${count} 個のタグを表示しています。`,
      totalTags: ({ count }) => `合計 ${count} 個のタグが見つかりました。`,
    },
    encryptedContent: {
      loading: "読み込み中 🔃",
      password: "パスワード",
      submit: "送信",
      enterPassword: "このページはロックされています。ロックを解除するにはパスワードを入力してください:",
      modernBrowser: "このページのロックを解除するには、より新しいブラウザを使用してください。",
      wrongPassword: "パスワードが間違っています。パスワードを再入力してください:",
      noPayload: "暗号化されたデータがありません。",
      decrypting: "復号中...",
      defaultDescription: "このページは暗号化されています。",
    },
  },
} as const satisfies Translation