import { Translation } from "./definition"

export default {
  propertyDefaults: {
    title: "Без названия",
    description: "Без описания",
  },
  components: {
    callout: {
      note: "Заметка",
      abstract: "Резюме",
      info: "Информация",
      todo: "Сделать",
      tip: "Подсказка",
      success: "Успех",
      question: "Вопрос",
      warning: "Предупреждение",
      failure: "Неудача",
      danger: "Опасность",
      bug: "Ошибка",
      example: "Пример",
      quote: "Цитата",
    },
    backlinks: {
      title: "Обратные ссылки",
      noBacklinksFound: "Обратные ссылки не найдены",
    },
    themeToggle: {
      lightMode: "Светлый режим",
      darkMode: "Тёмный режим",
    },
    readerMode: {
      title: "Режим чтения",
    },
    explorer: {
      title: "Проводник",
    },
    footer: {
      createdWith: "Создано с помощью",
    },
    graph: {
      title: "Вид графа",
    },
    recentNotes: {
      title: "Недавние заметки",
      seeRemainingMore: ({ remaining }) => `Посмотреть ещё ${remaining} →`,
    },
    transcludes: {
      transcludeOf: ({ targetSlug }) => `Включает ${targetSlug}`,
      linkToOriginal: "Ссылка на оригинал",
    },
    search: {
      title: "Поиск",
      searchBarPlaceholder: "Найти что-нибудь",
    },
    tableOfContents: {
      title: "Содержание",
    },
    contentMeta: {
      readingTime: ({ minutes }) => `${minutes} мин. чтения`,
    },
  },
  pages: {
    rss: {
      recentNotes: "Недавние заметки",
      lastFewNotes: ({ count }) => `Последние ${count} заметок`,
    },
    error: {
      title: "Страница не найдена",
      notFound: "Эта страница приватная или не существует.",
      home: "Вернуться на главную страницу",
    },
    folderContent: {
      folder: "Папка",
      itemsUnderFolder: ({ count }) =>
        count === 1 ? "1 элемент в этой папке." : `${count} элементов в этой папке.`,
    },
    tagContent: {
      tag: "Тег",
      tagIndex: "Индекс тегов",
      itemsUnderTag: ({ count }) =>
        count === 1 ? "1 элемент с этим тегом." : `${count} элементов с этим тегом.`,
      showingFirst: ({ count }) => `Показаны первые ${count} тегов.`,
      totalTags: ({ count }) => `Найдено ${count} тегов всего.`,
    },
    encryptedContent: {
      loading: "Загрузка 🔃",
      password: "Пароль",
      submit: "Отправить",
      enterPassword: "Эта страница заблокирована. Пожалуйста, введите пароль для разблокировки:",
      modernBrowser: "Пожалуйста, используйте более современный браузер для разблокировки этой страницы.",
      wrongPassword: "Неверный пароль. Пожалуйста, введите пароль:",
      noPayload: "Нет зашифрованных данных.",
      decrypting: "Расшифровка...",
      defaultDescription: "Эта страница зашифрована.",
    },
  },
} as const satisfies Translation