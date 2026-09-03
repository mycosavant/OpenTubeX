/**
 * Translucency ("glassmorphism") theme model.
 *
 * The glass layer is deliberately a *modifier* rather than a theme: it never
 * carries colours of its own unless it is explicitly told to. Every derived
 * surface starts from the colour the active theme already produced for that
 * surface, so a Tokyo Night or Catppuccin palette still reads as itself once
 * translucency is switched on. Only the optional tint pulls surfaces towards a
 * colour the user picked.
 *
 * This module is pure so both the main process (window background material)
 * and the renderer (CSS custom properties) can share it, and so the colour
 * maths is testable without a DOM.
 */

export const GLASS_TEXTURES = Object.freeze([
  'blur',
  'acrylic',
  'mica',
  'micaAlt',
  'liquid',
])

/**
 * Surface groups the glass can be applied to. Each maps onto a set of CSS
 * custom properties in `src/renderer/glass.css`.
 */
export const GLASS_SURFACE_GROUPS = Object.freeze([
  'chrome',
  'cards',
  'menus',
  'inputs',
  'player',
])

export const GLASS_TINT_MODES = Object.freeze(['theme', 'custom'])

export const GLASS_BORDER_TONES = Object.freeze(['auto', 'light', 'dark'])

export const GLASS_LIQUID_QUALITIES = Object.freeze(['low', 'medium', 'high'])

/**
 * Window background materials, in the platform-neutral spelling the settings
 * use. `resolveSystemBackdrop()` maps them onto what each platform calls them.
 */
export const GLASS_SYSTEM_BACKDROPS = Object.freeze([
  'none',
  'auto',
  'mica',
  'micaAlt',
  'acrylic',
])

const HEX_COLOR_PATTERN = /^#[\da-f]{6}$/i

/**
 * The single source of truth for every knob: normalisation, defaults, the
 * settings panel and the tests are all driven from this list, so a new knob
 * only has to be described once.
 *
 * @typedef {{
 *   key: string,
 *   type: 'boolean' | 'number' | 'enum' | 'color' | 'set',
 *   default: unknown,
 *   min?: number,
 *   max?: number,
 *   step?: number,
 *   values?: readonly string[],
 *   group: string
 * }} GlassKnob
 * @type {readonly GlassKnob[]}
 */
