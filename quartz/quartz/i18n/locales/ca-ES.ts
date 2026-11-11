import { Translation } from "./definition"

export default {
  propertyDefaults: {
    title: "Sense títol",
    description: "Cap descripció proveïda",
  },
  components: {
    callout: {
      note: "Nota",
      abstract: "Resum",
      info: "Informació",
      todo: "Pendent",
      tip: "Consell",
      success: "Èxit",
      question: "Pregunta",
      warning: "Advertència",
      failure: "Fallada",
      danger: "Perill",
      bug: "Error",
      example: "Exemple",
      quote: "Cita",
    },
    backlinks: {
      title: "Enllaços cap enrere",
      noBacklinksFound: "No s'han trobat enllaços cap enrere",
    },
    themeToggle: {
      lightMode: "Mode clar",
      darkMode: "Mode fosc",
    },
    readerMode: {
      title: "Mode lector",
    },
    explorer: {
      title: "Explorador",
    },
    footer: {
      createdWith: "Creat amb",
    },
    graph: {
      title: "Vista de graf",
    },
    recentNotes: {
      title: "Notes recents",
      seeRemainingMore: ({ remaining }) => `Veure ${remaining} més →`,
    },
    transcludes: {
      transcludeOf: ({ targetSlug }) => `Transcluit de ${targetSlug}`,
      linkToOriginal: "Enllaç a l'original",
    },
    search: {
      title: "Cercar",
      searchBarPlaceholder: "Cerca alguna cosa",
    },
    tableOfContents: {
      title: "Taula de continguts",
    },
    contentMeta: {
      readingTime: ({ minutes }) => `${minutes} min de lectura`,
    },
  },
  pages: {
    rss: {
      recentNotes: "Notes recents",
      lastFewNotes: ({ count }) => `Últimes ${count} notes`,
    },
    error: {
      title: "No trobat",
      notFound: "Aquesta pàgina és privada o no existeix.",
      home: "Tornar a la pàgina d'inici",
    },
    folderContent: {
      folder: "Carpeta",
      itemsUnderFolder: ({ count }) =>
        count === 1 ? "1 element en aquesta carpeta." : `${count} elements en aquesta carpeta.`,
    },
    tagContent: {
      tag: "Etiqueta",
      tagIndex: "Índex d'etiquetes",
      itemsUnderTag: ({ count }) =>
        count === 1 ? "1 element amb aquesta etiqueta." : `${count} elements amb aquesta etiqueta.`,
      showingFirst: ({ count }) => `Mostrant les primeres ${count} etiquetes.`,
      totalTags: ({ count }) => `S'han trobat ${count} etiquetes en total.`,
    },
    encryptedContent: {
      loading: "Carregant 🔃",
      password: "Contrasenya",
      submit: "Enviar",
      enterPassword: "Aquesta pàgina està bloquejada. Si us plau, introdueix la contrasenya per desbloquejar:",
      modernBrowser: "Si us plau, utilitza un navegador més modern per desbloquejar aquesta pàgina.",
      wrongPassword: "Contrasenya incorrecta. Si us plau, introdueix la contrasenya:",
      noPayload: "No hi ha contingut xifrat.",
      decrypting: "Desxifrant...",
      defaultDescription: "Aquesta pàgina està xifrada.",
    },
  },
} as const satisfies Translation