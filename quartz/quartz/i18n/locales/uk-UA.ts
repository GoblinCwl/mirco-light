import { Translation } from "./definition"

export default {
  propertyDefaults: {
    title: "Без назви",
    description: "Без опису",
  },
  components: {
    callout: {
      note: "Примітка",
      abstract: "Абстракт",
      info: "Інформація",
      todo: "Завдання",
      tip: "Порада",
      success: "Успіх",
      question: "Питання",
      warning: "Попередження",
      failure: "Невдача",
      danger: "Небезпека",
      bug: "Помилка",
      example: "Приклад",
      quote: "Цитата",
    },
    backlinks: {
      title: "Зворотні посилання",
      noBacklinksFound: "Зворотних посилань не знайдено",
    },
    themeToggle: {
      lightMode: "Світлий режим",
      darkMode: "Темний режим",
    },
    readerMode: {
      title: "Режим читання",
    },
    explorer: {
      title: "Провідник",
    },
    footer: {
      createdWith: "Створено за допомогою",
    },
    graph: {
      title: "Граф подання",
    },
    recentNotes: {
      title: "Останні нотатки",
      seeRemainingMore: ({ remaining }) => `Переглянути ще ${remaining} →`,
    },
    transcludes: {
      transcludeOf: ({ targetSlug }) => `Включення з ${targetSlug}`,
      linkToOriginal: "Посилання на оригінал",
    },
    search: {
      title: "Пошук",
      searchBarPlaceholder: "Знайти щось",
    },
    tableOfContents: {
      title: "Зміст",
    },
    contentMeta: {
      readingTime: ({ minutes }) => `${minutes} хв читання`,
    },
  },
  pages: {
    rss: {
      recentNotes: "Останні нотатки",
      lastFewNotes: ({ count }) => `Останні ${count} нотатки`,
    },
    error: {
      title: "Не знайдено",
      notFound: "Ця сторінка або приватна, або не існує.",
      home: "Повернутися на головну сторінку",
    },
    folderContent: {
      folder: "Папка",
      itemsUnderFolder: ({ count }) =>
        count === 1 ? "1 елемент у цій папці." : `${count} елементів у цій папці.`,
    },
    tagContent: {
      tag: "Тег",
      tagIndex: "Індекс тегів",
      itemsUnderTag: ({ count }) =>
        count === 1 ? "1 елемент з цим тегом." : `${count} елементів з цим тегом.`,
      showingFirst: ({ count }) => `Показано перші ${count} тегів.`,
      totalTags: ({ count }) => `Знайдено загалом ${count} тегів.`,
    },
    encryptedContent: {
      loading: "Завантаження 🔃",
      password: "Пароль",
      submit: "Надіслати",
      enterPassword: "Ця сторінка заблокована. Будь ласка, введіть пароль для розблокування:",
      modernBrowser: "Будь ласка, скористайтеся сучаснішим браузером для розблокування цієї сторінки.",
      wrongPassword: "Неправильний пароль. Будь ласка, введіть пароль:",
      noPayload: "Немає зашифрованих даних.",
      decrypting: "Розшифровка...",
      defaultDescription: "Ця сторінка зашифрована.",
    },
  },
} as const satisfies Translation