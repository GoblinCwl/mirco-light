import { Translation } from "./definition"

export default {
  propertyDefaults: {
    title: "Tanpa judul",
    description: "Tidak ada deskripsi yang disediakan",
  },
  components: {
    callout: {
      note: "Catatan",
      abstract: "Abstrak",
      info: "Info",
      todo: "Yang harus dilakukan",
      tip: "Kiat",
      success: "Berhasil",
      question: "Pertanyaan",
      warning: "Peringatan",
      failure: "Kegagalan",
      danger: "Bahaya",
      bug: "Bug",
      example: "Contoh",
      quote: "Kutipan",
    },
    backlinks: {
      title: "Tautan balik",
      noBacklinksFound: "Tidak ada tautan balik yang ditemukan",
    },
    themeToggle: {
      lightMode: "Mode terang",
      darkMode: "Mode gelap",
    },
    readerMode: {
      title: "Mode pembaca",
    },
    explorer: {
      title: "Penjelajah",
    },
    footer: {
      createdWith: "Dibuat dengan",
    },
    graph: {
      title: "Tampilan Grafik",
    },
    recentNotes: {
      title: "Catatan Terbaru",
      seeRemainingMore: ({ remaining }) => `Lihat ${remaining} lainnya →`,
    },
    transcludes: {
      transcludeOf: ({ targetSlug }) => `Termasuk dari ${targetSlug}`,
      linkToOriginal: "Tautan ke aslinya",
    },
    search: {
      title: "Pencarian",
      searchBarPlaceholder: "Telusuri sesuatu",
    },
    tableOfContents: {
      title: "Daftar Isi",
    },
    contentMeta: {
      readingTime: ({ minutes }) => `${minutes} menit baca`,
    },
  },
  pages: {
    rss: {
      recentNotes: "Catatan terbaru",
      lastFewNotes: ({ count }) => `${count} catatan terakhir`,
    },
    error: {
      title: "Tidak Ditemukan",
      notFound: "Halaman ini bersifat pribadi atau tidak ada.",
      home: "Kembali ke Beranda",
    },
    folderContent: {
      folder: "Folder",
      itemsUnderFolder: ({ count }) =>
        count === 1 ? "1 item dalam folder ini." : `${count} item dalam folder ini.`,
    },
    tagContent: {
      tag: "Tag",
      tagIndex: "Indeks Tag",
      itemsUnderTag: ({ count }) =>
        count === 1 ? "1 item dengan tag ini." : `${count} item dengan tag ini.`,
      showingFirst: ({ count }) => `Menampilkan ${count} tag pertama.`,
      totalTags: ({ count }) => `Ditemukan total ${count} tag.`,
    },
    encryptedContent: {
      loading: "Memuat 🔃",
      password: "Kata sandi",
      submit: "Kirim",
      enterPassword: "Halaman ini terkunci. Silakan masukkan kata sandi untuk membuka:",
      modernBrowser: "Silakan gunakan peramban yang lebih modern untuk membuka halaman ini.",
      wrongPassword: "Kata sandi salah. Silakan masukkan kata sandi:",
      noPayload: "Tidak ada muatan terenkripsi.",
      decrypting: "Mendekripsi...",
      defaultDescription: "Halaman ini dienkripsi.",
    },
  },
} as const satisfies Translation