export const GLASS_KNOBS = Object.freeze([
  { key: 'enabled', type: 'boolean', default: false, group: 'general' },
  { key: 'texture', type: 'enum', values: GLASS_TEXTURES, default: 'acrylic', group: 'general' },
  { key: 'surfaces', type: 'set', values: GLASS_SURFACE_GROUPS, default: Object.freeze(['chrome', 'cards', 'menus']), group: 'general' },

  // "Luminous opacity": the master fill strength every surface tier scales from.
  { key: 'opacity', type: 'number', min: 0, max: 100, step: 1, default: 70, group: 'opacity' },
  { key: 'baseOpacity', type: 'number', min: 0, max: 100, step: 1, default: 100, group: 'opacity' },
  { key: 'chromeOpacity', type: 'number', min: 0, max: 100, step: 1, default: 85, group: 'opacity' },
  { key: 'cardOpacity', type: 'number', min: 0, max: 100, step: 1, default: 90, group: 'opacity' },
  { key: 'menuOpacity', type: 'number', min: 0, max: 100, step: 1, default: 95, group: 'opacity' },
  { key: 'inputOpacity', type: 'number', min: 0, max: 100, step: 1, default: 80, group: 'opacity' },
  // Lifts (positive) or sinks (negative) the surface fill towards white/black.
  { key: 'luminance', type: 'number', min: -100, max: 100, step: 1, default: 8, group: 'opacity' },

  { key: 'blurRadius', type: 'number', min: 0, max: 120, step: 1, default: 30, group: 'backdrop' },
  { key: 'saturation', type: 'number', min: 0, max: 300, step: 5, default: 180, group: 'backdrop' },
  { key: 'brightness', type: 'number', min: 20, max: 200, step: 1, default: 104, group: 'backdrop' },
  { key: 'contrast', type: 'number', min: 20, max: 200, step: 1, default: 102, group: 'backdrop' },

  { key: 'tintMode', type: 'enum', values: GLASS_TINT_MODES, default: 'theme', group: 'tint' },
  { key: 'tintColor', type: 'color', default: '#7aa2f7', group: 'tint' },
  { key: 'tintStrength', type: 'number', min: 0, max: 100, step: 1, default: 25, group: 'tint' },

  { key: 'noiseOpacity', type: 'number', min: 0, max: 40, step: 1, default: 5, group: 'texture' },
  { key: 'noiseScale', type: 'number', min: 20, max: 400, step: 5, default: 100, group: 'texture' },

  { key: 'borderTone', type: 'enum', values: GLASS_BORDER_TONES, default: 'auto', group: 'edge' },
  { key: 'borderOpacity', type: 'number', min: 0, max: 100, step: 1, default: 22, group: 'edge' },
  { key: 'borderWidth', type: 'number', min: 0, max: 4, step: 0.5, default: 1, group: 'edge' },
  { key: 'highlightOpacity', type: 'number', min: 0, max: 100, step: 1, default: 30, group: 'edge' },
  { key: 'innerShadowOpacity', type: 'number', min: 0, max: 100, step: 1, default: 18, group: 'edge' },
  { key: 'shadowStrength', type: 'number', min: 0, max: 100, step: 1, default: 25, group: 'edge' },

  { key: 'liquidScale', type: 'number', min: 0, max: 120, step: 1, default: 46, group: 'liquid' },
  { key: 'liquidBezel', type: 'number', min: 2, max: 80, step: 1, default: 22, group: 'liquid' },
  // 0 follows the element's own border radius, which is also what a zero-radius
  // lens would have described, so nothing is lost by spending the value on it.
  { key: 'liquidRadius', type: 'number', min: 0, max: 96, step: 1, default: 0, group: 'liquid' },
  { key: 'liquidChromatic', type: 'number', min: 0, max: 40, step: 1, default: 9, group: 'liquid' },
  { key: 'liquidBlur', type: 'number', min: 0, max: 24, step: 0.5, default: 2, group: 'liquid' },
  { key: 'liquidSpecular', type: 'number', min: 0, max: 100, step: 1, default: 40, group: 'liquid' },
  { key: 'liquidQuality', type: 'enum', values: GLASS_LIQUID_QUALITIES, default: 'medium', group: 'liquid' },
  { key: 'liquidMaxElements', type: 'number', min: 1, max: 400, step: 1, default: 60, group: 'liquid' },

  { key: 'systemBackdrop', type: 'enum', values: GLASS_SYSTEM_BACKDROPS, default: 'none', group: 'system' },
  { key: 'transparentWindowBackground', type: 'boolean', default: false, group: 'system' },

  { key: 'respectReducedTransparency', type: 'boolean', default: true, group: 'accessibility' },
  { key: 'fallbackOpacity', type: 'number', min: 0, max: 100, step: 1, default: 96, group: 'accessibility' },
])

const GLASS_KNOBS_BY_KEY = new Map(GLASS_KNOBS.map(knob => [knob.key, knob]))

export const GLASS_KNOB_GROUPS = Object.freeze([
  'general', 'opacity', 'backdrop', 'tint', 'texture', 'edge', 'liquid', 'system', 'accessibility',
])

/**
 * Values a texture stamps onto the knobs when it is picked. Everything a
 * preset touches stays editable afterwards; the preset is a starting point,
 * not a lock.
 */
