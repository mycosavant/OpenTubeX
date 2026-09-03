/**
 * Liquid Glass: true optical refraction for app surfaces.
 *
 * The effect is not `feTurbulence`. Noise gives crackled, frosted glass; a
 * lens gives a smooth bend that magnifies what sits just outside the edge.
 * So the displacement map here is generated from the signed distance field of
 * the element's own rounded rectangle: the red channel carries the horizontal
 * component of the surface normal, the green channel the vertical one, and
 * both fall off to neutral once you are further inside than the bezel.
 *
 * That map is then read three times at slightly different displacement
 * scales, once per colour channel, and the results are screen-blended back
 * together. Bending red, green and blue by different amounts is what produces
 * the colour fringing along the rim - real chromatic aberration rather than a
 * pair of opposed warm and cool shadows faking it.
 *
 * `backdrop-filter: url(#filter)` only reaches the backdrop in Chromium, which
 * is what the desktop app runs on. Everywhere else the plain blur that the
 * glass layer already applies stays in place, so there is nothing to fall back
 * to explicitly.
 */

const FILTER_ID_PREFIX = 'otxLiquidGlass'
const CONTAINER_ID = 'otxLiquidGlassFilters'

/** Element sizes are snapped to this grid so a resize reuses an existing map. */
const SIZE_BUCKET = 16

/** Largest number of generated maps kept alive at once. */
const MAX_CACHED_MAPS = 32

const MAP_RESOLUTIONS = Object.freeze({ low: 96, medium: 160, high: 256 })

/**
 * How much of an element's shorter side one edge's rim may take up. The bezel
 * is drawn in from both edges, so this caps it at a little under half the pane
 * and always leaves a flat middle for the rim to be read against.
 */
const MAX_BEZEL_FRACTION = 0.22

/** Per-channel offset, as a share of the displacement it is offsetting. */
const MAX_CHROMATIC_FRACTION = 0.35

/**
 * Surfaces the effect attaches to, by surface group. Selectors rather than a
 * directive on every component: the lens has to know the element's real
 * geometry, so it is driven from the DOM either way, and a list keeps the
 * whole experiment in one file that can be removed in one piece.
 */
const LIQUID_GLASS_SELECTORS = Object.freeze({
  chrome: '.topNav, .sideNav, .tabBar',
  cards: '.ft-card, .sectionBody',
  menus: '.promptCard, .iconDropdown, [data-sonner-toast]',
  inputs: '.ft-input-component',
  player: '.fullscreenSponsorBlockOverlay, .fullscreenLiveChatOverlay, .fullscreenCommentsOverlay, .fullscreenPlaylistOverlay',
})

/**
 * @typedef {{
 *   enabled: boolean,
 *   scale?: number,
 *   bezel?: number,
 *   radius?: number,
 *   chromatic?: number,
 *   blur?: number,
 *   quality?: string,
 *   maxElements?: number,
 *   surfaces?: string[]
 * }} LiquidGlassConfig
 */

/** @type {LiquidGlassConfig} */
let config = { enabled: false }
let filterContainer = null
let mutationObserver = null
let resizeObserver = null
let intersectionObserver = null
let nextFilterId = 0

/**
 * Every element currently carrying the effect, with the geometry key its
 * filter was built for so a resize can tell whether anything has to change.
 * @type {Map<Element, { key: string | null, visible: boolean }>}
 */
const trackedElements = new Map()

/** @type {Map<string, { id: string, uses: number }>} */
const filtersByKey = new Map()

/** @type {string[]} insertion order, for evicting the least recently built map */
const filterKeyOrder = []

/* ------------------------------------------------------------------------ *
 * Displacement map generation
 * ------------------------------------------------------------------------ */

/**
 * Signed distance to the edge of a rounded rectangle centred on the origin.
 * Negative inside, zero on the edge.
 * @param {number} x
 * @param {number} y
 * @param {number} halfWidth
 * @param {number} halfHeight
 * @param {number} radius
 */
function roundedRectDistance(x, y, halfWidth, halfHeight, radius) {
  const qx = Math.abs(x) - halfWidth + radius
  const qy = Math.abs(y) - halfHeight + radius
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
  return outside + Math.min(Math.max(qx, qy), 0) - radius
}

