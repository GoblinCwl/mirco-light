import { Translation } from "./definition"

export default {
  propertyDefaults: {
    title: "Không có tiêu đề",
    description: "Không có mô tả nào được cung cấp",
  },
  components: {
    callout: {
      note: "Ghi chú",
      abstract: "Tóm tắt",
      info: "Thông tin",
      todo: "Cần làm",
      tip: "Mẹo",
      success: "Thành công",
      question: "Câu hỏi",
      warning: "Cảnh báo",
      failure: "Thất bại",
      danger: "Nguy hiểm",
      bug: "Lỗi",
      example: "Ví dụ",
      quote: "Trích dẫn",
    },
    backlinks: {
      title: "Liên kết ngược",
      noBacklinksFound: "Không tìm thấy liên kết ngược",
    },
    themeToggle: {
      lightMode: "Chế độ sáng",
      darkMode: "Chế độ tối",
    },
    readerMode: {
      title: "Chế độ đọc sách",
    },
    explorer: {
      title: "Trình duyệt",
    },
    footer: {
      createdWith: "Được tạo bởi",
    },
    graph: {
      title: "Chế độ xem đồ thị",
    },
    recentNotes: {
      title: "Ghi chú gần đây",
      seeRemainingMore: ({ remaining }) => `Xem thêm ${remaining} →`,
    },
    transcludes: {
      transcludeOf: ({ targetSlug }) => `Bao gồm ${targetSlug}`,
      linkToOriginal: "Liên kết đến bản gốc",
    },
    search: {
      title: "Tìm kiếm",
      searchBarPlaceholder: "Tìm kiếm thứ gì đó",
    },
    tableOfContents: {
      title: "Mục lục",
    },
    contentMeta: {
      readingTime: ({ minutes }) => `${minutes} phút đọc`,
    },
  },
  pages: {
    rss: {
      recentNotes: "Ghi chú gần đây",
      lastFewNotes: ({ count }) => `${count} ghi chú gần đây nhất`,
    },
    error: {
      title: "Không tìm thấy",
      notFound: "Trang này có thể là riêng tư hoặc không tồn tại.",
      home: "Quay về trang chủ",
    },
    folderContent: {
      folder: "Thư mục",
      itemsUnderFolder: ({ count }) =>
        count === 1 ? "1 mục trong thư mục này." : `${count} mục trong thư mục này.`,
    },
    tagContent: {
      tag: "Thẻ",
      tagIndex: "Chỉ mục thẻ",
      itemsUnderTag: ({ count }) =>
        count === 1 ? "1 mục có thẻ này." : `${count} mục có thẻ này.`,
      showingFirst: ({ count }) => `Hiển thị ${count} thẻ đầu tiên.`,
      totalTags: ({ count }) => `Tìm thấy tổng cộng ${count} thẻ.`,
    },
    encryptedContent: {
      loading: "Đang tải 🔃",
      password: "Mật khẩu",
      submit: "Gửi",
      enterPassword: "Trang này đã bị khóa. Vui lòng nhập mật khẩu để mở khóa:",
      modernBrowser: "Vui lòng sử dụng trình duyệt hiện đại hơn để mở khóa trang này.",
      wrongPassword: "Mật khẩu sai. Vui lòng nhập lại mật khẩu:",
      noPayload: "Không có nội dung được mã hóa.",
      decrypting: "Đang giải mã...",
      defaultDescription: "Trang này đã được mã hóa.",
    },
  },
} as const satisfies Translation