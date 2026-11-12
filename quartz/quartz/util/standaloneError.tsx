import {render} from 'preact-render-to-string'
import type {GlobalConfiguration} from '../cfg'
import {ErrorNotice,errorNoticeContent,errorNoticeStyle,type ErrorCode} from '../components/ErrorNotice'

type ErrorConfig=Pick<GlobalConfiguration,'locale'|'theme'|'pageTitle'>
export function renderStandaloneError(code:ErrorCode,cfg:ErrorConfig,favicon:string) {
 const content=errorNoticeContent(code,cfg.locale)
 const variables=(scheme:ErrorConfig['theme']['colors']['lightMode'])=>`--light:${scheme.light};--dark:${scheme.dark};--darkgray:${scheme.darkgray};--secondary:${scheme.secondary};`
 const css=`
 :root{color-scheme:light;${variables(cfg.theme.colors.lightMode)}--headerFont:Arial,"Microsoft YaHei","PingFang SC",sans-serif;--bodyFont:var(--headerFont);--codeFont:ui-monospace,SFMono-Regular,Consolas,monospace;}
 @media(prefers-color-scheme:dark){:root{color-scheme:dark;${variables(cfg.theme.colors.darkMode)}}}
 html{min-height:100%;background:var(--light);}
 body{box-sizing:border-box;display:grid;place-items:center;min-height:100vh;min-height:100svh;margin:0;padding:clamp(1.25rem,5vw,3rem);background:var(--light);color:var(--dark);font-family:var(--bodyFont);-webkit-text-size-adjust:100%;}
 main{box-sizing:border-box;width:min(100%,34rem);padding:.5rem clamp(1rem,4vw,2.25rem);}
 ${errorNoticeStyle}`
 return '<!DOCTYPE html>'+render(<html lang={cfg.locale.split('-')[0]}>
  <head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><meta name="robots" content="noindex, nofollow"/>
   <title>{code} · {content.title} · {cfg.pageTitle}</title>
   <link rel="icon" href={favicon}/>
   <style dangerouslySetInnerHTML={{__html:css.replace(/<\/style/gi,'<\\/style')}}/>
  </head>
  <body><main aria-labelledby="error-notice-title"><ErrorNotice code={code} {...content}/></main></body>
 </html>)
}
