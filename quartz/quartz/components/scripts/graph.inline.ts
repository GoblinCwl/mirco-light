import {graphPalette} from '../../util/graphPalette'
import {readContentCatalog} from './contentCatalog'
import { videoRoute } from "./videoLibrary"
import { repoRoute } from "./repoShared"
import { repoGraphSlug } from "./repoGraph"
import { compactGraphTitle } from "./graphLabels"
import { filterGraphContent, graphNodeKind, type GraphKind } from "./graphFilters"
import { videoGraphSlug } from "./videoGraph"
import { readSiteSettings } from "./siteSettings"
import { tagHref } from "./shareContent"
import { driveRoute } from "./driveClient"
import { isDriveShareGraphNode, driveShareGraphSlug } from "./driveShareGraph"
import type { ContentDetails } from "../../util/contentTypes"
import {
  SimulationNodeDatum,
  SimulationLinkDatum,
  Simulation,
  forceSimulation,
  forceManyBody,
  forceCenter,
  forceX,
  forceY,
  forceLink,
  forceCollide,
  forceRadial,
  zoomIdentity,
  select,
  drag,
  zoom,
} from "d3"
import { Text, Graphics, Application, Container, Circle } from "pixi.js"
import { Group as TweenGroup, Tween as Tweened } from "@tweenjs/tween.js"
import { registerEscapeHandler } from "./util"
import { FullSlug, SimpleSlug, getFullSlug, resolveRelative, simplifySlug } from "../../util/path"
import { D3Config } from "../Graph"

type GraphicsInfo = {
  color: string
  gfx: Graphics
  alpha: number
  active: boolean
}

type NodeData = {
  id: SimpleSlug
  text: string
  tags: string[]
} & SimulationNodeDatum

type SimpleLinkData = {
  source: SimpleSlug
  target: SimpleSlug
}

type LinkData = {
  source: NodeData
  target: NodeData
} & SimulationLinkDatum<NodeData>

type LinkRenderData = GraphicsInfo & {
  simulationData: LinkData
}

type NodeRenderData = GraphicsInfo & {
  simulationData: NodeData
  label: Text
}

type TweenNode = {
  update: (time: number) => void
  stop: () => void
}

function currentGraphSlug(fallback: FullSlug): FullSlug {
  if (document.body.dataset.slug === "Repo/index") {
    const route = repoRoute(new URL(location.href))
    if (route.name) return String(repoGraphSlug(route.name)) as FullSlug
  }
  if (document.body.dataset.slug === "Video/index") {
    const route = videoRoute(new URL(location.href))
    if (route.valid && route.bvid) return String(videoGraphSlug(route.bvid)) as FullSlug
  }
  if (document.body.dataset.slug !== "Share/index") return fallback
  const route = driveRoute(new URL(location.href))
  return route.valid && route.view === "share" ? String(driveShareGraphSlug(route.share)) as FullSlug : fallback
}

const graphRequests = new WeakMap<HTMLElement, object>()
const graphVisibility = new WeakMap<HTMLElement, (kinds: ReadonlySet<GraphKind>) => void>()
let expandedGraphOpen = false

