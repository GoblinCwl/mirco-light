import { Translation } from "./definition"

export default {
  propertyDefaults: {
    title: "Атаусыз",
    description: "Сипаттамасы жоқ",
  },
  components: {
    callout: {
      note: "Ескертпе",
      abstract: "Қысқаша мазмұн",
      info: "Ақпарат",
      todo: "Жоспар",
      tip: "Кеңес",
      success: "Табыс",
      question: "Сұрақ",
      warning: "Ескерту",
      failure: "Қате",
      danger: "Қауіп",
      bug: "Қате",
      example: "Мысал",
      quote: "Дәйексөз",
    },
    backlinks: {
      title: "Кері сілтемелер",
      noBacklinksFound: "Кері сілтемелер жоқ",
    },
    themeToggle: {
      lightMode: "Ашық түрі",
      darkMode: "Қараңғы түрі",
    },
    readerMode: {
      title: "Оқу түрі",
    },
    explorer: {
      title: "Шолушы",
    },
    footer: {
      createdWith: "Келесімен жасалды",
    },
    graph: {
      title: "График көрінісі",
    },
    recentNotes: {
      title: "Соңғы жазбалар",
      seeRemainingMore: ({ remaining }) => `Тағы ${remaining} қарау →`,
    },
    transcludes: {
      transcludeOf: ({ targetSlug }) => `${targetSlug} импорттау`,
      linkToOriginal: "Түпнұсқаға сілтеме",
    },
    search: {
      title: "Іздеу",
      searchBarPlaceholder: "Бірдеңе іздеу",
    },
    tableOfContents: {
      title: "Мазмұндама",
    },
    contentMeta: {
      readingTime: ({ minutes }) => `${minutes} минут оқу`,
    },
  },
  pages: {
    rss: {
      recentNotes: "Соңғы жазбалар",
      lastFewNotes: ({ count }) => `Соңғы ${count} жазба`,
    },
    error: {
      title: "Табылмады",
      notFound: "Бұл бет жеке немесе мүлдем жоқ.",
      home: "Басты бетке қайту",
    },
    folderContent: {
      folder: "Қалта",
      itemsUnderFolder: ({ count }) =>
        count === 1 ? "1 нәрсе осы қалтада." : `${count} нәрсе осы қалтада.`,
    },
    tagContent: {
      tag: "Тег",
      tagIndex: "Тегтер индексі",
      itemsUnderTag: ({ count }) =>
        count === 1 ? "1 нәрсе осы тегпен белгіленген." : `${count} нәрсе осы тегпен белгіленген.`,
      showingFirst: ({ count }) => `Алғашқы ${count} тег көрсетілуде.`,
      totalTags: ({ count }) => `Барлығы ${count} тег табылды.`,
    },
    encryptedContent: {
      loading: "Жүктелуде 🔃",
      password: "Құпия сөз",
      submit: "Жіберу",
      enterPassword: "Бұл бет құлыпталған. Құпия сөзді енгізіп құлпын ашыңыз:",
      modernBrowser: "Бұл беттің құлпын ашу үшін заманауи браузер қолданыңыз.",
      wrongPassword: "Құпия сөз қате. Құпия сөзді енгізіңіз:",
      noPayload: "Шифрланған деректер жоқ.",
      decrypting: "Шифрдан шығаруда...",
      defaultDescription: "Бұл бет шифрланған.",
    },
  },
} as const satisfies Translation