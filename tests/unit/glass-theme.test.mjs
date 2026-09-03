import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  adjustLuminance,
  applyGlassTexturePreset,
  cloneDefaultGlassTheme,
  DEFAULT_GLASS_THEME,
  GLASS_KNOBS,
  GLASS_TEXTURE_PRESETS,
  glassBackdropFilter,
  glassCssVariables,
  glassNoiseImage,
  glassSurfaceColor,
  isDefaultGlassTheme,
  isLiquidGlassActive,
  normalizeGlassTheme,
  parseCssColor,
  resolveSystemBackdrop,
  supportsSystemBackdrop,
} from '../../src/glassTheme.js'
import { bezelSlope, createLensMapData } from '../../src/renderer/helpers/liquidGlass.js'

/**
 * @param {string} color
 * @returns {number} the alpha component, or 1 for an opaque colour
 */
function alphaOf(color) {
  return parseCssColor(color).a
}

test('an absent or corrupt glass theme falls back knob by knob', () => {
  assert.deepEqual(normalizeGlassTheme(undefined), DEFAULT_GLASS_THEME)
  assert.deepEqual(normalizeGlassTheme('not an object'), DEFAULT_GLASS_THEME)

  const repaired = normalizeGlassTheme({
    enabled: true,
    opacity: 'seventy',
    texture: 'holographic',
    tintColor: 'rebeccapurple',
    surfaces: ['cards', 'nonsense']
  })

  assert.equal(repaired.enabled, true, 'valid values survive alongside invalid ones')
  assert.equal(repaired.opacity, DEFAULT_GLASS_THEME.opacity)
  assert.equal(repaired.texture, DEFAULT_GLASS_THEME.texture)
  assert.equal(repaired.tintColor, DEFAULT_GLASS_THEME.tintColor)
  assert.deepEqual(repaired.surfaces, ['cards'])
})

test('numeric knobs are clamped and snapped to their slider step', () => {
  const theme = normalizeGlassTheme({ opacity: 9000, luminance: -400, borderWidth: 1.3, saturation: 183 })

  assert.equal(theme.opacity, 100)
  assert.equal(theme.luminance, -100)
  assert.equal(theme.borderWidth, 1.5, 'rounded to the 0.5 step')
  assert.equal(theme.saturation, 185, 'rounded to the 5 step')
})

test('surface selections are stored in a canonical order', () => {
  const shuffled = normalizeGlassTheme({ surfaces: ['menus', 'chrome', 'cards'] })
  const ordered = normalizeGlassTheme({ surfaces: ['chrome', 'cards', 'menus'] })

  assert.deepEqual(shuffled.surfaces, ordered.surfaces)
})

test('every knob has a default that survives normalization unchanged', () => {
  assert.ok(isDefaultGlassTheme(cloneDefaultGlassTheme()))
  for (const { key } of GLASS_KNOBS) {
    assert.notEqual(DEFAULT_GLASS_THEME[key], undefined, `${key} has no default`)
  }
})

test('picking a texture stamps its preset onto the knobs but keeps them editable', () => {
  const tuned = normalizeGlassTheme({ ...DEFAULT_GLASS_THEME, tintColor: '#ff0000', tintMode: 'custom' })
  const mica = applyGlassTexturePreset(tuned, 'mica')

  assert.equal(mica.texture, 'mica')
  assert.equal(mica.blurRadius, GLASS_TEXTURE_PRESETS.mica.blurRadius)
  assert.equal(mica.baseOpacity, GLASS_TEXTURE_PRESETS.mica.baseOpacity)
  assert.equal(mica.tintColor, '#ff0000', 'a preset never overwrites the chosen tint')
  assert.equal(mica.tintMode, 'custom')

  const edited = normalizeGlassTheme({ ...mica, blurRadius: 12 })
  assert.equal(edited.blurRadius, 12)
  assert.equal(edited.texture, 'mica', 'editing a preset value does not leave the texture')
})

test('an unknown texture leaves the theme alone', () => {
  const theme = cloneDefaultGlassTheme()
  assert.deepEqual(applyGlassTexturePreset(theme, 'holographic'), normalizeGlassTheme(theme))
})

