import { Translation } from "./definition"

export default {
  propertyDefaults: {
    title: "Bez názvu",
    description: "Bez popisu",
  },
  components: {
    callout: {
      note: "Poznámka",
      abstract: "Abstrakt",
      info: "Informace",
      todo: "Úkol",
      tip: "Tip",
      success: "Úspěch",
      question: "Otázka",
      warning: "Varování",
      failure: "Neúspěch",
      danger: "Nebezpečí",
      bug: "Chyba",
      example: "Příklad",
      quote: "Citace",
    },
    backlinks: {
      title: "Zpětné odkazy",
      noBacklinksFound: "Nenalezeny žádné zpětné odkazy",
    },
    themeToggle: {
      lightMode: "Světlý režim",
      darkMode: "Tmavý režim",
    },
    readerMode: {
      title: "Režim čtenáře",
    },
    explorer: {
      title: "Průzkumník",
    },
    footer: {
      createdWith: "Vytvořeno pomocí",
    },
    graph: {
      title: "Zobrazení grafu",
    },
    recentNotes: {
      title: "Nedávné poznámky",
      seeRemainingMore: ({ remaining }) => `Zobrazit dalších ${remaining} →`,
    },
    transcludes: {
      transcludeOf: ({ targetSlug }) => `Vložení ${targetSlug}`,
      linkToOriginal: "Odkaz na originál",
    },
    search: {
      title: "Hledat",
      searchBarPlaceholder: "Najít něco",
    },
    tableOfContents: {
      title: "Obsah",
    },
    contentMeta: {
      readingTime: ({ minutes }) => `${minutes} min čtení`,
    },
  },
  pages: {
    rss: {
      recentNotes: "Nedávné poznámky",
      lastFewNotes: ({ count }) => `Posledních ${count} poznámek`,
    },
    error: {
      title: "Nenalezeno",
      notFound: "Tato stránka je soukromá nebo neexistuje.",
      home: "Návrat na domovskou stránku",
    },
    folderContent: {
      folder: "Složka",
      itemsUnderFolder: ({ count }) =>
        count === 1 ? "1 položka v této složce." : `${count} položek v této složce.`,
    },
    tagContent: {
      tag: "Štítek",
      tagIndex: "Index štítků",
      itemsUnderTag: ({ count }) =>
        count === 1 ? "1 položka s tímto štítkem." : `${count} položek s tímto štítkem.`,
      showingFirst: ({ count }) => `Zobrazuji prvních ${count} štítků.`,
      totalTags: ({ count }) => `Nalezeno celkem ${count} štítků.`,
    },
    encryptedContent: {
      loading: "Načítání 🔃",
      password: "Heslo",
      submit: "Odeslat",
      enterPassword: "Tato stránka je uzamčena. Chcete-li ji odemknout, zadejte heslo:",
      modernBrowser: "Chcete-li odemknout tuto stránku, použijte modernější prohlížeč.",
      wrongPassword: "Nesprávné heslo. Zadejte prosím správné heslo:",
      noPayload: "Žádná zašifrovaná data.",
      decrypting: "Dešifrování...",
      defaultDescription: "Tato stránka je zašifrovaná.",
    },
  },
} as const satisfies Translation