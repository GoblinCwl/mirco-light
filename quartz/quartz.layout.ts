import { PageLayout, SharedLayout } from "./quartz/cfg";
import * as Component from "./quartz/components";
import { BreadcrumbOptions } from "./quartz/components/Breadcrumbs";
import CustomContentMeta from "./quartz/components/CustomContentMeta";
import MobileArticleToc from "./quartz/components/MobileArticleToc";

// 自定义排序函数
const customSortFunction = (a: any, b: any) => {
  // 定义排序映射
  const orderMap: Record<string, number> = {
    "Private": 2,
    "Memo": 3,
    "Study": 4,
    // 添加更多自定义排序
  };

  // 尝试从映射中获取排序值，如果没有则使用默认排序
  const orderA = orderMap[a.slugSegment] ?? Number.MAX_SAFE_INTEGER;
  const orderB = orderMap[b.slugSegment] ?? Number.MAX_SAFE_INTEGER;

  // 如果都有指定排序，则按指定排序
  if (orderA !== Number.MAX_SAFE_INTEGER || orderB !== Number.MAX_SAFE_INTEGER) {
    return orderA - orderB;
  }

  // 否则使用默认排序：文件夹优先，然后按字母顺序
  if ((!a.isFolder && !b.isFolder) || (a.isFolder && b.isFolder)) {
    return a.displayName.localeCompare(b.displayName, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  }

  if (!a.isFolder && b.isFolder) {
    return 1;
  } else {
    return -1;
  }
};

// components shared across all pages
export const sharedPageComponents: SharedLayout = {
  head: Component.Head(),
  header: [],
  afterBody: [
    Component.ConditionalRender({
      component: Component.ArtalkComments({
        server: 'https://goblincwl.site/artalk',
        site: 'GoblinCwl 的微光集',
        useBackendConf: true
      }),
      condition: (page) => page.fileData.slug !== "index",
    }),
    Component.Subscript(),
  ],
  footer: Component.Footer({
    links: {
      // "湘ICP备2026004810号": "http://beian.miit.gov.cn",
      // GitHub: "https://github.com/GoblinCwl",
      // "Bilibili" :"https://space.bilibili.com/13536815",
      // "Steam": "https://steamcommunity.com/id/goblincwl/",
      // "Drive": "https://drive.goblincwl.site",
      // "Media": "https://media.goblincwl.site",
    },
  }),
}

// All article and integration pages share the same breadcrumb/title components.
export const standardPageHeading = (breadcrumbs?: Partial<BreadcrumbOptions>) => [
  Component.Breadcrumbs(breadcrumbs),
  Component.ArticleTitle(),
]

// components for pages that display a single page (e.g. a single note)
export const defaultContentPageLayout: PageLayout = {
  beforeBody: [
    Component.HomeDashboard(),
    ...standardPageHeading().map(component => Component.ConditionalRender({
      component,
      condition: (page) => page.fileData.slug !== "index",
    })),
    Component.ConditionalRender({
      component: CustomContentMeta({
        showReadingTime: false,
        datePrefix: "更新于：",
        includeSeconds: true,
      }),
      condition: (page) => page.fileData.slug !== "index",
    }),
    Component.ConditionalRender({
      component: Component.TagList(),
      condition: (page) => page.fileData.slug !== "index",
    }),
    MobileArticleToc(),
  ],
  left: [
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({
      components: [
        {
          Component: Component.Search(),
          grow: true,
        },
        { Component: Component.Darkmode() },
        { Component: Component.ReaderMode() },
      ],
    }),
    Component.Explorer({
      sortFn: customSortFunction,
    }),
    Component.DesktopOnly(
      Component.RecentNotes({
        title: "流新" ,
        limit: 5,
        showTags: false
      }),
    ),
  ],
  right: [
    Component.Graph(),
    Component.Encounter(),
    Component.DesktopOnly(Component.TableOfContents()),
    Component.Backlinks(),
    Component.ScrollButton({
      position: "bottom-right",
      showOnlyOnDesktop: true
    }),
  ],
}

// components for pages that display lists of pages  (e.g. tags or folders)
export const defaultListPageLayout: PageLayout = {
  beforeBody: [...standardPageHeading(), Component.ContentMeta()],
  left: [
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({
      components: [
        {
          Component: Component.Search(),
          grow: true,
        },
        { Component: Component.Darkmode() },
      ],
    }),
    Component.Explorer({
      sortFn: customSortFunction,
    }),
    Component.DesktopOnly(
        Component.RecentNotes({
          title: "流新" ,
          limit: 5,
          showTags: false
        }),
    ),
  ],
  right: [],
}
