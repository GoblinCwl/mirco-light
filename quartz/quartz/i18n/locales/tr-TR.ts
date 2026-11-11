import { Translation } from "./definition"

export default {
  propertyDefaults: {
    title: "İsimsiz",
    description: "Açıklama girilmemiş",
  },
  components: {
    callout: {
      note: "Not",
      abstract: "Özet",
      info: "Bilgi",
      todo: "Yapılacak",
      tip: "İpucu",
      success: "Başarı",
      question: "Soru",
      warning: "Uyarı",
      failure: "Başarısızlık",
      danger: "Tehlike",
      bug: "Hata",
      example: "Örnek",
      quote: "Alıntı",
    },
    backlinks: {
      title: "Geri bağlantılar",
      noBacklinksFound: "Geri bağlantı bulunamadı",
    },
    themeToggle: {
      lightMode: "Açık mod",
      darkMode: "Koyu mod",
    },
    readerMode: {
      title: "Okuyucu modu",
    },
    explorer: {
      title: "Gezgin",
    },
    footer: {
      createdWith: "Oluşturan",
    },
    graph: {
      title: "Grafik Görünümü",
    },
    recentNotes: {
      title: "Son Notlar",
      seeRemainingMore: ({ remaining }) => `${remaining} tanesini gör →`,
    },
    transcludes: {
      transcludeOf: ({ targetSlug }) => `${targetSlug} içeriği aktarıldı`,
      linkToOriginal: "Orijinal bağlantı",
    },
    search: {
      title: "Arama",
      searchBarPlaceholder: "Bir şey arayın",
    },
    tableOfContents: {
      title: "İçindekiler",
    },
    contentMeta: {
      readingTime: ({ minutes }) => `${minutes} dk okuma süresi`,
    },
  },
  pages: {
    rss: {
      recentNotes: "Son notlar",
      lastFewNotes: ({ count }) => `Son ${count} not`,
    },
    error: {
      title: "Bulunamadı",
      notFound: "Bu sayfa özel ya da mevcut değil.",
      home: "Ana Sayfaya Dön",
    },
    folderContent: {
      folder: "Klasör",
      itemsUnderFolder: ({ count }) =>
        count === 1 ? "Bu klasörde 1 öğe var." : `Bu klasörde ${count} öğe var.`,
    },
    tagContent: {
      tag: "Etiket",
      tagIndex: "Etiket Dizini",
      itemsUnderTag: ({ count }) =>
        count === 1 ? "Bu etikete sahip 1 öğe var." : `Bu etikete sahip ${count} öğe var.`,
      showingFirst: ({ count }) => `İlk ${count} etiket gösteriliyor.`,
      totalTags: ({ count }) => `Toplamda ${count} etiket bulundu.`,
    },
    encryptedContent: {
      loading: "Yükleniyor 🔃",
      password: "Şifre",
      submit: "Gönder",
      enterPassword: "Bu sayfa kilitli. Kilidi açmak için lütfen şifreyi girin:",
      modernBrowser: "Bu sayfanın kilidini açmak için daha modern bir tarayıcı kullanın.",
      wrongPassword: "Yanlış şifre. Lütfen şifreyi girin:",
      noPayload: "Şifrelenmiş içerik yok.",
      decrypting: "Şifre çözülüyor...",
      defaultDescription: "Bu sayfa şifrelenmiş.",
    },
  },
} as const satisfies Translation