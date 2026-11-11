import { Translation } from "./definition"

export default {
  propertyDefaults: {
    title: "ללא כותרת",
    description: "לא סופק תיאור",
  },
  direction: "rtl",
  components: {
    callout: {
      note: "הערה",
      abstract: "תקציר",
      info: "מידע",
      todo: "לביצוע",
      tip: "טיפ",
      success: "הצלחה",
      question: "שאלה",
      warning: "אזהרה",
      failure: "כישלון",
      danger: "סכנה",
      bug: "באג",
      example: "דוגמה",
      quote: "ציטוט",
    },
    backlinks: {
      title: "קישורים חזרה",
      noBacklinksFound: "לא נמצאו קישורים חזרה",
    },
    themeToggle: {
      lightMode: "מצב מואר",
      darkMode: "מצב כהה",
    },
    readerMode: {
      title: "מצב קריאה",
    },
    explorer: {
      title: "סייר",
    },
    footer: {
      createdWith: "נוצר באמצעות",
    },
    graph: {
      title: "תצוגת גרף",
    },
    recentNotes: {
      title: "הערות אחרונות",
      seeRemainingMore: ({ remaining }) => `ראה ${remaining} נוספות →`,
    },
    transcludes: {
      transcludeOf: ({ targetSlug }) => `הכללת ${targetSlug}`,
      linkToOriginal: "קישור למקור",
    },
    search: {
      title: "חיפוש",
      searchBarPlaceholder: "חפש משהו",
    },
    tableOfContents: {
      title: "תוכן עניינים",
    },
    contentMeta: {
      readingTime: ({ minutes }) => `קריאה של ${minutes} דק'`,
    },
  },
  pages: {
    rss: {
      recentNotes: "הערות אחרונות",
      lastFewNotes: ({ count }) => `${count} הערות אחרונות`,
    },
    error: {
      title: "לא נמצא",
      notFound: "דף זה פרטי או שאינו קיים.",
      home: "חזרה לדף הבית",
    },
    folderContent: {
      folder: "תיקייה",
      itemsUnderFolder: ({ count }) =>
        count === 1 ? "פריט אחד בתיקייה זו." : `${count} פריטים בתיקייה זו.`,
    },
    tagContent: {
      tag: "תג",
      tagIndex: "אינדקס תגים",
      itemsUnderTag: ({ count }) =>
        count === 1 ? "פריט אחד עם תג זה." : `${count} פריטים עם תג זה.`,
      showingFirst: ({ count }) => `מציג את ${count} התגים הראשונים.`,
      totalTags: ({ count }) => `נמצאו ${count} תגים בסך הכל.`,
    },
    encryptedContent: {
      loading: "טוען 🔃",
      password: "סיסמה",
      submit: "שלח",
      enterPassword: "דף זה נעול. אנא הזן סיסמה כדי-unlock:",
      modernBrowser: "אנא השתמש בדפדפן עדכני יותר כדי לפתוח דף זה.",
      wrongPassword: "סיסמה שגויה. אנא הזן את הסיסמה:",
      noPayload: "אין תוכן מוצפן.",
      decrypting: "מפענח...",
      defaultDescription: "דף זה מוצפן.",
    },
  },
} as const satisfies Translation