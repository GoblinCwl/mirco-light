import { Translation } from "./definition"

export default {
  propertyDefaults: {
    title: "Be pavadinimo",
    description: "Aprašymas nepateiktas",
  },
  components: {
    callout: {
      note: "Pastaba",
      abstract: "Santrauka",
      info: "Informacija",
      todo: "Atlikti",
      tip: "Patarimas",
      success: "Sėkmė",
      question: "Klausimas",
      warning: "Įspėjimas",
      failure: "Nepavyko",
      danger: "Pavojus",
      bug: "Klaida",
      example: "Pavyzdys",
      quote: "Citata",
    },
    backlinks: {
      title: "Atgalinės nuorodos",
      noBacklinksFound: "Atgalinių nuorodų nerasta",
    },
    themeToggle: {
      lightMode: "Šviesus režimas",
      darkMode: "Tamsus režimas",
    },
    readerMode: {
      title: "Skaitymo režimas",
    },
    explorer: {
      title: "Naršyklė",
    },
    footer: {
      createdWith: "Sukurta su",
    },
    graph: {
      title: "Grafiko rodinys",
    },
    recentNotes: {
      title: "Paskutinės pastabos",
      seeRemainingMore: ({ remaining }) => `Peržiūrėti dar ${remaining} →`,
    },
    transcludes: {
      transcludeOf: ({ targetSlug }) => `Įterpimas iš ${targetSlug}`,
      linkToOriginal: "Nuoroda į originalą",
    },
    search: {
      title: "Paieška",
      searchBarPlaceholder: "Ieškoti kažko",
    },
    tableOfContents: {
      title: "Turinys",
    },
    contentMeta: {
      readingTime: ({ minutes }) => `${minutes} min skaitymo`,
    },
  },
  pages: {
    rss: {
      recentNotes: "Paskutinės pastabos",
      lastFewNotes: ({ count }) => `Paskutinės ${count} pastabos`,
    },
    error: {
      title: "Nerasta",
      notFound: "Šis puslapis yra privatus arba neegzistuoja.",
      home: "Grįžti į pagrindinį puslapį",
    },
    folderContent: {
      folder: "Aplankas",
      itemsUnderFolder: ({ count }) =>
        count === 1 ? "1 elementas šiame aplanke." : `${count} elementai(-ų) šiame aplanke.`,
    },
    tagContent: {
      tag: "Žymė",
      tagIndex: "Žymių indeksas",
      itemsUnderTag: ({ count }) =>
        count === 1 ? "1 elementas pažymėtas šia žyme." : `${count} elementai(-ų) pažymėti šia žyme.`,
      showingFirst: ({ count }) => `Rodomas pirmas ${count} žymes(-ių).`,
      totalTags: ({ count }) => `Iš viso rasta ${count} žymes(-ių).`,
    },
    encryptedContent: {
      loading: "Įkeliama 🔃",
      password: "Slaptažodis",
      submit: "Pateikti",
      enterPassword: "Šis puslapis užrakintas. Įveskite slaptažodį atrakinti:",
      modernBrowser: "Norėdami atrakinti šį puslapį, naudokite šiuolaikiškesnę naršyklę.",
      wrongPassword: "Neteisingas slaptažodis. Įveskite slaptažodį:",
      noPayload: "Nėra šifruoto turinio.",
      decrypting: "Iššifruojama...",
      defaultDescription: "Šis puslapis šifruotas.",
    },
  },
} as const satisfies Translation