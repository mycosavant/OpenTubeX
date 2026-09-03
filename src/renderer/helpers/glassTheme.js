import {
  GLASS_SURFACE_GROUPS,
  glassCssVariables,
  isLiquidGlassActive,
  normalizeGlassTheme,
} from '../../glassTheme'
import { setLiquidGlassConfig } from './liquidGlass'

/**
 * The theme tokens each surface tier is derived from. The glass layer rewrites
 * these same properties, which is what lets every existing component pick the
 * effect up without being touched: a card already paints with
 * `--card-bg-color`, so tinting that token tints the card.
 *
 * A tier reads its source colour from whatever the active theme resolved the
 * token to, so built-in palettes and custom themes both keep their identity.
 */
const GLASS_TIER_TOKENS = Object.freeze({
  base: Object.freeze(['--bg-color']),
  chrome: Object.freeze(['--side-nav-color', '--top-nav-bg-color']),
  card: Object.freeze(['--card-bg-color', '--secondary-card-bg-color']),
  menu: Object.freeze(['--search-bar-color', '--settings-search-bar-color', '--instance-menu-color']),
  input: Object.freeze(['--primary-input-color']),
})

/**
 * What each property held inline before the glass layer overwrote it, keyed by
 * property name.
 *
 * The surface tokens are shared with the custom theme system, which writes the
 * chosen colours to the same inline slots on the body. Blindly clearing them
 * would delete a custom theme's colours, so a slot is only given back if it
 * still holds what the glass layer put there.
 *
 * @type {Map<string, { written: string, original: string }>}
 */
const glassWrites = new Map()

let reducedTransparencyQuery = null

function prefersReducedTransparency() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  reducedTransparencyQuery ??= window.matchMedia('(prefers-reduced-transparency: reduce)')
  return reducedTransparencyQuery.matches
}

/**
 * Chromium has supported `backdrop-filter` unprefixed for years, but the web
 * build can run anywhere, and a surface that is translucent over nothing is
 * just a washed-out colour. Checking lets the fallback opacity take over.
 */
function supportsBackdropFilter() {
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return true
  return CSS.supports('backdrop-filter', 'blur(1px)')
}

/**
 * Hands back every slot the glass layer is still holding, so the next read sees
 * the theme's own values rather than the previous glass derivation. A slot
 * whose value has since changed belongs to whoever wrote it and is left alone.
 * @param {HTMLElement} element
 */
function clearGlassProperties(element) {
  for (const [property, { written, original }] of glassWrites) {
    if (element.style.getPropertyValue(property) !== written) continue
    if (original === '') element.style.removeProperty(property)
    else element.style.setProperty(property, original)
  }
  glassWrites.clear()
}

/**
 * @param {HTMLElement} element
 * @param {string} property
 * @param {string} value
 */
function writeGlassProperty(element, property, value) {
  const original = glassWrites.get(property)?.original ?? element.style.getPropertyValue(property)
  element.style.setProperty(property, value)
  glassWrites.set(property, { written: element.style.getPropertyValue(property), original })
}

/**
 * @param {CSSStyleDeclaration} computed
 * @returns {Record<string, Record<string, string>>}
 */
function readBaseColors(computed) {
  /** @type {Record<string, Record<string, string>>} */
  const baseColors = {}
  for (const [tier, tokens] of Object.entries(GLASS_TIER_TOKENS)) {
    /** @type {Record<string, string>} */
    const tierColors = {}
    for (const token of tokens) {
      const value = computed.getPropertyValue(token).trim()
      if (value !== '') tierColors[token] = value
    }
    baseColors[tier] = tierColors
  }
  return baseColors
}

/**
 * Applies the translucency theme to the document.
 *
 * Must run *after* the base theme has been applied: the glass colours are
 * derived from whatever that theme resolved its surface tokens to, so the
 * effect layers on top of the palette instead of replacing it.
 *
 * @param {unknown} glassTheme the stored (possibly stale) glass settings
 * @param {{ isDark?: boolean }} [options]
 */
export function applyGlassThemeToDocument(glassTheme, options = {}) {
  const body = document.body
  const theme = normalizeGlassTheme(glassTheme)

  // Read the theme's own colours with no glass overrides in the way.
  clearGlassProperties(body)

  if (!theme.enabled) {
    body.classList.remove('glassEnabled')
    for (const group of GLASS_SURFACE_GROUPS) delete body.dataset[`glass${capitalize(group)}`]
    delete body.dataset.glassTexture
    delete body.dataset.glassTransparentWindow
    setLiquidGlassConfig({ enabled: false })
    return
  }

  const environment = {
    supportsBackdropFilter: supportsBackdropFilter(),
    prefersReducedTransparency: prefersReducedTransparency(),
    isDark: options.isDark ?? body.dataset.customTheme !== 'light'
  }

  const baseColors = readBaseColors(window.getComputedStyle(body))
  for (const [property, value] of glassCssVariables(theme, baseColors, environment)) {
    writeGlassProperty(body, property, value)
  }

  body.classList.add('glassEnabled')
  body.dataset.glassTexture = theme.texture
  for (const group of GLASS_SURFACE_GROUPS) {
    const attribute = `glass${capitalize(group)}`
    if (theme.surfaces.includes(group)) body.dataset[attribute] = ''
    else delete body.dataset[attribute]
  }

  // Only meaningful when the window itself is drawn by the system compositor;
  // the CSS uses it to stop painting an opaque page background.
  if (theme.transparentWindowBackground) body.dataset.glassTransparentWindow = ''
  else delete body.dataset.glassTransparentWindow

  setLiquidGlassConfig({
    enabled: isLiquidGlassActive(theme) && !environment.prefersReducedTransparency,
    scale: theme.liquidScale,
    bezel: theme.liquidBezel,
    radius: theme.liquidRadius,
    chromatic: theme.liquidChromatic,
    blur: theme.liquidBlur,
    quality: theme.liquidQuality,
    maxElements: theme.liquidMaxElements,
    surfaces: theme.surfaces,
  })
}

/**
 * @param {string} value
 */
function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/**
 * @param {() => void} handler called when the reduced-transparency preference changes
 * @returns {() => void} removes the listener
 */
export function handleReducedTransparencyChange(handler) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  reducedTransparencyQuery ??= window.matchMedia('(prefers-reduced-transparency: reduce)')
  reducedTransparencyQuery.addEventListener('change', handler)
  return () => reducedTransparencyQuery.removeEventListener('change', handler)
}

export { GLASS_TIER_TOKENS }
