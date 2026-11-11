import { Translation } from "./definition"

export default {
  propertyDefaults: {
    title: "Sin título",
    description: "Sin descripción proporcionada",
  },
  components: {
    callout: {
      note: "Nota",
      abstract: "Resumen",
      info: "Información",
      todo: "Por hacer",
      tip: "Consejo",
      success: "Éxito",
      question: "Pregunta",
      warning: "Advertencia",
      failure: "Fallo",
      danger: "Peligro",
      bug: "Error",
      example: "Ejemplo",
      quote: "Cita",
    },
    backlinks: {
      title: "Enlaces inversos",
      noBacklinksFound: "No se encontraron enlaces inversos",
    },
    themeToggle: {
      lightMode: "Modo claro",
      darkMode: "Modo oscuro",
    },
    readerMode: {
      title: "Modo lectura",
    },
    explorer: {
      title: "Explorador",
    },
    footer: {
      createdWith: "Creado con",
    },
    graph: {
      title: "Vista de Gráfico",
    },
    recentNotes: {
      title: "Notas Recientes",
      seeRemainingMore: ({ remaining }) => `Ver ${remaining} más →`,
    },
    transcludes: {
      transcludeOf: ({ targetSlug }) => `Transcluido de ${targetSlug}`,
      linkToOriginal: "Enlace al original",
    },
    search: {
      title: "Buscar",
      searchBarPlaceholder: "Buscar algo",
    },
    tableOfContents: {
      title: "Tabla de Contenidos",
    },
    contentMeta: {
      readingTime: ({ minutes }) => `${minutes} min lectura`,
    },
  },
  pages: {
    rss: {
      recentNotes: "Notas recientes",
      lastFewNotes: ({ count }) => `Últimas ${count} notas`,
    },
    error: {
      title: "No Encontrado",
      notFound: "Esta página es privada o no existe.",
      home: "Regresar a la Página de Inicio",
    },
    folderContent: {
      folder: "Carpeta",
      itemsUnderFolder: ({ count }) =>
        count === 1 ? "1 elemento en esta carpeta." : `${count} elementos en esta carpeta.`,
    },
    tagContent: {
      tag: "Etiqueta",
      tagIndex: "Índice de Etiquetas",
      itemsUnderTag: ({ count }) =>
        count === 1 ? "1 elemento con esta etiqueta." : `${count} elementos con esta etiqueta.`,
      showingFirst: ({ count }) => `Mostrando las primeras ${count} etiquetas.`,
      totalTags: ({ count }) => `${count} etiquetas encontradas en total.`,
    },
    encryptedContent: {
      loading: "Cargando 🔃",
      password: "Contraseña",
      submit: "Enviar",
      enterPassword: "Esta página está bloqueada. Por favor ingrese la contraseña para desbloquearla:",
      modernBrowser: "Por favor use un navegador más moderno para desbloquear esta página.",
      wrongPassword: "Contraseña incorrecta. Por favor ingrese la contraseña:",
      noPayload: "No hay contenido cifrado.",
      decrypting: "Descifrando...",
      defaultDescription: "Esta página está cifrada.",
    },
  },
} as const satisfies Translation