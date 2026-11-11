// Global type definitions for Quartz
declare module "*.scss" {
  const content: string
  export default content
}

declare module "*.inline.scss" {
  const content: string
  export default content
}

declare module "*.inline.ts" {
  const content: string
  export default content
}

declare module "*.inline.js" {
  const content: string
  export default content
}

// Artalk global type definition
declare global {
  interface Window {
    Artalk: any
  }
}

export {}