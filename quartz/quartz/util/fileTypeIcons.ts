// Shared by built article pages and API-backed catalogs. Classification is independent of previews.
const svg=(body:string)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
const page='M6 3h8l4 4v14H6V3Zm8 0v5h4'
export const fileTypeIcons={
 article:svg('<path d="M12 6c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Zm0 0v15M6 9h3m-3 4h3m6-4h3m-3 4h3"/>'),
 share:svg('<path d="m9 15 6-6m-5-3 2-2a5 5 0 0 1 7 7l-2 2M7 11l-2 2a5 5 0 0 0 7 7l2-2"/>'),
 video:svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4m-4 6h4M17 9h4m-4 6h4m-7-6 4 3-4 3Z"/>'),
 audio:svg('<path d="M9 18V5l11-2v13M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/>'),
 repo:svg('<path d="M5 3h14v18H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm0 14h14M7 20v2l2-1 2 1v-2"/><circle cx="8" cy="7" r="1"/><circle cx="14" cy="7" r="1"/><circle cx="8" cy="13" r="1"/><path d="M8 8v4m6-4c0 3-5 1-5 4"/>'),
 image:svg('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 6-6 4 4 3-3 5 5"/>'),
 space:svg('<path d="m12 3 9 4.5v9L12 21l-9-4.5v-9L12 3Zm0 9L3 7.5M12 12l9-4.5M12 12v9M7.5 5.25l9 4.5"/>'),
 folder:svg('<path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm0 1h18"/>'),
 word:svg(`<path d="${page}M8 12l1 5 3-4 3 4 1-5"/>`),
 excel:svg(`<path d="${page}M9 11h6v7H9Zm0 3h6m-3-3v7"/>`),
 powerpoint:svg('<path d="M4 4h16v13H4V4Zm8 13v4m-4 0h8"/><path d="M12 7v4h4a4 4 0 1 1-4-4Z"/>'),
 document:svg(`<path d="${page}M9 11h6v7H9Zm2 2h2m-2 3h2"/>`),
 text:svg(`<path d="${page}M9 11h6m-6 3h6m-6 3h4"/>`),
 code:svg(`<path d="${page}M10 11l-2 3 2 3m4-6 2 3-2 3m-2-7-1 8"/>`),
 archive:svg(`<path d="${page}M10 3v2m2 0v2m-2 0v2m2 0v2m-2 0v2"/><rect x="9" y="15" width="4" height="4" rx="1"/>`),
 other:svg(`<path d="${page}"/>`),
}
// Bilibili posts are content items, distinct from ordinary video files.
export const bilibiliVideoIcon=svg('<path d="m7 2 3 4m7-4-3 4"/><rect x="2.5" y="6" width="19" height="14" rx="3"/><path d="M7 11v3m10-3v3m-7 2 4-3-4-3v6ZM7 20v2m10-2v2"/>')
export type FileIconKind=keyof typeof fileTypeIcons
const extensions:Record<string,FileIconKind>={}
for(const[kind,names]of Object.entries({
 image:'png jpg jpeg gif webp avif bmp ico svg tif tiff heic heif raw',
 video:'mp4 mkv webm ogv avi m4v mov flv wmv ts m2ts mts mpg mpeg vob 3gp rm rmvb',
 audio:'mp3 wav ogg oga flac m4a aac opus wma aiff alac ape mid midi',
 word:'doc docx docm dot dotx odt rtf',excel:'xls xlsx xlsm xlsb xlt xltx ods csv tsv',powerpoint:'ppt pptx pptm pot potx odp',document:'pdf epub mobi azw azw3 djvu xps',
 text:'txt md markdown mdx log rst adoc nfo srt ass ssa vtt sub lrc',
 code:'go java class py pyw js jsx mjs cjs ts tsx mts cts json jsonc html htm css scss sass less xml yaml yml toml ini conf cfg env rs c h cpp cc cxx hpp cs fs vb php rb swift kt kts dart vue svelte sh bash zsh fish ps1 bat cmd sql r lua pl pm ex exs erl hrl hs clj cljs groovy gradle cmake make proto graphql gql dockerfile',
 archive:'zip rar 7z tar gz tgz bz2 xz zst cab iso dmg',
}))for(const extension of names.split(' '))extensions[extension]=kind as FileIconKind
export function fileIconKind(name:string,directory=false):FileIconKind{
 if(directory)return 'folder'
 const basename=name.split(/[\\/]/).pop()?.toLowerCase()||''
 if(['dockerfile','makefile','cmakelists.txt','gemfile','rakefile','jenkinsfile','.gitignore','.gitattributes','.editorconfig','.npmrc','.env'].includes(basename)||basename.startsWith('.env.'))return 'code'
 const dot=basename.lastIndexOf('.');return dot>=0?extensions[basename.slice(dot+1)]||'other':'other'
}
export const fileNameIcon=(name:string,directory=false)=>fileTypeIcons[fileIconKind(name,directory)]
