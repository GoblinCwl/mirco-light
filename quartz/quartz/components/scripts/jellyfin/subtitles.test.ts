import { test } from "node:test"
import assert from "node:assert/strict"
import { SubtitleManager } from "./subtitles"

class ElementFixture extends EventTarget {
  style: Record<string, string> = {}
  children: any[] = []
  parentElement?: ElementFixture
  textContent = ""
  kind = ""
  label = ""
  readyState = 2
  onload?: () => void
  track = Object.assign(new EventTarget(), {
    kind: "subtitles",
    label: "",
    mode: "disabled",
    cues: [] as any[],
    activeCues: [] as any[],
  })
  append(...nodes: any[]) {
    for (const node of nodes) {
      this.children.push(node)
      if (node instanceof ElementFixture) node.parentElement = this
    }
  }
  replaceChildren(...nodes: any[]) {
    this.children = []
    this.append(...nodes)
  }
  remove() {
    if (this.parentElement)
      this.parentElement.children = this.parentElement.children.filter((node) => node !== this)
  }
}

test('server subtitles switch on/off without requesting ASS, VTT or fonts in the browser',async(t)=>{
 const priorDocument=Object.getOwnPropertyDescriptor(globalThis,'document'),priorFetch=globalThis.fetch
 const head=new ElementFixture()
 Object.defineProperty(globalThis,'document',{configurable:true,value:{head,createElement:()=>new ElementFixture()}})
 globalThis.fetch=async()=>{throw Error('server subtitles must not download a browser subtitle')}
 t.after(()=>{if(priorDocument)Object.defineProperty(globalThis,'document',priorDocument);else Reflect.deleteProperty(globalThis,'document');globalThis.fetch=priorFetch})
 const video=Object.assign(new ElementFixture(),{textTracks:Object.assign([],{addEventListener:()=>{}}),clientWidth:800,clientHeight:450,videoWidth:1920,videoHeight:1080})
 let burned=-1
 const requests:number[]=[],statuses:string[]=[]
 const manager=new SubtitleManager(video as any,{preferences:{},jellyfin:{}} as any,{} as any,{
  status:value=>statuses.push(value),notice:()=>{},burned:()=>burned,
  burn:async(index)=>{requests.push(index);burned=index},
 })
 for(const [index,type] of ['ass','ssa','vtt','pgs'].entries()) {
  const track={index,type,name:type,language:'zh',url:'https://test/subtitle',burn:true}
  await manager.select(track)
  assert.equal(manager.selected,track)
  assert.equal(manager.appearanceEditable,false)
  assert.equal(manager.customizable,false)
  assert.equal(statuses.at(-1),'')
 }
 await manager.select(undefined)
 assert.deepEqual(requests,[0,1,2,3,-1])
 assert.equal(manager.selected,undefined)
 manager.dispose()
})