export const GLASS_TEXTURE_PRESETS = Object.freeze({
  // Plain frosted glass: one even blur, no grain.
  blur: Object.freeze({
    opacity: 72,
    baseOpacity: 100,
    chromeOpacity: 85,
    cardOpacity: 90,
    menuOpacity: 95,
    inputOpacity: 80,
    luminance: 6,
    blurRadius: 18,
    saturation: 130,
    brightness: 100,
    contrast: 100,
    noiseOpacity: 0,
    borderOpacity: 18,
    highlightOpacity: 22,
    innerShadowOpacity: 12,
    shadowStrength: 20,
  }),
  // Windows Acrylic: heavy blur, strong saturation, visible grain, in-app layer.
  acrylic: Object.freeze({
    opacity: 70,
    baseOpacity: 100,
    chromeOpacity: 82,
    cardOpacity: 86,
    menuOpacity: 92,
    inputOpacity: 76,
    luminance: 8,
    blurRadius: 30,
    saturation: 180,
    brightness: 104,
    contrast: 102,
    noiseOpacity: 6,
    borderOpacity: 22,
    highlightOpacity: 30,
    innerShadowOpacity: 18,
    shadowStrength: 25,
  }),
  // Mica: the desktop wallpaper tint, so the page itself carries the effect and
  // the surfaces above it stay nearly solid.
  mica: Object.freeze({
    opacity: 82,
    baseOpacity: 45,
    chromeOpacity: 92,
    cardOpacity: 96,
    menuOpacity: 98,
    inputOpacity: 90,
    luminance: 4,
    blurRadius: 60,
    saturation: 110,
    brightness: 102,
    contrast: 100,
    noiseOpacity: 3,
    borderOpacity: 16,
    highlightOpacity: 16,
    innerShadowOpacity: 10,
    shadowStrength: 18,
  }),
  // Mica Alt: the tabbed variant, with a stronger wallpaper tint on the base.
  micaAlt: Object.freeze({
    opacity: 78,
    baseOpacity: 30,
    chromeOpacity: 70,
    cardOpacity: 94,
    menuOpacity: 98,
    inputOpacity: 88,
    luminance: 2,
    blurRadius: 70,
    saturation: 105,
    brightness: 98,
    contrast: 100,
    noiseOpacity: 4,
    borderOpacity: 14,
    highlightOpacity: 14,
    innerShadowOpacity: 10,
    shadowStrength: 16,
  }),
  // Liquid Glass: a thin, bright lens. The refraction does the work, so the
  // fill stays light and the blur low or the displacement is washed out.
  liquid: Object.freeze({
    opacity: 46,
    baseOpacity: 100,
    chromeOpacity: 80,
    cardOpacity: 82,
    menuOpacity: 88,
    inputOpacity: 70,
    luminance: 14,
    blurRadius: 8,
    saturation: 165,
    brightness: 106,
    contrast: 104,
    noiseOpacity: 0,
    borderOpacity: 34,
    highlightOpacity: 55,
    innerShadowOpacity: 26,
    shadowStrength: 30,
  }),
})

/**
 * How far each surface tier's own opacity is scaled by the master opacity, and
 * which CSS custom properties it feeds. Tiers exist so a single "luminous
 * opacity" slider keeps the depth relationship between the window chrome,
 * cards and popovers intact. The page background has no surface group and is
 * not scaled by the master strength - see `tierAlpha()`.
 */
export const GLASS_SURFACE_TIERS = Object.freeze([
  Object.freeze({ tier: 'base', opacityKey: 'baseOpacity', group: null }),
  Object.freeze({ tier: 'chrome', opacityKey: 'chromeOpacity', group: 'chrome' }),
  Object.freeze({ tier: 'card', opacityKey: 'cardOpacity', group: 'cards' }),
  Object.freeze({ tier: 'menu', opacityKey: 'menuOpacity', group: 'menus' }),
  Object.freeze({ tier: 'input', opacityKey: 'inputOpacity', group: 'inputs' }),
])

export const DEFAULT_GLASS_THEME = Object.freeze(
  Object.fromEntries(GLASS_KNOBS.map(({ key, default: value }) => [key, value]))
)

