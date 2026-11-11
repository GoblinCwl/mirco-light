// Homepage content is maintained here, independently of the Obsidian vault.
const homeConfig = {
  title: "GoblinCwl 的微光集",
  description: "零散的梦，汇聚成未尽的星河。",
  profile: {
    name: "GoblinCwl",
    email: "goblincwl@qq.com",
    avatar: "/static/avatars/goblincwl-profile-transparent-v1.webp",
    qq: "2395025802",
    qqLink: "https://qm.qq.com/q/VH63remw4S",
    qqQrCode: "/static/qq-add.svg",
  },
  visitors: { title: "彗星" },
  artalk: {
    server: "/artalk",
    site: "GoblinCwl 的微光集",
  },
  explore: [
    {
      label: "Private",
      description: "个人资料、备忘与随想",
      href: "/Private/",
    },
    {
      label: "Memo",
      description: "文章分享与经验沉淀",
      href: "/Memo/",
    },
    {
      label: "Study",
      description: "学习笔记与知识整理",
      href: "/Study/",
    },
    {
      label: "Work",
      description: "工作与项目笔记",
      href: "/Work/",
    },
    { label: "Share", description: "文件分享与资料访问", href: "/Share/" },
    { label: "Repo", description: "开源项目、代码与版本记录", href: "/Repo/" },
    { label: "Video", description: "视频创作与系列记录", href: "/Video/" },
  ],
}

export default homeConfig