/**
 * How hard the lens bends light at a given depth into the bezel.
 *
 * A bevel with a circular cross-section has a surface slope of
 * `(1-t) / sqrt(1 - (1-t)^2)`, which runs away to infinity right at the rim.
 * Clamping it and normalising keeps the strong edge magnification that reads
 * as glass without the outermost pixel row smearing across the surface.
 *
 * @param {number} t 0 at the outer edge, 1 at the inner end of the bezel
 */
export function bezelSlope(t) {
  if (t <= 0) return 1
  if (t >= 1) return 0
  const inner = 1 - t
  const slope = inner / Math.sqrt(Math.max(1 - inner * inner, 1e-4))
  // The same clamp the normalisation below assumes; 4 keeps roughly the outer
  // quarter of the bezel at full strength instead of a single hot pixel.
  return Math.min(slope, 4) / 4
}

/**
 * Builds the lens map for one geometry as raw RGBA bytes.
 *
 * Exported so the profile can be checked without a canvas: the map is the
 * whole effect, and a wrong falloff is invisible in a screenshot diff but
 * obvious in the numbers.
 *
 * @param {{ width: number, height: number, radius: number, bezel: number }} geometry
 * @returns {{ width: number, height: number, data: Uint8ClampedArray }}
 */
export function createLensMapData({ width, height, radius, bezel }) {
  const mapWidth = Math.max(2, Math.round(width))
  const mapHeight = Math.max(2, Math.round(height))
  const halfWidth = mapWidth / 2
  const halfHeight = mapHeight / 2
  const cornerRadius = Math.max(0, Math.min(radius, Math.min(halfWidth, halfHeight)))
  const bezelWidth = Math.max(1, Math.min(bezel, Math.min(halfWidth, halfHeight)))

  const data = new Uint8ClampedArray(mapWidth * mapHeight * 4)
  // One distance sample per pixel; the normal comes from the finished field so
  // the gradient stays consistent with the falloff it is scaled by.
  const distances = new Float32Array(mapWidth * mapHeight)

  for (let y = 0; y < mapHeight; y++) {
    for (let x = 0; x < mapWidth; x++) {
      distances[y * mapWidth + x] = roundedRectDistance(
        x + 0.5 - halfWidth,
        y + 0.5 - halfHeight,
        halfWidth,
        halfHeight,
        cornerRadius
      )
    }
  }

  const at = (x, y) => distances[
    Math.min(mapHeight - 1, Math.max(0, y)) * mapWidth + Math.min(mapWidth - 1, Math.max(0, x))
  ]

  for (let y = 0; y < mapHeight; y++) {
    for (let x = 0; x < mapWidth; x++) {
      const index = (y * mapWidth + x) * 4
      const distance = distances[y * mapWidth + x]

      // Outside the shape, and anywhere deeper in than the bezel, the glass is
      // flat: neutral grey means feDisplacementMap moves nothing.
      let displacementX = 0
      let displacementY = 0

      if (distance < 0) {
        const depth = -distance
        if (depth < bezelWidth) {
          // Central differences give the outward normal of the distance field.
          const gradientX = at(x + 1, y) - at(x - 1, y)
          const gradientY = at(x, y + 1) - at(x, y - 1)
          const length = Math.hypot(gradientX, gradientY)
          if (length > 1e-5) {
            const strength = bezelSlope(depth / bezelWidth)
            displacementX = (gradientX / length) * strength
            displacementY = (gradientY / length) * strength
          }
        }
      }

      // 128 is "no displacement"; the remaining 127 steps carry the direction.
      data[index] = 128 + displacementX * 127
      data[index + 1] = 128 + displacementY * 127
      data[index + 2] = 128
      data[index + 3] = 255
    }
  }

  return { width: mapWidth, height: mapHeight, data }
}

/**
 * @param {{ width: number, height: number, radius: number, bezel: number }} geometry
 * @returns {string} a data URI holding the lens map
 */
function createLensMapUrl(geometry) {
  const map = createLensMapData(geometry)
  const canvas = document.createElement('canvas')
  canvas.width = map.width
  canvas.height = map.height
  const context = canvas.getContext('2d')
  context.putImageData(new ImageData(map.data, map.width, map.height), 0, 0)
  return canvas.toDataURL('image/png')
}

