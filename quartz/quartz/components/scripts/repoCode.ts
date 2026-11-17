import {library,runtime} from './repoMarkdown'

/** Shared code layout and highlighting for repository pages and hover previews. */
export async function repoCode(host:HTMLElement,text:string,path:string,signal:AbortSignal) {
  const block=document.createElement('div'),numbers=document.createElement('pre'),pre=document.createElement('pre'),code=document.createElement('code')
  block.className='repo-code';numbers.className='repo-line-numbers';numbers.setAttribute('aria-hidden','true')
  numbers.textContent=Array.from({length:text.split('\n').length},(_,index)=>String(index+1)).join('\n')
  code.textContent=text;pre.append(code);block.append(numbers,pre);host.append(block)
  try {
    await library('highlightjs/11.11.1/highlight.min.js')
    if(signal.aborted)return
    const ext=path.split('.').pop()!.toLowerCase(),language=({ts:'typescript',tsx:'typescript',py:'python',yml:'yaml',sh:'bash',rs:'rust'} as Record<string,string>)[ext]||ext
    code.className=runtime.hljs!.getLanguage(language)?`language-${language}`:'language-plaintext'
    runtime.hljs!.highlightElement(code)
  } catch { /* Keep plain text if highlighting is unavailable. */ }
}
