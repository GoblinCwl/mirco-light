import { Translation } from "./definition"

export default {
  propertyDefaults: {
    title: "Sans titre",
    description: "Aucune description fournie",
  },
  components: {
    callout: {
      note: "Note",
      abstract: "Résumé",
      info: "Info",
      todo: "À faire",
      tip: "Conseil",
      success: "Succès",
      question: "Question",
      warning: "Avertissement",
      failure: "Échec",
      danger: "Danger",
      bug: "Bogue",
      example: "Exemple",
      quote: "Citation",
    },
    backlinks: {
      title: "Liens retour",
      noBacklinksFound: "Aucun lien retour trouvé",
    },
    themeToggle: {
      lightMode: "Mode clair",
      darkMode: "Mode sombre",
    },
    readerMode: {
      title: "Mode lecture",
    },
    explorer: {
      title: "Explorateur",
    },
    footer: {
      createdWith: "Créé avec",
    },
    graph: {
      title: "Vue Graphique",
    },
    recentNotes: {
      title: "Notes Récentes",
      seeRemainingMore: ({ remaining }) => `Voir ${remaining} de plus →`,
    },
    transcludes: {
      transcludeOf: ({ targetSlug }) => `Transclusion de ${targetSlug}`,
      linkToOriginal: "Lien vers l'original",
    },
    search: {
      title: "Recherche",
      searchBarPlaceholder: "Rechercher quelque chose",
    },
    tableOfContents: {
      title: "Table des Matières",
    },
    contentMeta: {
      readingTime: ({ minutes }) => `${minutes} min de lecture`,
    },
  },
  pages: {
    rss: {
      recentNotes: "Notes récentes",
      lastFewNotes: ({ count }) => `Les dernières ${count} notes`,
    },
    error: {
      title: "Page Introuvable",
      notFound: "Cette page est soit privée, soit inexistante.",
      home: "Retour à la Page d'Accueil",
    },
    folderContent: {
      folder: "Dossier",
      itemsUnderFolder: ({ count }) =>
        count === 1 ? "1 élément sous ce dossier." : `${count} éléments sous ce dossier.`,
    },
    tagContent: {
      tag: "Étiquette",
      tagIndex: "Index des Étiquettes",
      itemsUnderTag: ({ count }) =>
        count === 1 ? "1 élément avec cette étiquette." : `${count} éléments avec cette étiquette.`,
      showingFirst: ({ count }) => `Affichage des premières ${count} étiquettes.`,
      totalTags: ({ count }) => `${count} étiquettes trouvées au total.`,
    },
    encryptedContent: {
      loading: "Chargement 🔃",
      password: "Mot de passe",
      submit: "Soumettre",
      enterPassword: "Cette page est verrouillée. Veuillez entrer le mot de passe pour déverrouiller:",
      modernBrowser: "Veuillez utiliser un navigateur plus récent pour déverrouiller cette page.",
      wrongPassword: "Mot de passe incorrect. Veuillez entrer le mot de passe:",
      noPayload: "Aucune charge utile chiffrée.",
      decrypting: "Déchiffrement...",
      defaultDescription: "Cette page est chiffrée.",
    },
  },
} as const satisfies Translation