export function cloneDefaultGlassTheme() {
  return { ...DEFAULT_GLASS_THEME, surfaces: [...DEFAULT_GLASS_THEME.surfaces] }
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

/**
 * Rounds to the knob's step so stored values stay on the same grid the sliders
 * produce, which keeps "is this still the default?" comparisons honest.
 * @param {number} value
 * @param {GlassKnob} knob
 */
function quantize(value, knob) {
  const step = knob.step ?? 1
  return Math.round(clamp(value, knob.min, knob.max) / step) * step
}

/**
 * Coerces anything into a valid glass theme, never throwing: a corrupt or
 * partial value falls back knob by knob instead of losing the whole theme.
 * @param {unknown} value
 */
export function normalizeGlassTheme(value) {
  const source = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : {}
  /** @type {Record<string, unknown>} */
  const result = {}

  for (const knob of GLASS_KNOBS) {
    const raw = source[knob.key]

    switch (knob.type) {
      case 'boolean':
        result[knob.key] = typeof raw === 'boolean' ? raw : knob.default
        break
      case 'number':
        result[knob.key] = typeof raw === 'number' && Number.isFinite(raw)
          ? quantize(raw, knob)
          : knob.default
        break
      case 'enum':
        result[knob.key] = typeof raw === 'string' && knob.values.includes(raw) ? raw : knob.default
        break
      case 'color':
        result[knob.key] = typeof raw === 'string' && HEX_COLOR_PATTERN.test(raw)
          ? raw.toLowerCase()
          : knob.default
        break
      case 'set': {
        // Keep the canonical order so two equivalent selections compare equal.
        const selected = Array.isArray(raw) ? new Set(raw) : null
        result[knob.key] = selected === null
          ? [...knob.default]
          : knob.values.filter(entry => selected.has(entry))
        break
      }
    }
  }

  return result
}

/**
 * @param {Record<string, unknown>} theme
 * @param {string} texture
 */
export function applyGlassTexturePreset(theme, texture) {
  const preset = GLASS_TEXTURE_PRESETS[texture]
  if (preset === undefined) return normalizeGlassTheme(theme)
  return normalizeGlassTheme({ ...theme, ...preset, texture })
}

/**
 * @param {Record<string, unknown>} theme
 * @returns {boolean} whether every knob still matches its default
 */
export function isDefaultGlassTheme(theme) {
  const normalized = normalizeGlassTheme(theme)
  return GLASS_KNOBS.every(({ key, type }) => (
    type === 'set'
      ? normalized[key].join() === DEFAULT_GLASS_THEME[key].join()
      : normalized[key] === DEFAULT_GLASS_THEME[key]
  ))
}

/* ------------------------------------------------------------------------ *
 * Colour maths
 * ------------------------------------------------------------------------ */

const NAMED_TRANSPARENT = new Set(['transparent', 'none', ''])

/**
 * Parses the colour notations that can reach us: theme hex literals and the
 * `rgb()` / `rgba()` forms `getComputedStyle` hands back.
 * @param {string} value
 * @returns {{ r: number, g: number, b: number, a: number } | null}
 */
export function parseCssColor(value) {
  if (typeof value !== 'string') return null
  const color = value.trim().toLowerCase()
  if (NAMED_TRANSPARENT.has(color)) return { r: 0, g: 0, b: 0, a: 0 }

  if (color.startsWith('#')) {
    const digits = color.slice(1)
    const expanded = digits.length === 3 || digits.length === 4
      ? [...digits].map(digit => digit + digit).join('')
      : digits
    if (expanded.length !== 6 && expanded.length !== 8) return null
    if (!/^[\da-f]+$/.test(expanded)) return null
    const components = expanded.match(/[\da-f]{2}/g).map(part => Number.parseInt(part, 16))
    return {
      r: components[0],
      g: components[1],
      b: components[2],
      a: components.length === 4 ? components[3] / 255 : 1
    }
  }

  const functional = color.match(/^rgba?\(([^)]+)\)$/)
  if (functional === null) return null
  const parts = functional[1].split(/[\s,/]+/).filter(part => part !== '')
  if (parts.length < 3) return null

  const channel = (part) => {
    const number = Number.parseFloat(part)
    if (!Number.isFinite(number)) return null
    return clamp(Math.round(part.endsWith('%') ? (number / 100) * 255 : number), 0, 255)
  }
  const rgb = parts.slice(0, 3).map(channel)
  if (rgb.some(component => component === null)) return null

  let alpha = 1
  if (parts.length > 3) {
    const number = Number.parseFloat(parts[3])
    alpha = Number.isFinite(number)
      ? clamp(parts[3].endsWith('%') ? number / 100 : number, 0, 1)
      : 1
  }

  return { r: rgb[0], g: rgb[1], b: rgb[2], a: alpha }
}