test('colours are parsed from every notation the theme system produces', () => {
  assert.deepEqual(parseCssColor('#1f1f1f'), { r: 31, g: 31, b: 31, a: 1 })
  assert.deepEqual(parseCssColor('#80808080'), { r: 128, g: 128, b: 128, a: 128 / 255 })
  assert.deepEqual(parseCssColor('#abc'), { r: 170, g: 187, b: 204, a: 1 })
  assert.deepEqual(parseCssColor('rgb(31, 31, 31)'), { r: 31, g: 31, b: 31, a: 1 })
  assert.deepEqual(parseCssColor('rgb(0 0 0 / 50%)'), { r: 0, g: 0, b: 0, a: 0.5 })
  assert.deepEqual(parseCssColor('rgba(255, 0, 0, 0.25)'), { r: 255, g: 0, b: 0, a: 0.25 })
  assert.deepEqual(parseCssColor('transparent'), { r: 0, g: 0, b: 0, a: 0 })
  assert.equal(parseCssColor('color(display-p3 1 0 0)'), null)
})

test('luminance lifts towards white and sinks towards black', () => {
  const grey = { r: 128, g: 128, b: 128, a: 1 }

  assert.deepEqual(adjustLuminance(grey, 0), grey)
  assert.equal(adjustLuminance(grey, 100).r, 255)
  assert.equal(adjustLuminance(grey, -100).r, 0)
  assert.ok(adjustLuminance(grey, 50).r > 128)
  assert.equal(adjustLuminance(grey, 50).a, 1, 'alpha is left to the tier')
})

test("a surface keeps the theme's own hue unless a tint is asked for", () => {
  const theme = normalizeGlassTheme({ ...DEFAULT_GLASS_THEME, luminance: 0, opacity: 100, cardOpacity: 100 })
  // A Tokyo Night card, to make the point that the palette is what survives.
  const untinted = parseCssColor(glassSurfaceColor('#1a1b26', theme, 'card'))

  assert.deepEqual(
    { r: untinted.r, g: untinted.g, b: untinted.b },
    { r: 26, g: 27, b: 38 },
    'without a tint the colour is untouched'
  )

  const tinted = parseCssColor(glassSurfaceColor(
    '#1a1b26',
    normalizeGlassTheme({ ...theme, tintMode: 'custom', tintColor: '#ff0000', tintStrength: 50 }),
    'card'
  ))
  assert.ok(tinted.r > untinted.r, 'a custom tint pulls the surface towards it')
  assert.ok(tinted.b < untinted.b)
})

test('the master opacity scales every tier without inverting their order', () => {
  const theme = normalizeGlassTheme({ ...DEFAULT_GLASS_THEME, opacity: 50 })
  const chrome = alphaOf(glassSurfaceColor('#1f1f1f', theme, 'chrome'))
  const card = alphaOf(glassSurfaceColor('#1f1f1f', theme, 'card'))
  const menu = alphaOf(glassSurfaceColor('#1f1f1f', theme, 'menu'))

  assert.ok(chrome < card && card < menu, 'popovers stay the most opaque layer')
  assert.equal(card, 0.5 * (DEFAULT_GLASS_THEME.cardOpacity / 100))
})

test('a surface the theme already made translucent never becomes more opaque', () => {
  const theme = normalizeGlassTheme({ ...DEFAULT_GLASS_THEME, opacity: 100, inputOpacity: 100 })
  assert.equal(alphaOf(glassSurfaceColor('rgb(0 0 0 / 50%)', theme, 'input')), 0.5)
})

test('an unparseable surface colour is passed through rather than dropped', () => {
  assert.equal(glassSurfaceColor('var(--something)', cloneDefaultGlassTheme(), 'card'), 'var(--something)')
})

test('the backdrop filter only lists the parts that do something', () => {
  const theme = normalizeGlassTheme({
    blurRadius: 20, saturation: 100, brightness: 100, contrast: 100
  })
  assert.equal(glassBackdropFilter(theme), 'blur(20px)')

  assert.equal(glassBackdropFilter(normalizeGlassTheme({
    blurRadius: 0, saturation: 100, brightness: 100, contrast: 100
  })), 'none')

  assert.match(glassBackdropFilter(cloneDefaultGlassTheme()), /^blur\(30px\) saturate\(180%\)/)
})

