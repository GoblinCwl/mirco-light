import { Translation } from "./definition"

export default {
  propertyDefaults: {
    title: "Sem título",
    description: "Nenhuma descrição fornecida",
  },
  components: {
    callout: {
      note: "Nota",
      abstract: "Resumo",
      info: "Informação",
      todo: "A fazer",
      tip: "Dica",
      success: "Sucesso",
      question: "Pergunta",
      warning: "Aviso",
      failure: "Falha",
      danger: "Perigo",
      bug: "Erro",
      example: "Exemplo",
      quote: "Citação",
    },
    backlinks: {
      title: "Backlinks",
      noBacklinksFound: "Nenhum backlink encontrado",
    },
    themeToggle: {
      lightMode: "Modo claro",
      darkMode: "Modo escuro",
    },
    readerMode: {
      title: "Modo leitura",
    },
    explorer: {
      title: "Explorador",
    },
    footer: {
      createdWith: "Criado com",
    },
    graph: {
      title: "Visualização em Grafo",
    },
    recentNotes: {
      title: "Notas Recentes",
      seeRemainingMore: ({ remaining }) => `Veja mais ${remaining} →`,
    },
    transcludes: {
      transcludeOf: ({ targetSlug }) => `Transcluído de ${targetSlug}`,
      linkToOriginal: "Link para o original",
    },
    search: {
      title: "Pesquisa",
      searchBarPlaceholder: "Pesquisar por algo",
    },
    tableOfContents: {
      title: "Índice",
    },
    contentMeta: {
      readingTime: ({ minutes }) => `${minutes} min de leitura`,
    },
  },
  pages: {
    rss: {
      recentNotes: "Notas recentes",
      lastFewNotes: ({ count }) => `Últimas ${count} notas`,
    },
    error: {
      title: "Não Encontrado",
      notFound: "Esta página é privada ou não existe.",
      home: "Voltar à Página Inicial",
    },
    folderContent: {
      folder: "Pasta",
      itemsUnderFolder: ({ count }) =>
        count === 1 ? "1 item nesta pasta." : `${count} itens nesta pasta.`,
    },
    tagContent: {
      tag: "Tag",
      tagIndex: "Índice de Tags",
      itemsUnderTag: ({ count }) =>
        count === 1 ? "1 item com esta tag." : `${count} itens com esta tag.`,
      showingFirst: ({ count }) => `Mostrando as primeiras ${count} tags.`,
      totalTags: ({ count }) => `Encontradas ${count} tags no total.`,
    },
    encryptedContent: {
      loading: "Carregando 🔃",
      password: "Senha",
      submit: "Enviar",
      enterPassword: "Esta página está bloqueada. Digite a senha para desbloquear:",
      modernBrowser: "Por favor, use um navegador mais moderno para desbloquear esta página.",
      wrongPassword: "Senha incorreta. Por favor, digite a senha:",
      noPayload: "Nenhum conteúdo criptografado.",
      decrypting: "Descriptografando...",
      defaultDescription: "Esta página está criptografada.",
    },
  },
} as const satisfies Translation