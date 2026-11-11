import { Translation } from "./definition"

export default {
  propertyDefaults: {
    title: "بدون عنوان",
    description: "شرحی ارائه نشده است",
  },
  direction: "rtl",
  components: {
    callout: {
      note: "یادداشت",
      abstract: "چکیده",
      info: "اطلاعات",
      todo: "اقدامات لازم",
      tip: "نکته",
      success: "موفقیت",
      question: "پرسش",
      warning: "هشدار",
      failure: "شکست",
      danger: "خطر",
      bug: "اشکال",
      example: "نمونه",
      quote: "نقل قول",
    },
    backlinks: {
      title: "پیوندهای معکوس",
      noBacklinksFound: "هیچ پیوند معکوسی یافت نشد",
    },
    themeToggle: {
      lightMode: "حالت روشن",
      darkMode: "حالت تاریک",
    },
    readerMode: {
      title: "حالت خواندن",
    },
    explorer: {
      title: "کاوشگر",
    },
    footer: {
      createdWith: "ساخته شده با",
    },
    graph: {
      title: "نمای گراف",
    },
    recentNotes: {
      title: "یادداشت‌های اخیر",
      seeRemainingMore: ({ remaining }) => `مشاهده ${remaining} مورد دیگر →`,
    },
    transcludes: {
      transcludeOf: ({ targetSlug }) => `وارد شده از ${targetSlug}`,
      linkToOriginal: "پیوند به اصلی",
    },
    search: {
      title: "جستجو",
      searchBarPlaceholder: "چیزی برای جستجو پیدا کنید",
    },
    tableOfContents: {
      title: "فهرست",
    },
    contentMeta: {
      readingTime: ({ minutes }) => `${minutes} دقیقه خواندن`,
    },
  },
  pages: {
    rss: {
      recentNotes: "یادداشت‌های اخیر",
      lastFewNotes: ({ count }) => `${count} یادداشت آخر`,
    },
    error: {
      title: "پیدا نشد",
      notFound: "این صفحه یا خصوصی است یا وجود ندارد.",
      home: "بازگشت به خانه",
    },
    folderContent: {
      folder: "پوشه",
      itemsUnderFolder: ({ count }) =>
        count === 1 ? "۱ مورد در این پوشه." : `${count} مورد در این پوشه.`,
    },
    tagContent: {
      tag: "برچسب",
      tagIndex: "فهرست برچسب‌ها",
      itemsUnderTag: ({ count }) =>
        count === 1 ? "۱ مورد با این برچسب." : `${count} مورد با این برچسب.`,
      showingFirst: ({ count }) => `نمایش ${count} برچسب اول.`,
      totalTags: ({ count }) => `در مجموع ${count} برچسب یافت شد.`,
    },
    encryptedContent: {
      loading: "در حال بارگذاری 🔃",
      password: "رمز عبور",
      submit: "ارسال",
      enterPassword: "این صفحه قفل شده است. لطفاً رمز عبور را وارد کنید:",
      modernBrowser: "لطفاً از مرورگر جدیدتری برای باز کردن این صفحه استفاده کنید.",
      wrongPassword: "رمز عبور اشتباه است. لطفاً رمز عبور را وارد کنید:",
      noPayload: "هیچ محتوای رمزگذاری شده‌ای وجود ندارد.",
      decrypting: "در حال رمزگشایی...",
      defaultDescription: "این صفحه رمزگذاری شده است.",
    },
  },
} as const satisfies Translation