async function renderGraph(graph: HTMLElement, fullSlug: FullSlug, kinds?: ReadonlySet<GraphKind>) {
  const request = {}
  graphRequests.set(graph, request)
  const current = () => graph.isConnected && graphRequests.get(graph) === request
  const slug = isDriveShareGraphNode(fullSlug) ? String(fullSlug) as SimpleSlug : simplifySlug(fullSlug)
  const settings = await readSiteSettings()
  if (!current()) return
  // Keep the persistent filter controls while replacing only the rendered graph.
  for(const child of [...graph.children])if(!child.classList.contains("graph-type-filters"))child.remove()

  let {
    drag: enableDrag,
    zoom: enableZoom,
    depth,
    scale,
    repelForce,
    centerForce,
    linkDistance,
    fontSize,
    opacityScale,
    removeTags,
    showTags,
    focusOnHover,
    enableRadial,
    autoFit,
    idleMotion,
  } = JSON.parse(graph.dataset["cfg"]!) as D3Config

  const data: Map<SimpleSlug, ContentDetails> = new Map(
    Object.entries<ContentDetails>((await readContentCatalog()).pages).map(([k, v]) => [
      /^(Share|Repo|Video)\//.test(k)?k as SimpleSlug:simplifySlug(k as FullSlug),
      v,
    ]),
  )
  data.set('/' as SimpleSlug,{slug:'index' as FullSlug,filePath:'index' as ContentDetails['filePath'],title:'微光集',content:'',links:[],tags:[]})
  const nodeHref = (id: SimpleSlug) => id.startsWith("tags/")
    ? tagHref(id.slice(5)) : isDriveShareGraphNode(fullSlug) || /^(Video|Repo)\//.test(fullSlug) ? id === "/" ? "/" : `/${id}` : resolveRelative(fullSlug, id)
  if (!current()) return
  const links: SimpleLinkData[] = []
  const tags: SimpleSlug[] = []
  const validLinks = new Set(data.keys())

  const tweens = new Map<string, TweenNode>()
  for (const [source, details] of data.entries()) {
    const outgoing = details.links ?? []

    for (const dest of outgoing) {
      if (validLinks.has(dest)) {
        links.push({ source: source, target: dest })
      }
    }

    if (showTags) {
      const localTags = details.tags
        .filter((tag) => !removeTags.includes(tag))
        .map((tag) => simplifySlug(("tags/" + tag) as FullSlug))

      tags.push(...localTags.filter((tag) => !tags.includes(tag)))

      for (const tag of localTags) {
        links.push({ source: source, target: tag })
      }
    }
  }

  const neighbourhood = new Set<SimpleSlug>()
  const wl: (SimpleSlug | "__SENTINEL")[] = [slug, "__SENTINEL"]
  if (depth >= 0) {
    while (depth >= 0 && wl.length > 0) {
      // compute neighbours
      const cur = wl.shift()!
      if (cur === "__SENTINEL") {
        depth--
        wl.push("__SENTINEL")
      } else {
        neighbourhood.add(cur)
        const outgoing = links.filter((l) => l.source === cur)
        const incoming = links.filter((l) => l.target === cur)
        wl.push(...outgoing.map((l) => l.target), ...incoming.map((l) => l.source))
      }
    }
  } else {
    validLinks.forEach((id) => neighbourhood.add(id))
    if (showTags) tags.forEach((tag) => neighbourhood.add(tag))
  }

  const nodes = [...neighbourhood].map((url) => {
    const text = url.startsWith("tags/") ? "#" + url.substring(5) : (data.get(url)?.title ?? url)
    return {
      id: url,
      text,
      tags: data.get(url)?.tags ?? [],
    }
  })
  const graphData: { nodes: NodeData[]; links: LinkData[] } = {
    nodes,
    links: links
      .filter((l) => neighbourhood.has(l.source) && neighbourhood.has(l.target))
      .map((l) => ({
        source: nodes.find((n) => n.id === l.source)!,
        target: nodes.find((n) => n.id === l.target)!,
      })),
  }

  const loneStar = !graph.classList.contains("global-graph-container") && slug !== "/" &&
    graphData.nodes.length === 1 && graphData.nodes[0].id === slug && graphData.links.length === 0
  if (loneStar) {
    const node = graphData.nodes[0]
    node.x = node.y = node.fx = node.fy = 0
  }

  const connectedNodes = new Set(links.flatMap(link => [link.source, link.target]))
  const isolatedArticles = new Set([...data.keys()].filter(id =>
    id !== "/" && !id.startsWith("tags/") && !connectedNodes.has(id)))

  // Classify against the full graph, before the local neighborhood is filtered.
  const tagNeighbors = new Map<SimpleSlug, Set<SimpleSlug>>()
  for (const link of links) {
    for (const [tag, neighbor] of [[link.source, link.target], [link.target, link.source]]) {
      if (!tag.startsWith("tags/") || tag === neighbor) continue
      if (!tagNeighbors.has(tag)) tagNeighbors.set(tag, new Set())
      tagNeighbors.get(tag)!.add(neighbor)
    }
  }
  const stellarTags = new Set([...tagNeighbors].filter(([, neighbors]) => neighbors.size >= 3).map(([tag]) => tag))

  const width = graph.clientWidth
  const height = graph.clientHeight
  if (width <= 0 || height <= 0) return

  const homeNode = graphData.nodes.find((node) => node.id === "/")
  // The expanded graph is a whole-sky view: its camera is always anchored on
  // the black hole, never on the article from which it was opened.
  const anchorNode = graph.classList.contains("global-graph-container")
    ? homeNode
    : (graphData.nodes.find((node) => node.id === slug) ?? homeNode)
  if (homeNode) {
    homeNode.x = homeNode.y = homeNode.fx = homeNode.fy = 0
  }

  // we virtualize the simulation and use pixi to actually render it
  const simulation: Simulation<NodeData, LinkData> = forceSimulation<NodeData>(graphData.nodes)
    .force("charge", forceManyBody().strength(-100 * repelForce))
    .force("center", forceCenter().strength(centerForce))
    .force("link", forceLink(graphData.links).distance(linkDistance))
    .force("collide", forceCollide<NodeData>((n) => nodeRadius(n)).iterations(3))

  if (homeNode) {
    // Real links remain unchanged; a gentle attraction organizes the network
    // around the pinned homepage, including otherwise disconnected clusters.
    simulation.force("center", null)
      .force("home-x", forceX<NodeData>(0).strength(0.025 * centerForce))
      .force("home-y", forceY<NodeData>(0).strength(0.025 * centerForce))
  }

  const expandedLayout = graph.classList.contains("global-graph-container")
  const overviewLayout = expandedLayout || (slug === "/" && autoFit)
  // Use common world coordinates; viewport size affects zoom, not topology.
  const radius = overviewLayout ? 240 : (Math.min(width, height) / 2) * 0.8
  if (enableRadial) {
    simulation.force("radial", forceRadial(radius).strength(overviewLayout ? 0.13 : 0.2))
  }
  // Settle the homepage overview before fitting its complete network.
  if (expandedLayout) {
    simulation.stop()
    for (let ticks = 0; ticks < 250; ticks += 10) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      if (!current()) return
      simulation.tick(10)
    }
    simulation.restart()
  } else if (autoFit || overviewLayout) simulation.tick(250)

  // precompute style prop strings as pixi doesn't support css variables
  const cssVars = [
    "--secondary",
    "--tertiary",
    "--gray",
    "--light",
    "--lightgray",
    "--dark",
    "--darkgray",
    "--bodyFont",
  ] as const
  const computedStyleMap = cssVars.reduce(
    (acc, key) => {
      acc[key] = getComputedStyle(document.documentElement).getPropertyValue(key)
      return acc
    },
    {} as Record<(typeof cssVars)[number], string>,
  )

  const lightSky = document.documentElement.getAttribute("saved-theme") !== "dark"
  const graphLinkColor = lightSky ? "#c4cfd5" : computedStyleMap["--lightgray"]
  // Match 视界: blue/sage in light mode, warm gas/gold in dark mode.
  const diskColor = lightSky ? "#7b97aa" : "#d1a37d"
  const diskAccent = lightSky ? "#84a59d" : "#f1cf9f"

  // Node identity determines color; browsing history has no visual side effects.
  const color = (d: NodeData) => {
    if (d.id === "/") return diskColor
    const kind = d.id.startsWith("tags/") ? "tag" : graphNodeKind(d.id) || "article"
    return graphPalette[kind][lightSky ? "light" : "dark"]
  }

  function nodeRadius(d: NodeData) {
    const numLinks = graphData.links.filter(
      (l) => l.source.id === d.id || l.target.id === d.id,
    ).length
    const radius = 2 + Math.sqrt(numLinks)
    return d.id === "/" ? Math.max(5, radius * 1.6) : stellarTags.has(d.id) ? radius * 1.3 : isolatedArticles.has(d.id) ? 4 : radius
  }

  let hoveredNodeId: string | null = null
  let hoveredNeighbours: Set<string> = new Set()
  const linkRenderData: LinkRenderData[] = []
  const nodeRenderData: NodeRenderData[] = []
  function updateHoverInfo(newHoveredId: string | null) {
    hoveredNodeId = newHoveredId

    if (newHoveredId === null) {
      hoveredNeighbours = new Set()
      for (const n of nodeRenderData) {
        n.active = false
      }

      for (const l of linkRenderData) {
        l.active = false
      }
    } else {
      hoveredNeighbours = new Set()
      for (const l of linkRenderData) {
        const linkData = l.simulationData
        if (linkData.source.id === newHoveredId || linkData.target.id === newHoveredId) {
          hoveredNeighbours.add(linkData.source.id)
          hoveredNeighbours.add(linkData.target.id)
        }

        l.active = linkData.source.id === newHoveredId || linkData.target.id === newHoveredId
      }

      for (const n of nodeRenderData) {
        n.active = hoveredNeighbours.has(n.simulationData.id)
      }
    }
  }

  let dragStartTime = 0
  let dragDistance = 0
  let dragging = false

  function renderLinks() {
    tweens.get("link")?.stop()
    const tweenGroup = new TweenGroup()

    for (const l of linkRenderData) {
      let alpha = 1

      // if we are hovering over a node, we want to highlight the immediate neighbours
      // with full alpha and the rest with default alpha
      if (hoveredNodeId) {
        alpha = l.active ? 1 : 0.2
      }

      l.color = l.active ? computedStyleMap["--gray"] : graphLinkColor
      tweenGroup.add(new Tweened<LinkRenderData>(l).to({ alpha }, 200))
    }

    tweenGroup.getAll().forEach((tw) => tw.start())
    tweens.set("link", {
      update: tweenGroup.update.bind(tweenGroup),
      stop() {
        tweenGroup.getAll().forEach((tw) => tw.stop())
      },
    })
  }

  function renderLabels() {
    tweens.get("label")?.stop()
    const tweenGroup = new TweenGroup()

    const defaultScale = 1 / scale
    const activeScale = defaultScale * 1.1
    for (const n of nodeRenderData) {
      const nodeId = n.simulationData.id

      if (hoveredNodeId === nodeId) {
        tweenGroup.add(
          new Tweened<Text>(n.label).to(
            {
              alpha: 1,
              scale: { x: activeScale, y: activeScale },
            },
            100,
          ),
        )
      } else {
        tweenGroup.add(
          new Tweened<Text>(n.label).to(
            {
              alpha: n.label.alpha,
              scale: { x: defaultScale, y: defaultScale },
            },
            100,
          ),
        )
      }
    }

    tweenGroup.getAll().forEach((tw) => tw.start())
    tweens.set("label", {
      update: tweenGroup.update.bind(tweenGroup),
      stop() {
        tweenGroup.getAll().forEach((tw) => tw.stop())
      },
    })
  }

  function renderNodes() {
    tweens.get("hover")?.stop()

    const tweenGroup = new TweenGroup()
    for (const n of nodeRenderData) {
      let alpha = 1

      // if we are hovering over a node, we want to highlight the immediate neighbours
      if (hoveredNodeId !== null && focusOnHover) {
        alpha = n.active ? 1 : 0.2
      }

      tweenGroup.add(new Tweened<Graphics>(n.gfx, tweenGroup).to({ alpha }, 200))
    }

    tweenGroup.getAll().forEach((tw) => tw.start())
    tweens.set("hover", {
      update: tweenGroup.update.bind(tweenGroup),
      stop() {
        tweenGroup.getAll().forEach((tw) => tw.stop())
      },
    })
  }

  function renderPixiFromD3() {
    renderNodes()
    renderLinks()
    renderLabels()
  }

  tweens.forEach((tween) => tween.stop())
  tweens.clear()

  const app = new Application()
  try {
    await app.init({
      width,
      height,
      antialias: true,
      autoStart: false,
      autoDensity: true,
      backgroundAlpha: 0,
      preference: "webgpu",
      resolution: window.devicePixelRatio,
      eventMode: "static",
    })
  } catch (error) {
    simulation.stop()
    throw error
  }
  if (!current()) { simulation.stop(); app.destroy(); return }
  graph.appendChild(app.canvas)
  const fullTitle = document.createElement("div")
  fullTitle.className = "graph-node-title"
  fullTitle.hidden = true
  if (expandedLayout) graph.appendChild(fullTitle)

  const stage = new Container()
  app.stage.addChild(stage)
  stage.interactive = false

  const labelsContainer = new Container<Container>({ zIndex: 3, isRenderGroup: true })
  const nodesContainer = new Container<Container>({ zIndex: 2, isRenderGroup: true })
  const linkContainer = new Container<Graphics>({ zIndex: 1, isRenderGroup: true })
  stage.addChild(nodesContainer, labelsContainer, linkContainer)

  const newStarMarkers: { marker: Graphics; phase: number; createdAt: number }[] = []
  const newStarNow = Date.now()
  const newStarWindow = Number(settings["graph.newDays"] ?? 7) * 24 * 60 * 60 * 1000
  const stellarHalos: { halo: Graphics; phase: number }[] = []
  const loneStarHalos: Graphics[] = []
  {
    // Decorative specks have no hit area, labels, links or article identities.
    const sky = new Graphics({ eventMode: "none", interactive: false })
    let seed = 17
    for (const char of slug) seed = Math.imul(seed, 31) + char.charCodeAt(0) | 0
    const random = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296 }
    const starCount = Math.max(16, Math.min(180, Math.round(width * height / 6000)))
    for (let i = 0; i < starCount; i++) {
      const x = 20 + random() * (width - 40), y = 20 + random() * (height - 60)
      if (Math.hypot(x - width / 2, y - height / 2) < 35) continue
      const size = 0.65 + random() * 0.65
      sky.circle(x, y, size).fill({
        color: lightSky ? (i % 4 === 0 ? "#668394" : "#91a5af") : computedStyleMap["--gray"],
        alpha: lightSky ? (i % 4 === 0 ? 0.55 : 0.35) : 0.48,
      })
    }
    app.stage.addChildAt(sky, 0)

  }

  let blackHoleFlow: Graphics | undefined
  let blackHoleDisk: Container | undefined
  let blackHoleHalo: Graphics | undefined

  for (const n of graphData.nodes) {
    const nodeId = n.id

    const label = new Text({
      interactive: false,
      eventMode: "none",
      text: expandedLayout ? compactGraphTitle(n.text) : n.text,
      alpha: 0,
      anchor: { x: 0.5, y: 1.2 },
      style: {
        fontSize: fontSize * 15,
        fill: computedStyleMap["--dark"],
        fontFamily: computedStyleMap["--bodyFont"],
      },
      resolution: window.devicePixelRatio * 4,
    })
    label.scale.set(1 / scale)

    let oldLabelOpacity = 0
    const isTagNode = nodeId.startsWith("tags/")
    const gfx = new Graphics({
      interactive: true,
      label: nodeId,
      eventMode: "static",
      hitArea: new Circle(0, 0, nodeRadius(n)),
      cursor: "pointer",
    })
      .circle(0, 0, nodeRadius(n))
      .fill({ color: isTagNode ? computedStyleMap["--light"] : color(n) })
      .on("pointerover", (e) => {
        if (dragging) return
        if (expandedLayout) { fullTitle.textContent = n.text; fullTitle.hidden = false }
        updateHoverInfo(e.target.label)
        oldLabelOpacity = label.alpha
        if (!dragging) {
          renderPixiFromD3()
        }
      })
      .on("pointerleave", () => {
        if (dragging) return
        fullTitle.hidden = true
        updateHoverInfo(null)
        label.alpha = oldLabelOpacity
        if (!dragging) {
          renderPixiFromD3()
        }
      })

    if (settings["graph.loneStars"] !== false && isolatedArticles.has(nodeId)) {
      const halo = new Graphics({ eventMode: "none" })
      for (let i = 4; i > 0; i--) {
        halo.circle(0, 0, 5 + i * 2).fill({ color: computedStyleMap["--tertiary"], alpha: 0.025 })
      }
      gfx.addChild(halo)
      loneStarHalos.push(halo)
    }

    if (stellarTags.has(nodeId)) {
      const r = nodeRadius(n)
      const starColor = lightSky ? "#bd853b" : "#f0cb88"
      gfx.clear()
      const halo = new Graphics({ eventMode: "none" })
      for (let i = 4; i > 0; i--) {
        halo.circle(0, 0, r + i * 1.7).fill({ color: starColor, alpha: 0.035 })
      }
      gfx.addChild(halo)
      gfx.circle(0, 0, r).fill({ color: starColor })
        .circle(0, 0, r * 0.48).fill({ color: lightSky ? "#fff3d5" : "#fff8e9" })
      stellarHalos.push({ halo, phase: stellarHalos.length * 1.7 })
    } else if (isTagNode) {
      gfx.stroke({ width: 2, color: color(n) })
    }

    if (nodeId === "/") {
      const core = nodeRadius(n) * 1.65
      gfx.clear()
      gfx.hitArea = new Circle(0, 0, core * 3)
      // Layered, low-alpha rings provide a soft halo without a GPU blur filter.
      const halo = new Graphics({ eventMode: "none" })
      for (let i = 4; i > 0; i--) {
        halo.circle(0, 0, core + i * 2.2)
          .stroke({ width: 2, color: diskAccent, alpha: 0.045 * (5 - i) })
      }
      gfx.addChild(halo)
      blackHoleHalo = halo
      const disk = new Container({ eventMode: "none" })
      blackHoleDisk = disk
      disk.rotation = -0.35
      disk.scale.set(1, 0.4)
      const rings = new Graphics({ eventMode: "none" })
      rings.circle(0, 0, core * 2.5).stroke({ width: 1.2, color: diskColor, alpha: 0.25 })
        .circle(0, 0, core * 2).stroke({ width: 2.5, color: diskAccent, alpha: 0.5 })
      const flow = new Graphics({ eventMode: "none" })
      for (let i = 0; i < 3; i++) {
        const start = i * Math.PI * 2 / 3
        const orbit = core * (1.85 + i * 0.2)
        flow.moveTo(Math.cos(start) * orbit, Math.sin(start) * orbit)
          .arc(0, 0, orbit, start, start + 0.9)
          .stroke({ width: 2.6, color: diskColor, alpha: 0.9 })
        flow.circle(Math.cos(start + 0.9) * orbit, Math.sin(start + 0.9) * orbit, 2.1)
          .fill({ color: diskAccent })
      }
      disk.addChild(rings, flow)
      blackHoleFlow = flow
      gfx.addChild(disk)
      const hole = new Graphics({ eventMode: "none" })
      hole.circle(0, 0, core).fill({ color: "#03060d" })
        .circle(0, 0, core + 0.5).stroke({ width: 1, color: diskAccent, alpha: 0.85 })
      gfx.addChild(hole)
    }

    const createdAt = Date.parse(data.get(nodeId)?.createdAt ?? "")
    if (nodeId !== "/" && !nodeId.startsWith("tags/") && Number.isFinite(createdAt) &&
      createdAt <= newStarNow && newStarNow - createdAt < newStarWindow) {
      const r = nodeRadius(n)
      const marker = new Graphics({ eventMode: "none" })
      const accent = lightSky ? "#2da544" : "#7bed83"
      let seed = 2166136261
      for (const char of nodeId) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0
      const angle = (seed / 4294967296) * Math.PI * 2
      const markerX = Math.cos(angle) * r, markerY = Math.sin(angle) * r
      marker.circle(markerX, markerY, 3.6).fill({ color: accent, alpha: 0.24 })
        .circle(markerX, markerY, 1.9).fill({ color: accent })
      gfx.addChild(marker)
      newStarMarkers.push({ marker, phase: newStarMarkers.length * 1.3, createdAt })
    }

    // Separate visibility from hover alpha, so the two animations never compete.
    const nodeVisibility=new Container(),labelVisibility=new Container()
    nodeVisibility.addChild(gfx);labelVisibility.addChild(label)
    nodesContainer.addChild(nodeVisibility)
    labelsContainer.addChild(labelVisibility)

    const nodeRenderDatum: NodeRenderData = {
      simulationData: n,
      gfx,
      label,
      color: color(n),
      alpha: 1,
      active: false,
    }

    nodeRenderData.push(nodeRenderDatum)
  }

  for (const l of graphData.links) {
    const gfx = new Graphics({ interactive: false, eventMode: "none" })
    linkContainer.addChild(gfx)

    const linkRenderDatum: LinkRenderData = {
      simulationData: l,
      gfx,
      color: graphLinkColor,
      alpha: 1,
      active: false,
    }

    linkRenderData.push(linkRenderDatum)
  }

  let currentTransform = zoomIdentity
  let rotationAngle = 0
  let rotationCenter = { x: 0, y: 0 }
  let viewportInteracting = false
  let homeReturnActive = false
  let returnAnchorToView: (() => void) | undefined
  let cancelAnchorReturn = () => {}
  let advanceAnchorReturn: ((time: number) => void) | undefined
  let cameraX = 0
  let cameraY = 0
  let cameraVelocityX = 0
  let cameraVelocityY = 0
  if (enableDrag) {
    select<HTMLCanvasElement, NodeData | undefined>(app.canvas).call(
      drag<HTMLCanvasElement, NodeData | undefined>()
        .container(() => app.canvas)
        .subject(() => graphData.nodes.find((n) => n.id === hoveredNodeId))
        .on("start", function dragstarted(event) {
          cancelAnchorReturn()
          if (!event.active) simulation.alphaTarget(1).restart()
          event.subject.fx = event.subject.x
          event.subject.fy = event.subject.y
          event.subject.__initialDragPos = {
            x: event.subject.x,
            y: event.subject.y,
            fx: event.subject.fx,
            fy: event.subject.fy,
          }
          dragStartTime = Date.now()
          dragDistance = 0
          dragging = true
          fullTitle.hidden = true
        })
        .on("drag", function dragged(event) {
          const initPos = event.subject.__initialDragPos
          dragDistance = Math.max(dragDistance, Math.hypot(event.x - initPos.x, event.y - initPos.y))
          if (event.subject === homeNode) return
          const dx = (event.x - initPos.x) / currentTransform.k
          const dy = (event.y - initPos.y) / currentTransform.k
          event.subject.fx = initPos.x + dx * Math.cos(rotationAngle) + dy * Math.sin(rotationAngle)
          event.subject.fy = initPos.y - dx * Math.sin(rotationAngle) + dy * Math.cos(rotationAngle)
        })
        .on("end", function dragended(event) {
          if (!event.active) simulation.alphaTarget(0)
          event.subject.fx = event.subject === homeNode ? 0 : null
          event.subject.fy = event.subject === homeNode ? 0 : null
          dragging = false
          updateHoverInfo(null)
          fullTitle.hidden = true
          if (event.subject === anchorNode) requestAnimationFrame(() => returnAnchorToView?.())

          // if the time between mousedown and mouseup is short, we consider it a click
          if (Date.now() - dragStartTime < 500 && dragDistance < 6) {
            const node = graphData.nodes.find((n) => n.id === event.subject.id) as NodeData
            const targ = nodeHref(node.id)
            // @ts-ignore
            window.spaNavigate(new URL(targ, window.location.toString()))
          }
        }),
    )
  } else {
    for (const node of nodeRenderData) {
      node.gfx.on("click", () => {
        const targ = nodeHref(node.simulationData.id)
        // @ts-ignore
        window.spaNavigate(new URL(targ, window.location.toString()))
      })
    }
  }

  if (enableZoom) {
    let canvas: ReturnType<typeof select<HTMLCanvasElement, NodeData>>
    const zoomBehavior = zoom<HTMLCanvasElement, NodeData>()
        // D3's default interpolateZoom briefly changes scale while panning.
        // Homepage return must be a pure translation at the current scale.
        .interpolate((from: number[], to: number[]) => (progress) => [
          from[0] + (to[0] - from[0]) * progress,
          from[1] + (to[1] - from[1]) * progress,
          from[2] + (to[2] - from[2]) * progress,
        ])
        .on("start", ({ sourceEvent }) => {
          if (sourceEvent) {
            cancelAnchorReturn()
            viewportInteracting = true
          }
        })
        .on("end", ({ sourceEvent }) => {
          viewportInteracting = false
          if (sourceEvent) returnAnchorToView?.()
        })
        .extent([
          [0, 0],
          [width, height],
        ])
        .filter((event) => {
          if (slug === "/" && !graph.classList.contains("global-graph-container") &&
            (event.type === "wheel" || event.type === "dblclick")) return false
          cancelAnchorReturn()
          return true
        })
        .scaleExtent([autoFit ? 0.05 : 0.25, 4])
        .on("zoom", ({ transform }) => {
          currentTransform = transform
          stage.scale.set(transform.k, transform.k)
          stage.position.set(transform.x + cameraX, transform.y + cameraY)

          // zoom adjusts opacity of labels too
          const scale = transform.k * opacityScale
          let scaleOpacity = Math.max((scale - 1) / 3.75, 0)
          const activeNodes = nodeRenderData.filter((n) => n.active).flatMap((n) => n.label)

          for (const {label} of nodeRenderData) {
            if (!activeNodes.includes(label)) {
              label.alpha = scaleOpacity
            }
          }
        })
    canvas = select<HTMLCanvasElement, NodeData>(app.canvas)
    let anchorReturn: {
      start: number; fromX: number; fromY: number; toX: number; toY: number; scale: number
    } | undefined
    cancelAnchorReturn = () => {
      anchorReturn = undefined
      homeReturnActive = false
    }
    advanceAnchorReturn = (time) => {
      const returning = anchorReturn
      if (!returning) return
      const target = getAnchorReturnTarget({ x: returning.fromX, y: returning.fromY, k: returning.scale })
      const progress = Math.min(1, Math.max(0, (time - returning.start) / 600))
      const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2
      // Update D3's stored transform every frame as well as the rendered view.
      // The next gesture then starts at the exact visible position and scale.
      canvas.call(zoomBehavior.transform, zoomIdentity.translate(
        returning.fromX + ((target?.x ?? returning.toX) - returning.fromX) * eased,
        returning.fromY + ((target?.y ?? returning.toY) - returning.fromY) * eased,
      ).scale(returning.scale))
      if (progress === 1) {
        cancelAnchorReturn()
        cameraVelocityX = cameraVelocityY = targetVelocityX = targetVelocityY = 0
        nextTurnAt = motionTime
      }
    }
    const getAnchorReturnTarget = (transform: { x: number; y: number; k: number }) => {
      if (!anchorNode || anchorNode.x === undefined || anchorNode.y === undefined) return
      const cosine = Math.cos(rotationAngle), sine = Math.sin(rotationAngle)
      const dx = anchorNode.x - rotationCenter.x, dy = anchorNode.y - rotationCenter.y
      const x = rotationCenter.x + dx * cosine - dy * sine + width / 2
      const y = rotationCenter.y + dx * sine + dy * cosine + height / 2
      const effectScale = transform.k * Math.max(1, Math.min(2.5, 0.75 / transform.k))
      const margin = Math.min(width / 2 - 4, height / 2 - 4, anchorNode === homeNode
        ? Math.max(24, nodeRadius(anchorNode) * 1.65 * 2.8 * effectScale + 8)
        : Math.max(24, nodeRadius(anchorNode) * 1.8 + 8))
      const screenX = x * transform.k + transform.x + cameraX
      const screenY = y * transform.k + transform.y + cameraY
      return {
        x: Math.max(margin, Math.min(width - margin, screenX)) - x * transform.k - cameraX,
        y: Math.max(margin, Math.min(height - margin, screenY)) - y * transform.k - cameraY,
      }
    }
    returnAnchorToView = () => {
      if (dragging || viewportInteracting) return
      const target = getAnchorReturnTarget(currentTransform)
      if (!target || (Math.abs(target.x - currentTransform.x) < 0.01 && Math.abs(target.y - currentTransform.y) < 0.01)) return
      anchorReturn = {
        start: performance.now(), fromX: currentTransform.x, fromY: currentTransform.y,
        toX: target.x, toY: target.y, scale: currentTransform.k,
      }
      homeReturnActive = true
    }
    canvas.call(zoomBehavior)
    if (autoFit && graphData.nodes.length) {
      const xs = graphData.nodes.map((node) => node.x ?? 0)
      const ys = graphData.nodes.map((node) => node.y ?? 0)
      const minX = Math.min(...xs), maxX = Math.max(...xs)
      const minY = Math.min(...ys), maxY = Math.max(...ys)
      rotationCenter = homeNode ? { x: 0, y: 0 } : { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
      const fitScale = Math.max(0.05, Math.min(1,
        Math.max(1, width - 40) / (maxX - minX + 24),
        Math.max(1, height - 40) / (maxY - minY + 24),
      )) * 2.09664
      canvas.call(zoomBehavior.transform, zoomIdentity.translate(
        width / 2 - fitScale * (rotationCenter.x + width / 2),
        height / 2 - fitScale * (rotationCenter.y + height / 2),
      ).scale(fitScale))
    }
  }

  const visibilityTargets=new Map<string,number>()
  const visibilityValues=new Map<string,number>()
  const updateVisibility=(selected:ReadonlySet<GraphKind>)=>{
    const shown=filterGraphContent(data,selected)
    const tags=new Set([...shown.values()].flatMap(item=>item.tags.map(tag=>`tags/${tag}`)))
    for(const n of nodeRenderData){
      const id=n.simulationData.id,visible=id==='/'||shown.has(id)||tags.has(id)
      visibilityTargets.set(id,visible?1:0)
      n.gfx.eventMode=visible?'static':'none'
    }
    fullTitle.hidden=true
    updateHoverInfo(null);renderNodes();renderLinks();renderLabels()
  }
  if(kinds){updateVisibility(kinds);graphVisibility.set(graph,updateVisibility)}
  let visibilityFrame=performance.now()
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
  const expandedGraph = graph.classList.contains("global-graph-container")
  let motionTime = 0
  let roamHeading = Math.random() * Math.PI * 2
  let nextTurnAt = 0
  let targetVelocityX = 0
  let targetVelocityY = 0
  let previousFrame: number | undefined
  let animationFrame: number
  let stopAnimation = false
  function animate(time: number) {
    if (stopAnimation) return
    if (!expandedLayout && expandedGraphOpen) {
      previousFrame = time
      animationFrame = requestAnimationFrame(animate)
      return
    }
    const visibilityStep=reducedMotion.matches?1:Math.min(1,(time-visibilityFrame)/65)
    visibilityFrame=time
    for(const n of nodeRenderData){
      const id=n.simulationData.id,target=visibilityTargets.get(id)??1,previous=visibilityValues.get(id)??target
      const value=Math.abs(target-previous)<.005?target:previous+(target-previous)*visibilityStep
      visibilityValues.set(id,value)
      n.gfx.parent!.alpha=value;n.label.parent!.alpha=value
      n.gfx.parent!.visible=value>0;n.label.parent!.visible=value>0
    }
    advanceAnchorReturn?.(time)
    const delta = previousFrame === undefined ? 0 : Math.min(time - previousFrame, 50)
    const rotating = idleMotion && !dragging && !viewportInteracting && !document.hidden && !reducedMotion.matches
    const moving = rotating && !homeReturnActive
    if (idleMotion) {
      // A full revolution takes 48 seconds. Pause in place during interaction.
      if (rotating) {
        motionTime += delta
        rotationAngle = (rotationAngle + delta * Math.PI * 2 / (expandedGraph ? 120000 : 48000)) % (Math.PI * 2)
      }
      previousFrame = time
    }
    for (const { marker, phase, createdAt } of newStarMarkers) {
      marker.visible = Date.now() - createdAt < newStarWindow
      marker.alpha = reducedMotion.matches || document.hidden ? 1 : 0.9 + Math.sin(time / 2100 + phase) * 0.1
    }
    for (const { halo, phase } of stellarHalos) {
      const pulse = reducedMotion.matches || document.hidden ? 0 : Math.sin(time / 2300 + phase)
      halo.scale.set(1 + pulse * 0.1)
      halo.alpha = 0.8 + pulse * 0.2
    }
    for (const halo of loneStarHalos) {
      const pulse = reducedMotion.matches || document.hidden ? 0 : Math.sin(time / 2000)
      halo.scale.set(1 + pulse * 0.12)
      halo.alpha = 0.8 + pulse * 0.2
    }
    if (blackHoleFlow && !document.hidden && !reducedMotion.matches) {
      blackHoleFlow.rotation = time / 1500
      if (blackHoleDisk) {
        blackHoleDisk.rotation = -0.35 + Math.sin(time / 4000) * 0.32
        blackHoleDisk.scale.y = 0.4 + Math.sin(time / 3200) * 0.16
      }
      if (blackHoleHalo) {
        blackHoleHalo.scale.set(1 + Math.sin(time / 1400) * 0.2)
        blackHoleHalo.alpha = 0.7 + Math.sin(time / 1400) * 0.3
      }
    }
    const cosine = Math.cos(rotationAngle)
    const sine = Math.sin(rotationAngle)
    const position = (node: NodeData) => {
      const dx = node.x! - rotationCenter.x
      const dy = node.y! - rotationCenter.y
      return {
        x: rotationCenter.x + dx * cosine - dy * sine + width / 2,
        y: rotationCenter.y + dx * sine + dy * cosine + height / 2,
      }
    }
    if (moving && !expandedGraph && graphData.nodes.length) {
      const points = graphData.nodes.filter((node) => Number.isFinite(node.x) && Number.isFinite(node.y)).map((node) => {
        const point = position(node)
        return { id: node.id, x: point.x * currentTransform.k + currentTransform.x, y: point.y * currentTransform.k + currentTransform.y }
      })
      const visible = (x: number, y: number) => points.filter((point) =>
        point.x + x > 18 && point.x + x < width - 18 && point.y + y > 18 && point.y + y < height - 18).length
      if (motionTime >= nextTurnAt) {
        // Random travel commands, not destinations: continuing a direction is allowed.
        if (Math.random() > 0.32) roamHeading = Math.floor(Math.random() * 8) * Math.PI / 4
        roamHeading += (Math.random() - 0.5) * 0.25
        const speed = (8 + Math.random() * 8) * Math.min(1.4, Math.min(width, height) / 250)
        targetVelocityX = Math.cos(roamHeading) * speed
        targetVelocityY = Math.sin(roamHeading) * speed
        nextTurnAt = motionTime + 2400 + Math.random() * 4800
      }
      let desiredVelocityX = targetVelocityX
      let desiredVelocityY = targetVelocityY
      if (points.length) {
        // Look ahead only to avoid empty space, never to select/follow a node.
        const lookAhead = 1.8
        const angleAhead = lookAhead * Math.PI * 2 / 48
        const originX = (rotationCenter.x + width / 2) * currentTransform.k + currentTransform.x
        const originY = (rotationCenter.y + height / 2) * currentTransform.k + currentTransform.y
        const predicted = points.map((point) => {
          const dx = point.x - originX, dy = point.y - originY
          return {
            x: originX + dx * Math.cos(angleAhead) - dy * Math.sin(angleAhead) + cameraX + desiredVelocityX * lookAhead,
            y: originY + dx * Math.sin(angleAhead) + dy * Math.cos(angleAhead) + cameraY + desiredVelocityY * lookAhead,
          }
        })
        if (!predicted.some((point) => point.x > 38 && point.x < width - 38 && point.y > 38 && point.y < height - 38)) {
          const correction = predicted.map((point) => ({
            x: Math.max(38, Math.min(width - 38, point.x)) - point.x,
            y: Math.max(38, Math.min(height - 38, point.y)) - point.y,
          })).reduce((best, value) => Math.hypot(value.x, value.y) < Math.hypot(best.x, best.y) ? value : best)
          desiredVelocityX += correction.x / lookAhead
          desiredVelocityY += correction.y / lookAhead
        }
      }
      const speedLimit = Math.max(1, Math.hypot(desiredVelocityX, desiredVelocityY) / 22)
      const easing = 1 - Math.exp(-delta / 700)
      cameraVelocityX += (desiredVelocityX / speedLimit - cameraVelocityX) * easing
      cameraVelocityY += (desiredVelocityY / speedLimit - cameraVelocityY) * easing
      let nextX = cameraX + cameraVelocityX * delta / 1000
      let nextY = cameraY + cameraVelocityY * delta / 1000
      if (points.length && visible(nextX, nextY) === 0) {
        // Last-resort minimum correction; no recentering or focus changes.
        const offset = points.map((point) => ({
          x: Math.max(24, Math.min(width - 24, point.x + nextX)) - (point.x + nextX),
          y: Math.max(24, Math.min(height - 24, point.y + nextY)) - (point.y + nextY),
        })).reduce((best, value) => Math.hypot(value.x, value.y) < Math.hypot(best.x, best.y) ? value : best)
        nextX += offset.x
        nextY += offset.y
      }
      if (homeNode && slug === "/" && !homeReturnActive) {
        const home = position(homeNode)
        const screenX = home.x * currentTransform.k + currentTransform.x
        const screenY = home.y * currentTransform.k + currentTransform.y
        const effectScale = currentTransform.k * Math.max(1, Math.min(2.5, 0.75 / currentTransform.k))
        const margin = Math.min(width / 2 - 4, height / 2 - 4,
          Math.max(24, nodeRadius(homeNode) * 1.65 * 2.8 * effectScale + 8))
        const boundedX = Math.max(margin - screenX, Math.min(width - margin - screenX, nextX))
        const boundedY = Math.max(margin - screenY, Math.min(height - margin - screenY, nextY))
        if (boundedX !== nextX) { cameraVelocityX *= -0.5; targetVelocityX *= -1 }
        if (boundedY !== nextY) { cameraVelocityY *= -0.5; targetVelocityY *= -1 }
        nextX = boundedX
        nextY = boundedY
      }
      cameraX = nextX
      cameraY = nextY
    }
    if (idleMotion) stage.position.set(currentTransform.x + cameraX, currentTransform.y + cameraY)
    for (const n of nodeRenderData) {
      const { x, y } = n.simulationData
      // A lone node settles exactly at (0, 0), which maps to the center of
      // the graph after the viewport offset below. Zero is a valid position.
      if (x === undefined || y === undefined) continue
      const point = position(n.simulationData)
      n.gfx.position.set(point.x, point.y)
      // Compensate for overview zoom so the central effect stays readable.
      if (n.simulationData.id === "/") {
        n.gfx.scale.set(Math.max(1, Math.min(2.5, 0.75 / currentTransform.k)))
      }
      if (n.label) {
        n.label.position.set(point.x, point.y)
      }
    }

    for (const l of linkRenderData) {
      const linkData = l.simulationData
      const source = position(linkData.source)
      const target = position(linkData.target)
      l.gfx.alpha=Math.min(visibilityValues.get(linkData.source.id)??1,visibilityValues.get(linkData.target.id)??1)
      l.gfx.clear()
      l.gfx.moveTo(source.x, source.y)
      l.gfx
        .lineTo(target.x, target.y)
        .stroke({ alpha: l.alpha, width: 1, color: l.color })
    }

    tweens.forEach((t) => t.update(time))
    app.renderer.render(app.stage)
    if (expandedLayout && graph.hasAttribute("data-loading")) {
      delete graph.dataset.loading
      graph.setAttribute("aria-busy", "false")
    }
    animationFrame = requestAnimationFrame(animate)
  }

  animationFrame = requestAnimationFrame(animate)
  return () => {
    graphVisibility.delete(graph)
    stopAnimation = true
    cancelAnchorReturn()
    cancelAnimationFrame(animationFrame)
    simulation.stop()
    fullTitle.remove()
    app.destroy()
  }
}

