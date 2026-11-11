import { Translation } from "./definition"

export default {
  propertyDefaults: {
    title: "Nimetön",
    description: "Ei kuvausta",
  },
  components: {
    callout: {
      note: "Huomautus",
      abstract: "Tiivistelmä",
      info: "Info",
      todo: "Tehtävä",
      tip: "Vinkki",
      success: "Menestys",
      question: "Kysymys",
      warning: "Varoitus",
      failure: "Epäonnistuminen",
      danger: "Vaara",
      bug: "Bugi",
      example: "Esimerkki",
      quote: "Lainaus",
    },
    backlinks: {
      title: "Takaisinkytkennät",
      noBacklinksFound: "Takaisinkytkentöjä ei löytynyt",
    },
    themeToggle: {
      lightMode: "Vaalea tila",
      darkMode: "Tumma tila",
    },
    readerMode: {
      title: "Lukutila",
    },
    explorer: {
      title: "Tutkimus",
    },
    footer: {
      createdWith: "Luotu käyttäen",
    },
    graph: {
      title: "Verkkonäkymä",
    },
    recentNotes: {
      title: "Viimeisimmät muistiinpanot",
      seeRemainingMore: ({ remaining }) => `Katso ${remaining} lisää →`,
    },
    transcludes: {
      transcludeOf: ({ targetSlug }) => `Sisällytä ${targetSlug}`,
      linkToOriginal: "Linkki alkuperäiseen",
    },
    search: {
      title: "Haku",
      searchBarPlaceholder: "Etsi jotakin",
    },
    tableOfContents: {
      title: "Sisällysluettelo",
    },
    contentMeta: {
      readingTime: ({ minutes }) => `${minutes} min luku`,
    },
  },
  pages: {
    rss: {
      recentNotes: "Viimeisimmät muistiinpanot",
      lastFewNotes: ({ count }) => `Viimeiset ${count} muistiinpanot`,
    },
    error: {
      title: "Ei löytynyt",
      notFound: "Tämä sivu on joko yksityinen tai sitä ei ole olemassa.",
      home: "Palaa kotisivulle",
    },
    folderContent: {
      folder: "Kansio",
      itemsUnderFolder: ({ count }) =>
        count === 1 ? "1 kohde tässä kansiossa." : `${count} kohdetta tässä kansiossa.`,
    },
    tagContent: {
      tag: "Tunniste",
      tagIndex: "Tunnisteluettelo",
      itemsUnderTag: ({ count }) =>
        count === 1 ? "1 kohde tällä tunnisteella." : `${count} kohdetta tällä tunnisteella.`,
      showingFirst: ({ count }) => `Näytetään ensimmäiset ${count} tunnistetta.`,
      totalTags: ({ count }) => `Löytyi ${count} tunniste(a/tta) yhteensä.`,
    },
    encryptedContent: {
      loading: "Ladataan 🔃",
      password: "Salasana",
      submit: "Lähetä",
      enterPassword: "Tämä sivu on lukittu. Syötä salasana avataksesi:",
      modernBrowser: "Käytä nykyaikaista selainta avataksesi tämän sivun.",
      wrongPassword: "Väärä salasana. Syötä salasana:",
      noPayload: "Ei salattua sisältöä.",
      decrypting: "Puretaan...",
      defaultDescription: "Tämä sivu on salattu.",
    },
  },
} as const satisfies Translation