test('grain is omitted entirely at zero opacity', () => {
  assert.equal(glassNoiseImage(normalizeGlassTheme({ noiseOpacity: 0 })), 'none')
  assert.match(glassNoiseImage(normalizeGlassTheme({ noiseOpacity: 8 })), /^url\("data:image\/svg\+xml/)
})

test('CSS variables rewrite the tokens of the surface groups that are switched on', () => {
  const theme = normalizeGlassTheme({ ...DEFAULT_GLASS_THEME, enabled: true, surfaces: ['cards'] })
  const variables = new Map(glassCssVariables(theme, {
    base: { '--bg-color': '#0f0f0f' },
    chrome: { '--side-nav-color': '#121212' },
    card: { '--card-bg-color': '#1f1f1f' },
  }))

  assert.ok(alphaOf(variables.get('--card-bg-color')) < 1, 'the enabled group turns translucent')
  assert.equal(variables.get('--side-nav-color'), '#121212', 'a disabled group keeps the theme colour')
  assert.ok(variables.has('--glass-backdrop-filter'))
  assert.ok(variables.has('--glass-border-color'))
})

test('the page background is not tied to a surface group', () => {
  const theme = normalizeGlassTheme({
    ...DEFAULT_GLASS_THEME, enabled: true, surfaces: [], baseOpacity: 40
  })
  const variables = new Map(glassCssVariables(theme, { base: { '--bg-color': '#0f0f0f' } }))

  assert.ok(
    alphaOf(variables.get('--bg-color')) < 1,
    'Mica needs the page itself to be translucent even with no surface groups on'
  )
})

test('the page background answers to its own knob, not the master strength', () => {
  // Turning the panes down must not quietly make the whole window see-through:
  // over no system backdrop that is a hole rather than an effect.
  const theme = normalizeGlassTheme({
    ...DEFAULT_GLASS_THEME, enabled: true, opacity: 40, baseOpacity: 100
  })
  const variables = new Map(glassCssVariables(theme, {
    base: { '--bg-color': '#0f0f0f' },
    card: { '--card-bg-color': '#1f1f1f' },
  }))

  assert.equal(variables.get('--bg-color'), '#0f0f0f')
  assert.ok(alphaOf(variables.get('--card-bg-color')) < 0.5, 'the panes still follow the master')
})

test('an opaque page background is left alone by the tint', () => {
  // "Tint the glass" must not repaint a page that is not glass, which is what
  // an opaque page background is.
  const theme = normalizeGlassTheme({
    ...DEFAULT_GLASS_THEME,
    enabled: true,
    opacity: 100,
    baseOpacity: 100,
    tintMode: 'custom',
    tintColor: '#7aa2f7',
    tintStrength: 60,
    luminance: 20
  })
  const variables = new Map(glassCssVariables(theme, { base: { '--bg-color': '#0f0f0f' } }))

  assert.equal(variables.get('--bg-color'), '#0f0f0f')

  const translucent = new Map(glassCssVariables(
    normalizeGlassTheme({ ...theme, baseOpacity: 40 }),
    { base: { '--bg-color': '#0f0f0f' } }
  ))
  assert.notEqual(translucent.get('--bg-color'), '#0f0f0f', 'a translucent page is glass again')
})

test('reduced transparency wins over the effect when the user asked it to', () => {
  const theme = normalizeGlassTheme({ ...DEFAULT_GLASS_THEME, enabled: true, surfaces: ['cards'] })
  const variables = new Map(glassCssVariables(
    theme,
    { card: { '--card-bg-color': '#1f1f1f' } },
    { prefersReducedTransparency: true }
  ))

  assert.equal(variables.get('--glass-backdrop-filter'), 'none')
  assert.equal(alphaOf(variables.get('--card-bg-color')), 1, 'surfaces go fully opaque')

  const ignored = new Map(glassCssVariables(
    normalizeGlassTheme({ ...theme, respectReducedTransparency: false }),
    { card: { '--card-bg-color': '#1f1f1f' } },
    { prefersReducedTransparency: true }
  ))
  assert.ok(alphaOf(ignored.get('--card-bg-color')) < 1)
})

test('without backdrop-filter the fallback opacity takes over', () => {
  const theme = normalizeGlassTheme({
    ...DEFAULT_GLASS_THEME, enabled: true, surfaces: ['cards'], fallbackOpacity: 96
  })
  const variables = new Map(glassCssVariables(
    theme,
    { card: { '--card-bg-color': '#1f1f1f' } },
    { supportsBackdropFilter: false }
  ))

  assert.equal(variables.get('--glass-backdrop-filter'), 'none')
  assert.equal(alphaOf(variables.get('--card-bg-color')), 0.96 * (theme.cardOpacity / 100))
})

test('the edge tone follows the surface unless it is pinned', () => {
  const base = { ...DEFAULT_GLASS_THEME, enabled: true }
  const onDark = new Map(glassCssVariables(normalizeGlassTheme(base), {}, { isDark: true }))
  const onLight = new Map(glassCssVariables(normalizeGlassTheme(base), {}, { isDark: false }))

  assert.match(onDark.get('--glass-border-color'), /^rgb\(255 255 255/, 'a lit edge on a dark surface')
  assert.match(onLight.get('--glass-border-color'), /^rgb\(0 0 0/)

  const pinned = new Map(glassCssVariables(
    normalizeGlassTheme({ ...base, borderTone: 'light' }), {}, { isDark: false }
  ))
  assert.match(pinned.get('--glass-border-color'), /^rgb\(255 255 255/)
})

test('the drop shadow stays a valid box-shadow entry when it is switched off', () => {
  const variables = new Map(glassCssVariables(
    normalizeGlassTheme({ ...DEFAULT_GLASS_THEME, enabled: true, shadowStrength: 0 }), {}
  ))
  assert.equal(variables.get('--glass-shadow'), '0 0 0 0 rgb(0 0 0 / 0)')
})

test('window backdrops are named per platform', () => {
  assert.deepEqual(
    resolveSystemBackdrop('micaAlt', 'win32'),
    { kind: 'backgroundMaterial', value: 'tabbed' },
    'Windows calls the Mica Alt backdrop "tabbed"'
  )
  assert.deepEqual(resolveSystemBackdrop('acrylic', 'win32'), { kind: 'backgroundMaterial', value: 'acrylic' })
  assert.equal(resolveSystemBackdrop('acrylic', 'darwin').kind, 'vibrancy')
  assert.equal(resolveSystemBackdrop('none', 'win32'), null)
  assert.equal(resolveSystemBackdrop('mica', 'linux'), null)
})

test('the Windows backdrop is gated on Windows 11', () => {
  assert.equal(supportsSystemBackdrop('win32', '10.0.22631'), true)
  assert.equal(supportsSystemBackdrop('win32', '10.0.19045'), false, 'Windows 10 draws no backdrop')
  assert.equal(supportsSystemBackdrop('linux', '6.18.0'), false)
  assert.equal(supportsSystemBackdrop('darwin', '24.0.0'), true)
})

test('Liquid Glass is only active for the texture that uses it', () => {
  const liquid = normalizeGlassTheme({ enabled: true, texture: 'liquid' })
  assert.equal(isLiquidGlassActive(liquid), true)
  assert.equal(isLiquidGlassActive({ ...liquid, enabled: false }), false)
  assert.equal(isLiquidGlassActive({ ...liquid, texture: 'acrylic' }), false)
  assert.equal(isLiquidGlassActive({ ...liquid, liquidScale: 0 }), false, 'no displacement is no lens')
})

test('the lens profile bends hardest at the rim and flattens inside the bezel', () => {
  assert.equal(bezelSlope(0), 1)
  assert.equal(bezelSlope(1), 0)
  assert.ok(bezelSlope(0.25) > bezelSlope(0.75), 'the falloff is monotonic')
  assert.ok(bezelSlope(0.5) <= 1 && bezelSlope(0.5) >= 0)
})

test('the lens map is neutral away from the edge and opposed across it', () => {
  const { width, height, data } = createLensMapData({ width: 64, height: 64, radius: 8, bezel: 10 })
  const at = (x, y) => {
    const index = (y * width + x) * 4
    return { r: data[index], g: data[index + 1], b: data[index + 2], a: data[index + 3] }
  }

  assert.equal(width, 64)
  assert.equal(height, 64)

  const centre = at(32, 32)
  assert.deepEqual(
    [centre.r, centre.g, centre.b, centre.a],
    [128, 128, 128, 255],
    'the flat middle of the pane displaces nothing'
  )

  // The horizontal component points outwards, so the two vertical edges have to
  // push in opposite directions or the backdrop would slide instead of bending.
  const left = at(1, 32)
  const right = at(width - 2, 32)
  assert.ok(left.r < 128, 'the left edge samples further left')
  assert.ok(right.r > 128, 'the right edge samples further right')
  assert.equal(left.g, 128, 'a vertical edge carries no vertical displacement')

  const top = at(32, 1)
  const bottom = at(32, height - 2)
  assert.ok(top.g < 128)
  assert.ok(bottom.g > 128)
  assert.equal(top.r, 128)
})

test('the lens map survives a bezel wider than the element', () => {
  const { data } = createLensMapData({ width: 8, height: 8, radius: 40, bezel: 400 })
  assert.equal(data.length, 8 * 8 * 4)
  assert.ok([...data].every(value => value >= 0 && value <= 255))
})
