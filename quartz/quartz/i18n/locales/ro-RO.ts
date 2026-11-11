import { Translation } from "./definition"

export default {
  propertyDefaults: {
    title: "Fără titlu",
    description: "Fără descriere",
  },
  components: {
    callout: {
      note: "Notă",
      abstract: "Rezumat",
      info: "Informații",
      todo: "De făcut",
      tip: "Sfat",
      success: "Succes",
      question: "Întrebare",
      warning: "Avertisment",
      failure: "Eșec",
      danger: "Pericol",
      bug: "Bug",
      example: "Exemplu",
      quote: "Citat",
    },
    backlinks: {
      title: "Legături înapoi",
      noBacklinksFound: "Nu s-au găsit legături înapoi",
    },
    themeToggle: {
      lightMode: "Mod luminos",
      darkMode: "Mod întunecat",
    },
    readerMode: {
      title: "Mod cititor",
    },
    explorer: {
      title: "Explorator",
    },
    footer: {
      createdWith: "Creat cu",
    },
    graph: {
      title: "Vizualizare Graf",
    },
    recentNotes: {
      title: "Notițe Recente",
      seeRemainingMore: ({ remaining }) => `Vezi încă ${remaining} →`,
    },
    transcludes: {
      transcludeOf: ({ targetSlug }) => `Includere din ${targetSlug}`,
      linkToOriginal: "Link către original",
    },
    search: {
      title: "Căutare",
      searchBarPlaceholder: "Caută ceva",
    },
    tableOfContents: {
      title: "Cuprins",
    },
    contentMeta: {
      readingTime: ({ minutes }) => `${minutes} min de citit`,
    },
  },
  pages: {
    rss: {
      recentNotes: "Notițe recente",
      lastFewNotes: ({ count }) => `Ultimele ${count} notițe`,
    },
    error: {
      title: "Negăsit",
      notFound: "Această pagină este privată sau nu există.",
      home: "Înapoi la Pagina Principală",
    },
    folderContent: {
      folder: "Dosar",
      itemsUnderFolder: ({ count }) =>
        count === 1 ? "1 articol în acest dosar." : `${count} articole în acest dosar.`,
    },
    tagContent: {
      tag: "Etichetă",
      tagIndex: "Index Etichete",
      itemsUnderTag: ({ count }) =>
        count === 1 ? "1 articol cu această etichetă." : `${count} articole cu această etichetă.`,
      showingFirst: ({ count }) => `Se afișează primele ${count} etichete.`,
      totalTags: ({ count }) => `Au fost găsite ${count} etichete în total.`,
    },
    encryptedContent: {
      loading: "Se încarcă 🔃",
      password: "Parolă",
      submit: "Trimite",
      enterPassword: "Această pagină este blocată. Introduceți parola pentru a debloca:",
      modernBrowser: "Vă rugăm să folosiți un browser mai modern pentru a debloca această pagină.",
      wrongPassword: "Parolă greșită. Vă rugăm să introduceți parola:",
      noPayload: "Nu există conținut criptat.",
      decrypting: "Se decriptează...",
      defaultDescription: "Această pagină este criptată.",
    },
  },
} as const satisfies Translation