const localGraphCleanups = new Map<HTMLElement, {slug:FullSlug;cleanup:()=>void}>()
let globalGraphCleanups: (() => void)[] = []

function cleanupLocalGraphs(preserveRetained=false) {
  for (const graph of document.querySelectorAll<HTMLElement>(".graph-container")) {
    if(!preserveRetained||!graph.closest('[data-graph-retained]'))graphRequests.delete(graph)
  }
  for (const [graph,record] of localGraphCleanups) {
    if(preserveRetained&&graph.closest('[data-graph-retained]'))continue
    graphRequests.delete(graph);record.cleanup();localGraphCleanups.delete(graph)
  }
}

function cleanupGlobalGraphs() {
  for (const graph of document.querySelectorAll<HTMLElement>(".global-graph-container")) graphRequests.delete(graph)
  for (const cleanup of globalGraphCleanups) {
    cleanup()
  }
  globalGraphCleanups = []
}

// @ts-ignore
document.addEventListener("nav", async (e: CustomEventMap["nav"]) => {
  let disposed = false
  window.addCleanup(() => { disposed = true })

  // Keep the same graph instance and route state when moving it below the content.
  queueMicrotask(() => {
    if (disposed) return
    const slot = document.querySelector<HTMLElement>("[data-mobile-page-graph]")
    const graph = document.querySelector<HTMLElement>("[data-repo-graph], [data-video-graph]")
    if (!slot || !graph) return
    const home = document.createComment("graph sidebar position")
    graph.before(home)
    const compact = matchMedia("(max-width: 1199px)")
    const placeGraph = () => {
      if (compact.matches) slot.append(graph)
      else home.after(graph)
      void renderLocalGraph(true)
    }
    placeGraph()
    compact.addEventListener("change", placeGraph)
    window.addCleanup(() => {
      compact.removeEventListener("change", placeGraph)
      home.after(graph)
      home.remove()
    })
  })

  async function renderLocalGraph(force=false) {
    const slug = currentGraphSlug(getFullSlug(window))
    for(const [graph,record] of localGraphCleanups){
      if(force||!graph.isConnected||record.slug!==slug){graphRequests.delete(graph);record.cleanup();localGraphCleanups.delete(graph)}
    }
    const localGraphContainers = document.getElementsByClassName("graph-container")
    for (const container of localGraphContainers) {
      if (!(container as HTMLElement).offsetWidth || localGraphCleanups.has(container as HTMLElement)) continue
      const cleanup = await renderGraph(container as HTMLElement, slug)
      if (cleanup) {
        const graph=container as HTMLElement;graph.dataset.graphReady=""
        localGraphCleanups.set(graph,{slug,cleanup:()=>{delete graph.dataset.graphReady;cleanup()}})
      }
    }
  }

  const shareGraphReady = () => { void renderLocalGraph() }
  document.addEventListener("drive-share-graph-ready", shareGraphReady)
  document.addEventListener("decryptComplete", shareGraphReady)
  const videoGraphReady = () => { hideGlobalGraph(); void renderLocalGraph() }
  document.addEventListener("video-graph-ready", videoGraphReady)
  const repoGraphReady = () => { hideGlobalGraph(); void renderLocalGraph() }
  document.addEventListener("repo-graph-ready", repoGraphReady)
  window.addCleanup(() => {
    document.removeEventListener("drive-share-graph-ready", shareGraphReady)
    document.removeEventListener("decryptComplete", shareGraphReady)
    document.removeEventListener("video-graph-ready", videoGraphReady)
    document.removeEventListener("repo-graph-ready", repoGraphReady)
  })
  await renderLocalGraph()
  if (disposed) return
  const graphLayouts = [window.matchMedia("(max-width: 800px)"), window.matchMedia("(min-width: 1200px)")]
  let layoutFrame: number | undefined
  const handleLayoutChange = () => {
    if (layoutFrame !== undefined) cancelAnimationFrame(layoutFrame)
    layoutFrame = requestAnimationFrame(() => {
      layoutFrame = undefined
      hideGlobalGraph()
      void renderLocalGraph(true)
    })
  }
  graphLayouts.forEach((layout) => layout.addEventListener("change", handleLayoutChange))
  const handleThemeChange = () => {
    void renderLocalGraph(true)
    if (containers.some(container=>container.classList.contains("active"))) void renderGlobalGraph(true)
  }

  document.addEventListener("themechange", handleThemeChange)
  // @ts-ignore
  window.addCleanup(() => {
    document.removeEventListener("themechange", handleThemeChange)
    graphLayouts.forEach((layout) => layout.removeEventListener("change", handleLayoutChange))
    if (layoutFrame !== undefined) cancelAnimationFrame(layoutFrame)
  })

  const containers = [...document.getElementsByClassName("global-graph-outer")] as HTMLElement[]
  const graphKinds = new Set<GraphKind>(["article", "share", "repo", "video"])
  let globalOpenRequest = 0
  containers.forEach(container => registerEscapeHandler(container, hideGlobalGraph))
  async function renderGlobalGraph(refresh = false) {
    if (!refresh && containers.some(container => container.classList.contains("active"))) return
    if (!refresh) {
      graphKinds.clear()
      for (const kind of ["article", "share", "repo", "video"] as const) graphKinds.add(kind)
      for (const container of containers) {
        container.querySelectorAll("[data-graph-kind]").forEach(button => button.setAttribute("aria-pressed", "true"))
      }
    }
    const openRequest = ++globalOpenRequest
    cleanupGlobalGraphs()
    const slug = currentGraphSlug(getFullSlug(window))
    for (const container of containers) {
      if (!container.parentElement?.offsetWidth) continue
      expandedGraphOpen = true
      container.classList.add("active")
      const sidebar = container.closest(".sidebar") as HTMLElement
      if (sidebar) {
        sidebar.style.zIndex = "1"
      }

      const graphContainer = container.querySelector(".global-graph-container") as HTMLElement
      if (graphContainer) {
        graphContainer.dataset.loading = ""
        graphContainer.setAttribute("aria-busy", "true")
        try {
          const cleanup = await renderGraph(graphContainer, slug, graphKinds)
          if (cleanup) globalGraphCleanups.push(cleanup)
        } catch (error) {
          console.error("Unable to render expanded graph", error)
          if (openRequest === globalOpenRequest && container.classList.contains("active")) {
            const message=document.createElement("p");message.className="graph-load-error";message.textContent="星轨图暂时未能加载，请关闭后重试。";graphContainer.append(message)
            graphContainer.setAttribute("aria-busy", "false")
            delete graphContainer.dataset.loading
          }
        }
      }
      break
    }
  }

  function hideGlobalGraph() {
    globalOpenRequest++
    expandedGraphOpen = false
    cleanupGlobalGraphs()
    for (const container of containers) {
      container.classList.remove("active")
      const sidebar = container.closest(".sidebar") as HTMLElement
      if (sidebar) {
        sidebar.style.zIndex = ""
      }
    }
  }

  async function shortcutHandler(e: HTMLElementEventMap["keydown"]) {
    if (e.key === "g" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault()
      const anyGlobalGraphOpen = containers.some((container) =>
        container.classList.contains("active"),
      )
      anyGlobalGraphOpen ? hideGlobalGraph() : renderGlobalGraph()
    }
  }

  const containerIcons = document.getElementsByClassName("global-graph-icon")
  const openGlobalGraph = () => { void renderGlobalGraph() }
  Array.from(containerIcons).forEach((icon) => {
    icon.addEventListener("click", openGlobalGraph)
    // @ts-ignore
    window.addCleanup(() => icon.removeEventListener("click", openGlobalGraph))
  })
  const filterButtons = containers.flatMap(container => [...container.querySelectorAll<HTMLButtonElement>("[data-graph-kind]")])
  const changeGraphKind = (event: Event) => {
    const button = event.currentTarget as HTMLButtonElement
    if (button.disabled) return
    const kind = button.dataset.graphKind as GraphKind
    if (graphKinds.has(kind)) graphKinds.delete(kind)
    else graphKinds.add(kind)
    for (const filter of filterButtons) filter.setAttribute("aria-pressed", String(graphKinds.has(filter.dataset.graphKind as GraphKind)))
    for(const container of containers){
      const graph=container.querySelector<HTMLElement>(".global-graph-container")
      if(graph)graphVisibility.get(graph)?.(graphKinds)
    }
  }
  filterButtons.forEach(button => button.addEventListener("click", changeGraphKind))
  window.addCleanup(() => filterButtons.forEach(button => button.removeEventListener("click", changeGraphKind)))

  const changedContentTags=()=>{void renderLocalGraph(true);if(containers.some(container=>container.classList.contains('active')))void renderGlobalGraph(true)}
  document.addEventListener('content-tags-changed',changedContentTags)
  window.addCleanup(()=>document.removeEventListener('content-tags-changed',changedContentTags))
  document.addEventListener("keydown", shortcutHandler)
  // @ts-ignore
  window.addCleanup(() => {
    expandedGraphOpen = false
    document.removeEventListener("keydown", shortcutHandler)
    cleanupLocalGraphs(true)
    cleanupGlobalGraphs()
  })
})
