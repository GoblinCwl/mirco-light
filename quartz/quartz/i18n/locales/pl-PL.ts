import { Translation } from "./definition"

export default {
  propertyDefaults: {
    title: "Bez tytułu",
    description: "Brak opisu",
  },
  components: {
    callout: {
      note: "Notatka",
      abstract: "Streszczenie",
      info: "Informacja",
      todo: "Do zrobienia",
      tip: "Wskazówka",
      success: "Powodzenie",
      question: "Pytanie",
      warning: "Ostrzeżenie",
      failure: "Niepowodzenie",
      danger: "Niebezpieczeństwo",
      bug: "Błąd",
      example: "Przykład",
      quote: "Cytat",
    },
    backlinks: {
      title: "Odnośniki zwrotne",
      noBacklinksFound: "Nie znaleziono odnośników zwrotnych",
    },
    themeToggle: {
      lightMode: "Tryb jasny",
      darkMode: "Tryb ciemny",
    },
    readerMode: {
      title: "Tryb czytelniczy",
    },
    explorer: {
      title: "Eksplorator",
    },
    footer: {
      createdWith: "Stworzone przy użyciu",
    },
    graph: {
      title: "Widok grafu",
    },
    recentNotes: {
      title: "Ostatnie notatki",
      seeRemainingMore: ({ remaining }) => `Zobacz ${remaining} więcej →`,
    },
    transcludes: {
      transcludeOf: ({ targetSlug }) => `Osadzone z ${targetSlug}`,
      linkToOriginal: "Link do oryginału",
    },
    search: {
      title: "Wyszukiwanie",
      searchBarPlaceholder: "Wyszukaj coś",
    },
    tableOfContents: {
      title: "Spis treści",
    },
    contentMeta: {
      readingTime: ({ minutes }) => `${minutes} min czytania`,
    },
  },
  pages: {
    rss: {
      recentNotes: "Ostatnie notatki",
      lastFewNotes: ({ count }) => `Ostatnie ${count} notatki`,
    },
    error: {
      title: "Nie znaleziono",
      notFound: "Ta strona jest prywatna lub nie istnieje.",
      home: "Powrót do strony głównej",
    },
    folderContent: {
      folder: "Folder",
      itemsUnderFolder: ({ count }) =>
        count === 1 ? "1 element w tym folderze." : `${count} elementy(-ów) w tym folderze.`,
    },
    tagContent: {
      tag: "Tag",
      tagIndex: "Indeks tagów",
      itemsUnderTag: ({ count }) =>
        count === 1 ? "1 element oznaczony tym tagiem." : `${count} elementy(-ów) oznaczonych tym tagiem.`,
      showingFirst: ({ count }) => `Pokazuje pierwsze ${count} tagi(-ów).`,
      totalTags: ({ count }) => `Łącznie znaleziono ${count} tag(i).`,
    },
    encryptedContent: {
      loading: "Ładowanie 🔃",
      password: "Hasło",
      submit: "Zatwierdź",
      enterPassword: "Ta strona jest zablokowana. Proszę wprowadzić hasło, aby ją odblokować:",
      modernBrowser: "Proszę użyć nowoczesnej przeglądarki, aby odblokować tę stronę.",
      wrongPassword: "Nieprawidłowe hasło. Proszę wprowadzić hasło:",
      noPayload: "Brak zaszyfrowanej zawartości.",
      decrypting: "Odszyfrowywanie...",
      defaultDescription: "Ta strona jest zaszyfrowana.",
    },
  },
} as const satisfies Translation