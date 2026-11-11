import { Translation } from "./definition"

export default {
  propertyDefaults: {
    title: "Névtelen",
    description: "Nincs leírás",
  },
  components: {
    callout: {
      note: "Jegyzet",
      abstract: "Kivonat",
      info: "Infó",
      todo: "Tennivaló",
      tip: "Tipp",
      success: "Siker",
      question: "Kérdés",
      warning: "Figyelmeztetés",
      failure: "Hiba",
      danger: "Veszély",
      bug: "Hiba",
      example: "Példa",
      quote: "Idézet",
    },
    backlinks: {
      title: "Visszacsatolások",
      noBacklinksFound: "Nincsenek visszacsatolások",
    },
    themeToggle: {
      lightMode: "Világos mód",
      darkMode: "Sötét mód",
    },
    readerMode: {
      title: "Olvasó mód",
    },
    explorer: {
      title: "Felfedező",
    },
    footer: {
      createdWith: "Készítve ezzel:",
    },
    graph: {
      title: "Gráf nézet",
    },
    recentNotes: {
      title: "Legutóbbi jegyzetek",
      seeRemainingMore: ({ remaining }) => `Még ${remaining} darab →`,
    },
    transcludes: {
      transcludeOf: ({ targetSlug }) => `${targetSlug} beillesztése`,
      linkToOriginal: "Hivatkozás az eredetire",
    },
    search: {
      title: "Keresés",
      searchBarPlaceholder: "Keress valamire",
    },
    tableOfContents: {
      title: "Tartalomjegyzék",
    },
    contentMeta: {
      readingTime: ({ minutes }) => `${minutes} perc olvasás`,
    },
  },
  pages: {
    rss: {
      recentNotes: "Legutóbbi jegyzetek",
      lastFewNotes: ({ count }) => `Legutóbbi ${count} jegyzet`,
    },
    error: {
      title: "Nem található",
      notFound: "Ez a lap vagy privát, vagy nem létezik.",
      home: "Vissza a főoldalra",
    },
    folderContent: {
      folder: "Mappa",
      itemsUnderFolder: ({ count }) =>
        count === 1 ? "1 elem van ebben a mappában." : `${count} elem van ebben a mappában.`,
    },
    tagContent: {
      tag: "Címke",
      tagIndex: "Címke index",
      itemsUnderTag: ({ count }) =>
        count === 1 ? "1 elem tartozik ehhez a címkéhez." : `${count} elem tartozik ehhez a címkéhez.`,
      showingFirst: ({ count }) => `Első ${count} címke megjelenítve.`,
      totalTags: ({ count }) => `Összesen ${count} címke található.`,
    },
    encryptedContent: {
      loading: "Betöltés 🔃",
      password: "Jelszó",
      submit: "Elküld",
      enterPassword: "Ez a lap zárolva van. Kérlek add meg a jelszót a feloldáshoz:",
      modernBrowser: "Kérlek használj modern böngészőt a lap feloldásához.",
      wrongPassword: "Hibás jelszó. Kérlek add meg újra a jelszót:",
      noPayload: "Nincs titkosított adat.",
      decrypting: "Visszafejtés...",
      defaultDescription: "Ez a lap titkosítva van.",
    },
  },
} as const satisfies Translation