test("custom text subtitles preserve bilingual markup, follow browser cues, and retain native fullscreen", async (t) => {
  const priorDocument = Object.getOwnPropertyDescriptor(globalThis, "document")
  const priorFetch = globalThis.fetch
  const priorScreen = Object.getOwnPropertyDescriptor(globalThis, "screen")
  Object.defineProperty(globalThis, "screen", {
    configurable: true,
    value: { width: 1920, height: 1080 },
  })
  const head = new ElementFixture()
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      head,
      createElement: () => new ElementFixture(),
      createDocumentFragment: () => new ElementFixture(),
    },
  })
  globalThis.fetch = async () =>
    new Response("WEBVTT\n\n00:00:01.000 --> 00:00:03.000\n中文\nEnglish\n")
  t.after(() => {
    if (priorDocument) Object.defineProperty(globalThis, "document", priorDocument)
    else Reflect.deleteProperty(globalThis, "document")
    globalThis.fetch = priorFetch
    if (priorScreen) Object.defineProperty(globalThis, "screen", priorScreen)
    else Reflect.deleteProperty(globalThis, "screen")
  })
  const tracks = Object.assign([] as any[], { addEventListener: () => {} })
  const video = Object.assign(new ElementFixture(), {
    textTracks: tracks,
    clientWidth: 800,
    clientHeight: 450,
    videoWidth: 3840,
    videoHeight: 2160,
  })
  const parent = new ElementFixture()
  parent.append(video)
  const append = video.append.bind(video)
  let element: ElementFixture
  const markup = { bilingual: true, italic: true }
  const cue = {
    text: "中文\nEnglish",
    startTime: 1,
    endTime: 3,
    position: 50,
    line: 90,
    snapToLines: false,
    getCueAsHTML: () => markup,
  }
  video.append = (...nodes: ElementFixture[]) => {
    append(...nodes)
    element = nodes[0]
    assert.equal((element as unknown as HTMLTrackElement).default, true)
    element.track.cues = [cue]
    element.track.activeCues = [cue]
    tracks.push(element.track)
    queueMicrotask(() => element.onload?.())
  }
  let burnedIndex = -1
  const selections: unknown[] = []
  const statuses:string[]=[]
  let burns=0
  const assets:any={}
  const manager = new SubtitleManager(
    video as any,
    { preferences: {}, jellyfin: {} } as any,
    assets,
    {
      status: message=>statuses.push(message),
      notice: () => {},
      burned: () => burnedIndex,
      selection: (track) => selections.push(track),
      burn: async () => {
        burns++
        throw Error("unexpected burn")
      },
    },
  )
  t.after(() => manager.dispose())
  const selected = { type: "vtt", name: "双语", url: "https://test/subtitle.vtt" } as any
  const loading = manager.select(selected)
  assert.equal(selections[0], selected)
  assert.equal(manager.selected, selected)
  assert.equal(manager.appearanceEditable, true)
  await loading
  const overlay = parent.children.find((node) => node !== video) as ElementFixture
  const text = overlay.children[0] as ElementFixture
  assert.equal(element!.track.mode, "hidden")
  assert.equal(overlay.style.transform, `scale(${800 / 1920})`)
  video.clientWidth = 1920
  video.clientHeight = 1080
  manager.resize()
  assert.equal(overlay.style.transform, "scale(1)")
  video.clientWidth = 800
  video.clientHeight = 1200
  manager.resize()
  assert.equal(overlay.style.transform, `scale(${800 / 1920})`)
  assert.equal(overlay.style.top, "375px")
  assert.equal(text.style.fontWeight, "700")
  assert.equal(text.children[0].children[0].children[0], markup)
  assert.equal(cue.startTime, 1)
  assert.equal(cue.endTime, 3)
  element!.track.activeCues = []
  element!.track.dispatchEvent(new Event("cuechange"))
  assert.equal(text.children[0].children.length, 0)
  manager.setAppearance({ subtitleStyling: "Native", textWeight: "normal", textColor: "#aabbcc" })
  assert.equal(element!.track.mode, "showing")
  assert.equal(overlay.style.visibility, "hidden")
  manager.setAppearance({ subtitleStyling: "Custom", textWeight: "normal", textColor: "#aabbcc" })
  assert.equal(element!.track.mode, "hidden")
  assert.equal(text.style.fontWeight, "400")
  assert.equal(text.style.color, "#aabbcc")
  const rendition={kind:"subtitles",label:"双语",mode:"disabled"}
  tracks.push(rendition)
  manager.setNative(true)
  assert.equal(rendition.mode,"showing")
  assert.doesNotMatch(head.children[0].textContent,/font-size:/)
  assert.equal(element!.track.mode, "disabled")
  assert.equal(overlay.style.visibility, "hidden")
  manager.setNative(false)
  assert.equal(rendition.mode,"disabled")
  assert.equal(element!.track.mode, "hidden")
  // A phone must not use a full desktop-size font merely because its screen is smaller.
  Object.assign(globalThis.screen,{width:390,height:844})
  video.clientWidth=360;video.clientHeight=202.5
  manager.resize()
  const phoneSize=parseFloat(text.style.fontSize)*Number(String(overlay.style.transform).match(/scale\(([^)]+)\)/)![1])
  Object.assign(globalThis.screen,{width:1920,height:1080});manager.resize()
  const desktopSize=parseFloat(text.style.fontSize)*Number(String(overlay.style.transform).match(/scale\(([^)]+)\)/)![1])
  assert.ok(Math.abs(phoneSize-desktopSize)<0.001)

  await manager.select(undefined)
  assert.deepEqual(parent.children, [video])
  assert.equal(selections.at(-1), undefined)
  assert.equal(manager.appearanceEditable, false)
  for (const type of ["ass", "ssa", "pgs"]) {
    manager.selected = { type } as any
    assert.equal(manager.appearanceEditable, false)
  }
  manager.selected = selected
  burnedIndex = 2
  assert.equal(manager.appearanceEditable, false)
  burnedIndex=-1
  await assert.rejects(manager.select({type:"pgs",index:9,name:"PGS"} as any),/unexpected burn/)
  assert.equal(burns,1,"a failed burn must not repeat the identical playback request")
  assert.equal(statuses.at(-1),"","failed burn clears subtitle loading status")

  // The first usable VTT must release selection before the font download.
  const priorWindow=Object.getOwnPropertyDescriptor(globalThis,"window")
  t.after(()=>{if(priorWindow)Object.defineProperty(globalThis,"window",priorWindow);else Reflect.deleteProperty(globalThis,"window")})
  let releaseFont!:(font:string)=>void,created:any
  assets.assWorker=async()=>"worker"
  assets.fallbackFont=()=>new Promise<string>(resolve=>{releaseFont=resolve})
  class Ass {
    worker=new EventTarget()
    canvasParent=new ElementFixture()
    constructor(){created=this;parent.append(this.canvasParent);queueMicrotask(()=>this.worker.dispatchEvent(new MessageEvent("message",{data:{quartzSubtitleReady:"initial"}})))}
    resize(){};setIsPaused(){};setRate(){};dispose(){this.canvasParent.remove()}
  }
  Object.defineProperty(globalThis,"window",{configurable:true,value:{SubtitlesOctopus:Ass}})
  globalThis.fetch=async url=>new Response(String(url).endsWith(".ass")?"[Script Info]\n[Events]\n":"WEBVTT\n\n00:00:01.000 --> 00:00:03.000\n中文\nEnglish\n")
  const assTrack={type:"ass",index:3,name:"ASS",url:"https://test/font.ass",nativeUrl:"https://test/plain.vtt"} as any
  await manager.select(assTrack)
  assert.equal(created,undefined,"select must finish before the font download")
  assert.equal(statuses.at(-1),"字幕字体加载中…")
  assert.equal(element!.track.mode,"hidden")
  const plain=parent.children.find(node=>node!==video) as ElementFixture
  assert.equal(plain.style.visibility,"visible")
  releaseFont("font")
  await new Promise(resolve=>setImmediate(resolve))
  assert.ok(created)
  assert.equal((created as any).canvasParent.style.visibility,"visible")
  assert.equal(plain.style.visibility,"hidden")
  assert.equal(manager.selected,assTrack)
  assert.equal(statuses.at(-1),"")

  await manager.select(undefined)
  // Leaving while fonts are in flight must never attach the old renderer later.
  created=undefined
  await manager.select(assTrack)
  await manager.select(undefined)
  releaseFont("late font")
  await new Promise(resolve=>setImmediate(resolve))
  assert.equal(created,undefined)
  assert.deepEqual(parent.children,[video])
  assert.equal(manager.selected,undefined)
  // A font failure keeps the already usable ordinary subtitles.
  assets.fallbackFont=async()=>{throw Error("font unavailable")}
  await manager.select(assTrack)
  await new Promise(resolve=>setImmediate(resolve))
  assert.equal(manager.selected,assTrack)
  assert.equal(statuses.at(-1),"")
  assert.equal((parent.children.find(node=>node!==video) as ElementFixture).style.visibility,"visible")

})
