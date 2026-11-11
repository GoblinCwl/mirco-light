import lockScript from "../../components/scripts/viewImage.inline"
import { QuartzTransformerPlugin } from "../types"

// Keep ViewImage's original animation/UI. The stable project-hosted endpoint
// avoids the jsDelivr loading failures seen with the previous setup.
export const ViewImage: QuartzTransformerPlugin = () => {
  return {
    name: "ViewImage",
    externalResources() {
      return {
        js: [
          {script:`(()=>{${lockScript}})();`,loadTime:"afterDOMReady",contentType:"inline"},
          {
            src: "/static/view-image.min.js?v=20261111-3",
            loadTime: "afterDOMReady",
            contentType: "external",
          },
          {
            script: `
              (() => {
                const selector = '.all-comments .comments-content img, article img, .content img, #artalk-comments img:not(.atk-avatar):not(.atk-emo):not(.atk-item img)'
                let retryTimer
                let attempts = 0
                const initialize = () => {
                  if (window.ViewImage) {
                    window.clearTimeout(retryTimer)
                    window.ViewImage.init(selector)
                    return
                  }
                  if (attempts++ < 50) retryTimer = window.setTimeout(initialize, 100)
                }
                initialize()
                document.addEventListener('nav', () => window.setTimeout(initialize, 0))
              })()
            `,
            loadTime: "afterDOMReady",
            contentType: "inline",
          },
        ],
        css: [
          {
            content: `
              .all-comments .comments-content img:not([no-view]):not([data-no-lightbox]), article img:not([no-view]):not([data-no-lightbox]), .content img:not([no-view]):not([data-no-lightbox]) { cursor: zoom-in; }
            `,
            inline: true,
          },
        ],
      }
    },
  }
}

declare module "vfile" {
  interface DataMap {
    viewImage?: boolean
  }
}
