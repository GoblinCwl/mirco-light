import { Translation } from "./definition"

export default {
  propertyDefaults: {
    title: "Naamloos",
    description: "Geen beschrijving gegeven",
  },
  components: {
    callout: {
      note: "Noot",
      abstract: "Samenvatting",
      info: "Info",
      todo: "Te doen",
      tip: "Tip",
      success: "Succes",
      question: "Vraag",
      warning: "Waarschuwing",
      failure: "Mislukking",
      danger: "Gevaar",
      bug: "Bug",
      example: "Voorbeeld",
      quote: "Citaat",
    },
    backlinks: {
      title: "Backlinks",
      noBacklinksFound: "Geen backlinks gevonden",
    },
    themeToggle: {
      lightMode: "Lichte modus",
      darkMode: "Donkere modus",
    },
    readerMode: {
      title: "Leesmodus",
    },
    explorer: {
      title: "Verkenner",
    },
    footer: {
      createdWith: "Gemaakt met",
    },
    graph: {
      title: "Grafiekweergave",
    },
    recentNotes: {
      title: "Recente Notities",
      seeRemainingMore: ({ remaining }) => `Zie ${remaining} meer →`,
    },
    transcludes: {
      transcludeOf: ({ targetSlug }) => `Invoeging van ${targetSlug}`,
      linkToOriginal: "Link naar origineel",
    },
    search: {
      title: "Zoeken",
      searchBarPlaceholder: "Zoek naar iets",
    },
    tableOfContents: {
      title: "Inhoudsopgave",
    },
    contentMeta: {
      readingTime: ({ minutes }) => `${minutes} min. leestijd`,
    },
  },
  pages: {
    rss: {
      recentNotes: "Recente notities",
      lastFewNotes: ({ count }) => `Laatste ${count} notities`,
    },
    error: {
      title: "Niet gevonden",
      notFound: "Deze pagina is privé of bestaat niet.",
      home: "Terug naar de startpagina",
    },
    folderContent: {
      folder: "Map",
      itemsUnderFolder: ({ count }) =>
        count === 1 ? "1 item in deze map." : `${count} items in deze map.`,
    },
    tagContent: {
      tag: "Label",
      tagIndex: "Labelindex",
      itemsUnderTag: ({ count }) =>
        count === 1 ? "1 item met dit label." : `${count} items met dit label.`,
      showingFirst: ({ count }) => `Eerste ${count} labels worden getoond.`,
      totalTags: ({ count }) => `${count} labels in totaal.`,
    },
    encryptedContent: {
      loading: "Laden 🔃",
      password: "Wachtwoord",
      submit: "Verzenden",
      enterPassword: "Deze pagina is vergrendeld. Voer het wachtwoord in om te ontgrendelen:",
      modernBrowser: "Gebruik een modernere browser om deze pagina te ontgrendelen.",
      wrongPassword: "Verkeerd wachtwoord. Voer het wachtwoord in:",
      noPayload: "Geen versleutelde inhoud.",
      decrypting: "Decoderen...",
      defaultDescription: "Deze pagina is versleuteld.",
    },
  },
} as const satisfies Translation