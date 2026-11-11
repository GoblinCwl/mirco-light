import { Translation } from "./definition"

export default {
  propertyDefaults: {
    title: "ไม่มีชื่อ",
    description: "ไม่มีคำอธิบาย",
  },
  components: {
    callout: {
      note: "หมายเหตุ",
      abstract: "บทคัดย่อ",
      info: "ข้อมูล",
      todo: "สิ่งที่ต้องทำ",
      tip: "เคล็ดลับ",
      success: "สำเร็จ",
      question: "คำถาม",
      warning: "คำเตือน",
      failure: "ความล้มเหลว",
      danger: "อันตราย",
      bug: "จุดบกพร่อง",
      example: "ตัวอย่าง",
      quote: "คำพูด",
    },
    backlinks: {
      title: "การเชื่อมโยงย้อนกลับ",
      noBacklinksFound: "ไม่พบการเชื่อมโยงย้อนกลับ",
    },
    themeToggle: {
      lightMode: "โหมดสว่าง",
      darkMode: "โหมดมืด",
    },
    readerMode: {
      title: "โหมดอ่านหนังสือ",
    },
    explorer: {
      title: "ตัวสำรวจ",
    },
    footer: {
      createdWith: "สร้างขึ้นด้วย",
    },
    graph: {
      title: "มุมมองกราฟ",
    },
    recentNotes: {
      title: "บันทึกย่อเมื่อเร็ว ๆ นี้",
      seeRemainingMore: ({ remaining }) => `ดูเพิ่มเติม ${remaining} รายการ →`,
    },
    transcludes: {
      transcludeOf: ({ targetSlug }) => `แทรกเนื้อหาจาก ${targetSlug}`,
      linkToOriginal: "ลิงก์ไปยังต้นฉบับ",
    },
    search: {
      title: "ค้นหา",
      searchBarPlaceholder: "ค้นหาบางสิ่ง",
    },
    tableOfContents: {
      title: "สารบัญ",
    },
    contentMeta: {
      readingTime: ({ minutes }) => `ใช้เวลาอ่าน ${minutes} นาที`,
    },
  },
  pages: {
    rss: {
      recentNotes: "บันทึกย่อเมื่อเร็ว ๆ นี้",
      lastFewNotes: ({ count }) => `บันทึกย่อ ${count} รายการล่าสุด`,
    },
    error: {
      title: "ไม่พบ",
      notFound: "หน้านี้อาจตั้งค่าเป็นส่วนตัวหรือยังไม่ถูกสร้าง",
      home: "กลับหน้าหลัก",
    },
    folderContent: {
      folder: "โฟลเดอร์",
      itemsUnderFolder: ({ count }) =>
        count === 1 ? "มี 1 รายการในโฟลเดอร์นี้" : `มี ${count} รายการในโฟลเดอร์นี้`,
    },
    tagContent: {
      tag: "แท็ก",
      tagIndex: "ดัชนีแท็ก",
      itemsUnderTag: ({ count }) =>
        count === 1 ? "มี 1 รายการที่ติดแท็กนี้" : `มี ${count} รายการที่ติดแท็กนี้`,
      showingFirst: ({ count }) => `กำลังแสดง ${count} แท็กแรก`,
      totalTags: ({ count }) => `พบทั้งหมด ${count} แท็ก`,
    },
    encryptedContent: {
      loading: "กำลังโหลด 🔃",
      password: "รหัสผ่าน",
      submit: "ส่ง",
      enterPassword: "หน้านี้ถูกล็อค โปรดป้อนรหัสผ่านเพื่อปลดล็อค:",
      modernBrowser: "โปรดใช้เบราว์เซอร์ที่ทันสมัยกว่านี้เพื่อปลดล็อคหน้านี้",
      wrongPassword: "รหัสผ่านไม่ถูกต้อง โปรดป้อนรหัสผ่าน:",
      noPayload: "ไม่มีเนื้อหาที่เข้ารหัส",
      decrypting: "กำลังถอดรหัส...",
      defaultDescription: "หน้านี้ถูกเข้ารหัสไว้",
    },
  },
} as const satisfies Translation