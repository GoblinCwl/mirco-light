import { Translation } from "./definition"

export default {
  propertyDefaults: {
    title: "Uten tittel",
    description: "Ingen beskrivelse gitt",
  },
  components: {
    callout: {
      note: "Notat",
      abstract: "Sammendrag",
      info: "Info",
      todo: "Gjøremål",
      tip: "Tips",
      success: "Suksess",
      question: "Spørsmål",
      warning: "Advarsel",
      failure: "Feil",
      danger: "Fare",
      bug: "Programfeil",
      example: "Eksempel",
      quote: "Sitat",
    },
    backlinks: {
      title: "Tilbakekoblinger",
      noBacklinksFound: "Ingen tilbakekoblinger funnet",
    },
    themeToggle: {
      lightMode: "Lys modus",
      darkMode: "Mørk modus",
    },
    readerMode: {
      title: "Lesertilstand",
    },
    explorer: {
      title: "Utforsker",
    },
    footer: {
      createdWith: "Opprettet med",
    },
    graph: {
      title: "Grafvisning",
    },
    recentNotes: {
      title: "Nylige notater",
      seeRemainingMore: ({ remaining }) => `Se ${remaining} flere →`,
    },
    transcludes: {
      transcludeOf: ({ targetSlug }) => `Inkludert fra ${targetSlug}`,
      linkToOriginal: "Lenke til originalen",
    },
    search: {
      title: "Søk",
      searchBarPlaceholder: "Søk etter noe",
    },
    tableOfContents: {
      title: "Innholdsfortegnelse",
    },
    contentMeta: {
      readingTime: ({ minutes }) => `${minutes} min lesing`,
    },
  },
  pages: {
    rss: {
      recentNotes: "Nylige notater",
      lastFewNotes: ({ count }) => `Siste ${count} notater`,
    },
    error: {
      title: "Ikke funnet",
      notFound: "Denne siden er enten privat eller eksisterer ikke.",
      home: "Gå tilbake til startsiden",
    },
    folderContent: {
      folder: "Mappe",
      itemsUnderFolder: ({ count }) =>
        count === 1 ? "1 element i denne mappen." : `${count} elementer i denne mappen.`,
    },
    tagContent: {
      tag: "Merke",
      tagIndex: "Merkeindeks",
      itemsUnderTag: ({ count }) =>
        count === 1 ? "1 element med dette merket." : `${count} elementer med dette merket.`,
      showingFirst: ({ count }) => `Viser de første ${count} merkene.`,
      totalTags: ({ count }) => `Fant totalt ${count} merker.`,
    },
    encryptedContent: {
      loading: "Laster 🔃",
      password: "Passord",
      submit: "Send",
      enterPassword: "Denne siden er låst. Skriv inn passord for å låse opp:",
      modernBrowser: "Bruk en mer moderne nettleser for å låse opp denne siden.",
      wrongPassword: "Feil passord. Skriv inn passordet:",
      noPayload: "Ingen kryptert innhold.",
      decrypting: "Dekrypterer...",
      defaultDescription: "Denne siden er kryptert.",
    },
  },
} as const satisfies Translation