/* ------------------------------------------------------------------------ *
 * Filter construction
 * ------------------------------------------------------------------------ */

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
const XLINK_NAMESPACE = 'http://www.w3.org/1999/xlink'

const CHANNEL_MATRICES = Object.freeze({
  red: '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0',
  green: '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0',
  blue: '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0',
})

function ensureFilterContainer() {
  if (filterContainer !== null && filterContainer.isConnected) return filterContainer

  filterContainer = document.createElementNS(SVG_NAMESPACE, 'svg')
  filterContainer.setAttribute('id', CONTAINER_ID)
  filterContainer.setAttribute('aria-hidden', 'true')
  // Zero-sized rather than display:none: a filter inside a `display: none`
  // subtree is not resolved by every Chromium version.
  filterContainer.setAttribute('width', '0')
  filterContainer.setAttribute('height', '0')
  filterContainer.style.position = 'absolute'
  filterContainer.style.pointerEvents = 'none'
  filterContainer.style.opacity = '0'
  document.body.append(filterContainer)
  return filterContainer
}

/**
 * @param {SVGElement} parent
 * @param {string} name
 * @param {Record<string, string | number>} attributes
 */
function appendSvg(parent, name, attributes) {
  const element = document.createElementNS(SVG_NAMESPACE, name)
  for (const [attribute, value] of Object.entries(attributes)) {
    element.setAttribute(attribute, String(value))
  }
  parent.append(element)
  return element
}

/**
 * @param {{ width: number, height: number, radius: number, bezel: number }} geometry
 * @returns {string} the id of a filter that refracts an element of this shape
 */
function createFilter(geometry) {
  const container = ensureFilterContainer()
  const id = `${FILTER_ID_PREFIX}${nextFilterId++}`
  const { scale, chromatic } = geometry
  const blur = config.blur ?? 0

  const filter = appendSvg(container, 'filter', {
    id,
    // The displacement pulls in pixels from outside the element, so the filter
    // region has to be wider than the element or the rim is clipped flat.
    filterUnits: 'userSpaceOnUse',
    primitiveUnits: 'userSpaceOnUse',
    x: -scale,
    y: -scale,
    width: geometry.width + scale * 2,
    height: geometry.height + scale * 2,
    // linearRGB would mix the isolated channels back together before the
    // screen blend, losing the fringing entirely.
    'color-interpolation-filters': 'sRGB'
  })

  const image = appendSvg(filter, 'feImage', {
    result: 'lensMap',
    x: 0,
    y: 0,
    width: geometry.width,
    height: geometry.height,
    preserveAspectRatio: 'none'
  })
  const mapUrl = createLensMapUrl(geometry)
  image.setAttribute('href', mapUrl)
  // Older Chromium releases only look at the namespaced attribute.
  image.setAttributeNS(XLINK_NAMESPACE, 'xlink:href', mapUrl)

  // Red bends least, blue most: the same ordering a real lens produces, and
  // the reason the fringe reads as a prism rather than a registration error.
  const channels = [
    ['red', scale],
    ['green', scale + chromatic],
    ['blue', scale + chromatic * 2],
  ]

  for (const [channel, channelScale] of channels) {
    appendSvg(filter, 'feDisplacementMap', {
      in: 'SourceGraphic',
      in2: 'lensMap',
      scale: channelScale,
      xChannelSelector: 'R',
      yChannelSelector: 'G',
      result: `displaced-${channel}`
    })
    appendSvg(filter, 'feColorMatrix', {
      in: `displaced-${channel}`,
      type: 'matrix',
      values: CHANNEL_MATRICES[channel],
      result: channel
    })
  }

  appendSvg(filter, 'feBlend', { in: 'red', in2: 'green', mode: 'screen', result: 'redGreen' })
  appendSvg(filter, 'feBlend', { in: 'redGreen', in2: 'blue', mode: 'screen', result: 'refracted' })

  if (blur > 0) {
    appendSvg(filter, 'feGaussianBlur', { in: 'refracted', stdDeviation: blur })
  }

  return id
}

/**
 * @param {{ width: number, height: number, radius: number, bezel: number }} geometry
 */
