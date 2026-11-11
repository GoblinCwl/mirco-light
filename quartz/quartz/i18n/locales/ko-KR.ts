import { Translation } from "./definition"

export default {
  propertyDefaults: {
    title: "제목 없음",
    description: "설명 없음",
  },
  components: {
    callout: {
      note: "노트",
      abstract: "요약",
      info: "정보",
      todo: "할 일",
      tip: "팁",
      success: "성공",
      question: "질문",
      warning: "경고",
      failure: "실패",
      danger: "위험",
      bug: "버그",
      example: "예시",
      quote: "인용",
    },
    backlinks: {
      title: "백링크",
      noBacklinksFound: "백링크가 없습니다",
    },
    themeToggle: {
      lightMode: "라이트 모드",
      darkMode: "다크 모드",
    },
    readerMode: {
      title: "리더 모드",
    },
    explorer: {
      title: "탐색기",
    },
    footer: {
      createdWith: "만든 도구",
    },
    graph: {
      title: "그래프 보기",
    },
    recentNotes: {
      title: "최근 노트",
      seeRemainingMore: ({ remaining }) => `${remaining}개 더 보기 →`,
    },
    transcludes: {
      transcludeOf: ({ targetSlug }) => `${targetSlug}의 포함`,
      linkToOriginal: "원본 링크",
    },
    search: {
      title: "검색",
      searchBarPlaceholder: "무엇이든 검색해보세요",
    },
    tableOfContents: {
      title: "목차",
    },
    contentMeta: {
      readingTime: ({ minutes }) => `${minutes}분 분량 읽기`,
    },
  },
  pages: {
    rss: {
      recentNotes: "최근 노트",
      lastFewNotes: ({ count }) => `최근 ${count}개 노트`,
    },
    error: {
      title: "찾을 수 없음",
      notFound: "이 페이지는 비공개이거나 존재하지 않습니다.",
      home: "홈페이지로 돌아가기",
    },
    folderContent: {
      folder: "폴더",
      itemsUnderFolder: ({ count }) =>
        count === 1 ? "이 폴더에 항목이 1개 있습니다." : `이 폴더에 ${count}개의 항목이 있습니다.`,
    },
    tagContent: {
      tag: "태그",
      tagIndex: "태그 인덱스",
      itemsUnderTag: ({ count }) =>
        count === 1 ? "이 태그가 있는 항목이 1개 있습니다." : `이 태그가 있는 항목이 ${count}개 있습니다.`,
      showingFirst: ({ count }) => `처음 ${count}개의 태그를 표시합니다.`,
      totalTags: ({ count }) => `총 ${count}개의 태그를 찾았습니다.`,
    },
    encryptedContent: {
      loading: "로딩 중 🔃",
      password: "비밀번호",
      submit: "제출",
      enterPassword: "이 페이지는 잠겨 있습니다. 잠금 해제하려면 비밀번호를 입력하세요:",
      modernBrowser: "이 페이지의 잠금을 해제하려면 더 현대적인 브라우저를 사용하세요.",
      wrongPassword: "비밀번호가 틀렸습니다. 다시 입력해주세요:",
      noPayload: "암호화된 데이터가 없습니다.",
      decrypting: "복호화 중...",
      defaultDescription: "이 페이지는 암호화되어 있습니다.",
    },
  },
} as const satisfies Translation