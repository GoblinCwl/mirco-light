import { Translation } from "./definition"

export default {
  propertyDefaults: {
    title: "بدون عنوان",
    description: "لا يوجد وصف",
  },
  direction: "rtl",
  components: {
    callout: {
      note: "ملاحظة",
      abstract: "ملخص",
      info: "معلومات",
      todo: "للقيام",
      tip: "تلميح",
      success: "نجاح",
      question: "سؤال",
      warning: "تحذير",
      failure: "فشل",
      danger: "خطر",
      bug: "خلل",
      example: "مثال",
      quote: "اقتباس",
    },
    backlinks: {
      title: "الروابط العكسية",
      noBacklinksFound: "لا توجد روابط عكسية",
    },
    themeToggle: {
      lightMode: "الوضع النهاري",
      darkMode: "الوضع الليلي",
    },
    readerMode: {
      title: "وضع القارئ",
    },
    explorer: {
      title: "المستعرض",
    },
    footer: {
      createdWith: "تم إنشاؤه باستخدام",
    },
    graph: {
      title: "عرض المخطط",
    },
    recentNotes: {
      title: "الملاحظات الحديثة",
      seeRemainingMore: ({ remaining }) => `عرض ${remaining} أكثر ←`,
    },
    transcludes: {
      transcludeOf: ({ targetSlug }) => `تضمين لـ ${targetSlug}`,
      linkToOriginal: "رابط إلى الأصل",
    },
    search: {
      title: "البحث",
      searchBarPlaceholder: "ابحث عن شيء ما",
    },
    tableOfContents: {
      title: "جدول المحتويات",
    },
    contentMeta: {
      readingTime: ({ minutes }) => `قراءة تامة خلال ${minutes} دقيقة`,
    },
  },
  pages: {
    rss: {
      recentNotes: "الملاحظات الحديثة",
      lastFewNotes: ({ count }) => `آخر ${count} ملاحظات`,
    },
    error: {
      title: "غير موجود",
      notFound: "إما أن تكون هذه الصفحة خاصة أو غير موجودة.",
      home: "العودة إلى الصفحة الرئيسية",
    },
    folderContent: {
      folder: "مجلد",
      itemsUnderFolder: ({ count }) =>
        count === 1 ? "يوجد عنصر واحد ضمن هذا المجلد." : `يوجد ${count} عناصر ضمن هذا المجلد.`,
    },
    tagContent: {
      tag: "وسم",
      tagIndex: "فهرس الوسوم",
      itemsUnderTag: ({ count }) =>
        count === 1 ? "يوجد عنصر واحد موسوم بهذا." : `يوجد ${count} عناصر موسومة بهذا.`,
      showingFirst: ({ count }) => `عرض أول ${count} أوسمة.`,
      totalTags: ({ count }) => `إجمالي ${count} أوسمة.`,
    },
    encryptedContent: {
      loading: "جارٍ التحميل 🔃",
      password: "كلمة المرور",
      submit: "إرسال",
      enterPassword: "هذه الصفحة مؤمنة. يرجى إدخال كلمة المرور لفتحها:",
      modernBrowser: "يرجى استخدام متصفح أحدث لتمكين فتح هذه الصفحة.",
      wrongPassword: "كلمة مرور خاطئة. يرجى إدخال كلمة المرور:",
      noPayload: "لا توجد بيانات مشفرة.",
      decrypting: "جاري فك التشفير...",
      defaultDescription: "هذه الصفحة مشفرة.",
    },
  },
} as const satisfies Translation