function geometryKey(geometry) {
  return [
    geometry.width,
    geometry.height,
    geometry.radius,
    geometry.bezel,
    geometry.scale,
    geometry.chromatic,
    config.blur
  ].join(':')
}

/**
 * @param {string} key
 * @param {{ width: number, height: number, radius: number, bezel: number }} geometry
 */
function acquireFilter(key, geometry) {
  const existing = filtersByKey.get(key)
  if (existing !== undefined) {
    existing.uses += 1
    return existing.id
  }

  const entry = { id: createFilter(geometry), uses: 1 }
  filtersByKey.set(key, entry)
  filterKeyOrder.push(key)
  evictUnusedFilters()
  return entry.id
}

/**
 * @param {string | null} key
 */
function releaseFilter(key) {
  if (key === null) return
  const entry = filtersByKey.get(key)
  if (entry !== undefined) entry.uses = Math.max(0, entry.uses - 1)
}

/**
 * Generated maps are the expensive part, so unused ones are kept until the
 * cache is over its limit: scrolling a list back and forth otherwise rebuilds
 * the same map on every pass.
 */
function evictUnusedFilters() {
  while (filterKeyOrder.length > MAX_CACHED_MAPS) {
    const index = filterKeyOrder.findIndex(key => (filtersByKey.get(key)?.uses ?? 0) === 0)
    if (index === -1) return
    const [key] = filterKeyOrder.splice(index, 1)
    const entry = filtersByKey.get(key)
    filtersByKey.delete(key)
    filterContainer?.querySelector(`#${entry.id}`)?.remove()
  }
}

/* ------------------------------------------------------------------------ *
 * Element tracking
 * ------------------------------------------------------------------------ */

function activeSelector() {
  const surfaces = config.surfaces ?? []
  const selectors = surfaces
    .map(group => LIQUID_GLASS_SELECTORS[group])
    .filter(selector => selector !== undefined)
  return selectors.length === 0 ? null : selectors.join(', ')
}

/**
 * The plain blur, saturation and brightness the glass layer already asked for.
 * The refraction is prepended to it rather than replacing it, so the tint and
 * frosting knobs still apply to a liquid surface.
 */
function baseBackdropFilter() {
  const value = getComputedStyle(document.body).getPropertyValue('--glass-backdrop-filter').trim()
  return value === '' || value === 'none' ? '' : ` ${value}`
}

/**
 * @param {Element} element
 */
function measure(element) {
  const rect = element.getBoundingClientRect()
  if (rect.width < 1 || rect.height < 1) return null

  const bucket = (value) => Math.max(SIZE_BUCKET, Math.round(value / SIZE_BUCKET) * SIZE_BUCKET)
  const width = bucket(rect.width)
  const height = bucket(rect.height)

  // Zero means "whatever this element is already shaped like", so the lens
  // follows a card's rounding and the UI roundness setting without being told.
  const configuredRadius = config.radius ?? 0
  const radius = configuredRadius > 0
    ? configuredRadius
    : Number.parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0

  const resolution = MAP_RESOLUTIONS[config.quality ?? 'medium'] ?? MAP_RESOLUTIONS.medium
  // The map is stretched back over the element by feImage, so it only has to
  // carry enough resolution for the bezel to stay smooth.
  const downscale = Math.min(1, resolution / Math.max(width, height))

  // A bezel that meets itself across the pane leaves no flat middle, and the
  // whole surface shifts as one block instead of bending at its rim - which
  // reads as a rendering fault rather than as glass. Short controls therefore
  // get a proportionally smaller lens rather than the configured one.
  const shortSide = Math.min(width, height)
  const bezel = Math.min(config.bezel ?? 20, shortSide * MAX_BEZEL_FRACTION)
  // Displacing further than the bezel is wide samples from beyond the lens and
  // smears, so the refraction is capped by the bezel it is bending through.
  const scale = Math.min(config.scale ?? 0, bezel)
  const chromatic = Math.min(config.chromatic ?? 0, scale * MAX_CHROMATIC_FRACTION)

  return {
    width: Math.round(width * downscale),
    height: Math.round(height * downscale),
    radius: Math.round(radius * downscale),
    bezel: Math.max(1, Math.round(bezel * downscale)),
    scale: Math.round(scale),
    chromatic: Math.round(chromatic),
    elementWidth: width,
    elementHeight: height
  }
}