/**
 * @param {{ r: number, g: number, b: number, a: number }} color
 */
export function formatRgba(color) {
  const alpha = Math.round(clamp(color.a, 0, 1) * 1000) / 1000
  const rgb = `${Math.round(color.r)} ${Math.round(color.g)} ${Math.round(color.b)}`
  return alpha >= 1 ? `rgb(${rgb})` : `rgb(${rgb} / ${alpha})`
}

/**
 * @param {{ r: number, g: number, b: number, a: number }} from
 * @param {{ r: number, g: number, b: number, a: number }} to
 * @param {number} amount 0-1
 */
export function mixColors(from, to, amount) {
  const ratio = clamp(amount, 0, 1)
  return {
    r: from.r + (to.r - from.r) * ratio,
    g: from.g + (to.g - from.g) * ratio,
    b: from.b + (to.b - from.b) * ratio,
    a: from.a + (to.a - from.a) * ratio
  }
}

/**
 * Perceived brightness, used to decide whether an automatic rim highlight
 * should be a white or a black edge.
 * @param {{ r: number, g: number, b: number }} color
 */
export function relativeLuminance(color) {
  return (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255
}

/**
 * Lifts a colour towards white for a positive amount and towards black for a
 * negative one. This is the "luminance" of the glass fill, kept separate from
 * the `brightness()` applied to what shows through it.
 * @param {{ r: number, g: number, b: number, a: number }} color
 * @param {number} amount -100..100
 */
export function adjustLuminance(color, amount) {
  const ratio = clamp(amount, -100, 100) / 100
  if (ratio === 0) return color
  const target = ratio > 0
    ? { r: 255, g: 255, b: 255, a: color.a }
    : { r: 0, g: 0, b: 0, a: color.a }
  return mixColors(color, target, Math.abs(ratio))
}

/* ------------------------------------------------------------------------ *
 * CSS derivation
 * ------------------------------------------------------------------------ */

/**
 * @param {Record<string, unknown>} theme normalized glass theme
 * @param {string} tier one of GLASS_SURFACE_TIERS' tier names
 */
function tierAlpha(theme, tier) {
  const entry = GLASS_SURFACE_TIERS.find(candidate => candidate.tier === tier)
  if (entry === undefined) return 1

  // The page background is the window itself rather than a pane floating on
  // it, so whether it is see-through is its own decision: the master strength
  // would otherwise make the whole window translucent the moment any surface
  // was, and "page opacity 100%" would not mean an opaque page.
  if (entry.group === null) return theme[entry.opacityKey] / 100

  return (theme.opacity / 100) * (theme[entry.opacityKey] / 100)
}

/**
 * Turns one of the active theme's own surface colours into its glass
 * counterpart: tinted (only if the user asked for a tint), luminance-shifted,
 * and given the tier's alpha. The theme's own hue is what survives, which is
 * what keeps a palette recognisable through the glass.
 *
 * @param {string} baseColor colour the theme produced for this surface
 * @param {Record<string, unknown>} theme normalized glass theme
 * @param {string} tier
 * @returns {string} a CSS colour
 */
export function glassSurfaceColor(baseColor, theme, tier) {
  const parsed = parseCssColor(baseColor)
  if (parsed === null) return baseColor

  let color = parsed
  if (theme.tintMode === 'custom' && theme.tintStrength > 0) {
    const tint = parseCssColor(theme.tintColor)
    if (tint !== null) color = mixColors(color, { ...tint, a: color.a }, theme.tintStrength / 100)
  }
  color = adjustLuminance(color, theme.luminance)

  // A surface the theme already made translucent must not become more opaque.
  return formatRgba({ ...color, a: clamp(color.a * tierAlpha(theme, tier), 0, 1) })
}

/**
 * The `backdrop-filter` value shared by every glass surface. Liquid Glass
 * prepends its own `url(#…)` reference to this at runtime, because the filter
 * has to be regenerated for each element's geometry.
 * @param {Record<string, unknown>} theme normalized glass theme
 */
export function glassBackdropFilter(theme) {
  const filters = []
  if (theme.blurRadius > 0) filters.push(`blur(${theme.blurRadius}px)`)
  if (theme.saturation !== 100) filters.push(`saturate(${theme.saturation}%)`)
  if (theme.brightness !== 100) filters.push(`brightness(${theme.brightness}%)`)
  if (theme.contrast !== 100) filters.push(`contrast(${theme.contrast}%)`)
  return filters.length === 0 ? 'none' : filters.join(' ')
}

/**
 * A tileable grain, encoded as an SVG data URI so it costs no asset and
 * follows the knobs. Acrylic and Mica both read as flat plastic without it.
 * @param {Record<string, unknown>} theme normalized glass theme
 */
export function glassNoiseImage(theme) {
  if (theme.noiseOpacity <= 0) return 'none'
  // Higher frequency is finer grain, so the scale knob reads the natural way round.
  const frequency = (0.9 / (theme.noiseScale / 100)).toFixed(3)
  // The opacity is baked into the image so the grain can be a plain background
  // layer, blended with `overlay`: the turbulence sits around mid-grey, which
  // is the neutral point of that blend, so it modulates without tinting.
  const opacity = (theme.noiseOpacity / 100).toFixed(3)
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">' +
    `<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="${frequency}" numOctaves="3" stitchTiles="stitch"/>` +
    '<feColorMatrix type="saturate" values="0"/></filter>' +
    `<rect width="120" height="120" filter="url(#n)" opacity="${opacity}"/></svg>`
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`
}

/**
 * @param {Record<string, unknown>} theme normalized glass theme
 * @param {boolean} isDarkSurface
 */
function edgeColors(theme, isDarkSurface) {
  const tone = theme.borderTone === 'auto'
    ? (isDarkSurface ? 'light' : 'dark')
    : theme.borderTone
  // A light rim on a dark surface reads as a lit edge; the inverse reads as a
  // shadowed one, so the highlight and the inner shadow always oppose.
  const rim = tone === 'light' ? '255 255 255' : '0 0 0'
  const counter = tone === 'light' ? '0 0 0' : '255 255 255'
  return { rim, counter }
}

/**
 * Every CSS custom property the glass layer needs, as `[property, value]`
 * pairs. The renderer writes these onto `document.body`, which is why the
 * surface colours have to be passed in: they are whatever the active theme
 * (built-in or custom) actually resolved to.
 *
 * @param {Record<string, unknown>} theme normalized glass theme
 * @param {Record<string, string>} baseColors resolved theme surface colours
 * @param {{ supportsBackdropFilter?: boolean, prefersReducedTransparency?: boolean, isDark?: boolean }} [environment]
 * @returns {[string, string][]}
 */
export function glassCssVariables(theme, baseColors, environment = {}) {
  const {
    supportsBackdropFilter = true,
    prefersReducedTransparency = false,
    isDark = true
  } = environment

  const reduced = prefersReducedTransparency && theme.respectReducedTransparency

  // Reduced transparency means opaque, not merely less translucent, so every
  // tier is pinned rather than only the master opacity.
  const opaque = Object.fromEntries(
    GLASS_SURFACE_TIERS.map(({ opacityKey }) => [opacityKey, 100])
  )

  // Without backdrop-filter a translucent surface is just a washed-out colour,
  // so the fallback keeps the tint but nearly all of the opacity.
  const effective = reduced
    ? { ...theme, ...opaque, opacity: 100, blurRadius: 0, noiseOpacity: 0 }
    : supportsBackdropFilter
      ? theme
      : { ...theme, opacity: theme.fallbackOpacity, blurRadius: 0 }

  const { rim, counter } = edgeColors(effective, isDark)
  /** @type {[string, string][]} */
  const variables = [
    // Saturation, brightness and contrast are all applied to the backdrop, so
    // they have nothing to act on once the filter itself is unavailable.
    ['--glass-backdrop-filter', reduced || !supportsBackdropFilter
      ? 'none'
      : glassBackdropFilter(effective)],
    ['--glass-noise-image', glassNoiseImage(effective)],
    ['--glass-noise-opacity', String(effective.noiseOpacity / 100)],
    ['--glass-noise-size', `${Math.round(120 * (effective.noiseScale / 100))}px`],
    ['--glass-border-color', `rgb(${rim} / ${effective.borderOpacity / 100})`],
    ['--glass-border-width', `${effective.borderWidth}px`],
    ['--glass-highlight-color', `rgb(${rim} / ${effective.highlightOpacity / 100})`],
    ['--glass-inner-shadow-color', `rgb(${counter} / ${effective.innerShadowOpacity / 100})`],
    // Kept as a shadow that paints nothing rather than `none`, because it is
    // composed into a longer box-shadow list where `none` would be invalid.
    ['--glass-shadow', effective.shadowStrength === 0
      ? '0 0 0 0 rgb(0 0 0 / 0)'
      : `0 8px 32px rgb(${counter} / ${(effective.shadowStrength / 100) * 0.5})`],
    ['--glass-liquid-specular', String(effective.liquidSpecular / 100)],
  ]

  for (const { tier, group } of GLASS_SURFACE_TIERS) {
    // A tier whose surface group is switched off keeps the theme's own colour.
    // The page background has no group of its own, so instead it counts as
    // glass only while it is actually translucent: otherwise a tint meant for
    // the panes would repaint the whole page, which is not what "tint the
    // glass" means. Mica, which works by tinting the page, sets a low page
    // opacity and so still qualifies.
    const active = group === null
      ? tierAlpha(effective, tier) < 1
      : effective.surfaces.includes(group)
    for (const [name, baseColor] of Object.entries(baseColors[tier] ?? {})) {
      variables.push([
        name,
        active ? glassSurfaceColor(baseColor, effective, tier) : baseColor
      ])
    }
  }

  return variables
}

/**
 * Maps the platform-neutral backdrop name onto what the current platform
 * calls it. Returns `null` where the platform has no system-drawn backdrop, so
 * callers can leave the window alone rather than guessing.
 *
 * @param {string} backdrop one of GLASS_SYSTEM_BACKDROPS
 * @param {string} platform `process.platform`
 * @returns {{ kind: 'backgroundMaterial' | 'vibrancy', value: string } | null}
 */
export function resolveSystemBackdrop(backdrop, platform) {
  if (backdrop === 'none' || !GLASS_SYSTEM_BACKDROPS.includes(backdrop)) return null

  if (platform === 'win32') {
    // Windows calls the Mica Alt backdrop "tabbed"; the rest match by name.
    const material = backdrop === 'micaAlt' ? 'tabbed' : backdrop
    return { kind: 'backgroundMaterial', value: material }
  }

  if (platform === 'darwin') {
    switch (backdrop) {
      case 'acrylic':
        return { kind: 'vibrancy', value: 'hud' }
      case 'mica':
      case 'micaAlt':
        return { kind: 'vibrancy', value: 'under-window' }
      default:
        return { kind: 'vibrancy', value: 'sidebar' }
    }
  }

  return null
}

/**
 * Windows only started drawing the Mica and Acrylic backdrops for arbitrary
 * windows in Windows 11; on Windows 10 the call succeeds and does nothing,
 * which would leave the app transparent over nothing.
 * @param {string} platform `process.platform`
 * @param {string} release `os.release()`
 */
export function supportsSystemBackdrop(platform, release) {
  if (platform === 'darwin') return true
  if (platform !== 'win32') return false
  const build = Number.parseInt(String(release).split('.')[2], 10)
  return Number.isFinite(build) && build >= 22000
}

/**
 * @param {Record<string, unknown>} theme normalized glass theme
 */
export function isLiquidGlassActive(theme) {
  return theme.enabled === true && theme.texture === 'liquid' && theme.liquidScale > 0
}

/**
 * @param {string} key
 * @returns {GlassKnob | undefined}
 */
export function getGlassKnob(key) {
  return GLASS_KNOBS_BY_KEY.get(key)
}