/**
 * @param {Element} element
 */
function applyToElement(element) {
  const state = trackedElements.get(element)
  if (state === undefined) return

  if (!state.visible || trackedElements.size > (config.maxElements ?? 60)) {
    clearElement(element, state)
    return
  }

  const geometry = measure(element)
  if (geometry === null) return

  const key = geometryKey(geometry)
  if (key === state.key) return

  releaseFilter(state.key)
  const id = acquireFilter(key, geometry)
  state.key = key
  element.style.setProperty('--glass-backdrop-filter', `url(#${id})${baseBackdropFilter()}`)
}

/**
 * @param {Element} element
 * @param {{ key: string | null }} state
 */
function clearElement(element, state) {
  releaseFilter(state.key)
  state.key = null
  element.style.removeProperty('--glass-backdrop-filter')
}

/**
 * @param {Element} element
 */
function track(element) {
  if (trackedElements.has(element)) return
  trackedElements.set(element, { key: null, visible: false })
  resizeObserver.observe(element)
  intersectionObserver.observe(element)
}

/**
 * @param {Element} element
 */
function untrack(element) {
  const state = trackedElements.get(element)
  if (state === undefined) return
  clearElement(element, state)
  trackedElements.delete(element)
  resizeObserver.unobserve(element)
  intersectionObserver.unobserve(element)
}

function scan() {
  const selector = activeSelector()
  if (selector === null) return
  for (const element of document.querySelectorAll(selector)) track(element)
}

function startObservers() {
  resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) applyToElement(entry.target)
  })

  // Off-screen surfaces cost nothing: a filter is only built once its element
  // is actually on screen, which is what keeps a long list affordable.
  intersectionObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const state = trackedElements.get(entry.target)
      if (state === undefined) continue
      state.visible = entry.isIntersecting
      applyToElement(entry.target)
    }
  }, { rootMargin: '200px' })

  mutationObserver = new MutationObserver(mutations => {
    const selector = activeSelector()
    if (selector === null) return
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue
        if (node.matches(selector)) track(node)
        for (const descendant of node.querySelectorAll(selector)) track(descendant)
      }
      for (const node of mutation.removedNodes) {
        if (!(node instanceof Element)) continue
        if (trackedElements.has(node)) untrack(node)
        for (const descendant of node.querySelectorAll(selector)) untrack(descendant)
      }
    }
  })
  mutationObserver.observe(document.body, { childList: true, subtree: true })
}

function teardown() {
  for (const [element, state] of trackedElements) clearElement(element, state)
  trackedElements.clear()

  mutationObserver?.disconnect()
  resizeObserver?.disconnect()
  intersectionObserver?.disconnect()
  mutationObserver = null
  resizeObserver = null
  intersectionObserver = null

  filtersByKey.clear()
  filterKeyOrder.length = 0
  filterContainer?.remove()
  filterContainer = null
}

/**
 * Turns the effect on, reconfigures it, or removes it completely.
 *
 * Every knob change rebuilds the filters, because the displacement scale and
 * the chromatic offset are baked into the filter graph rather than read from a
 * variable at paint time.
 *
 * @param {LiquidGlassConfig} nextConfig
 */
export function setLiquidGlassConfig(nextConfig) {
  if (typeof document === 'undefined') return

  const wasEnabled = config.enabled
  config = { ...nextConfig }

  if (!config.enabled) {
    if (wasEnabled) teardown()
    return
  }

  if (wasEnabled) {
    // Drop every built filter so the new knobs take effect, but keep the
    // elements tracked so nothing has to be rediscovered.
    for (const [element, state] of trackedElements) clearElement(element, state)
    filtersByKey.clear()
    filterKeyOrder.length = 0
    filterContainer?.replaceChildren()
  } else {
    startObservers()
  }

  scan()
  for (const element of trackedElements.keys()) applyToElement(element)
}

/**
 * @returns {boolean} whether the effect is currently installed
 */
export function isLiquidGlassInstalled() {
  return config.enabled === true && mutationObserver !== null
}

export { LIQUID_GLASS_SELECTORS }
