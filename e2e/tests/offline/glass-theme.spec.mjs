import { test, expect, goTo, goToSettingsSection } from '../../helpers/app.mjs'

/**
 * @param {import('@playwright/test').Page} page
 * @param {object} glassTheme knob overrides merged onto the stored theme
 */
async function setGlassTheme (page, glassTheme) {
  await page.evaluate(async (overrides) => {
    const store = document.querySelector('#app').__vue_app__.config.globalProperties.$store
    await store.dispatch('updateGlassTheme', { ...store.getters.getGlassTheme, ...overrides })
  }, glassTheme)
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} property
 * @param {string} [selector] defaults to the body, where the tokens are written
 */
function customProperty (page, property, selector = 'body') {
  return page.evaluate(([name, target]) => (
    getComputedStyle(document.querySelector(target)).getPropertyValue(name).trim()
  ), [property, selector])
}

/**
 * Splits a colour into its channels and its alpha, so a theme's own hex token
 * and the `rgb()` the glass layer derives from it can be compared directly.
 * @param {string} color
 * @returns {{ rgb: string, alpha: number } | null}
 */
function splitColor (color) {
  const hex = color.match(/^#([\da-f]{6})([\da-f]{2})?$/i)
  if (hex !== null) {
    return {
      rgb: hex[1].match(/[\da-f]{2}/gi).map(part => Number.parseInt(part, 16)).join(' '),
      alpha: hex[2] === undefined ? 1 : Number.parseInt(hex[2], 16) / 255
    }
  }

  const match = color.match(/^rgba?\(([^)]+)\)$/)
  if (match === null) return null
  const parts = match[1].split(/[\s,/]+/).filter(part => part !== '')
  return {
    rgb: parts.slice(0, 3).join(' '),
    alpha: parts.length > 3 ? Number.parseFloat(parts[3]) : 1
  }
}

test.describe('translucency', () => {
  test('the settings toggle turns the app to glass and back', async ({ app }) => {
    const { page } = app
    const content = await goToSettingsSection(page, 'theme')
    const toggle = content.locator('label.switch-label').filter({ hasText: 'Enable translucency' })
    const opacitySlider = content.locator('.pure-material-slider').filter({ hasText: 'Luminous opacity' })

    await expect(page.locator('body')).not.toHaveClass(/glassEnabled/)
    await toggle.click()
    await expect(page.locator('body')).toHaveClass(/glassEnabled/)

    // The knobs only appear once the effect is on, which is what keeps the
    // section readable while it is switched off.
    await expect(opacitySlider).toBeVisible()

    await toggle.click()
    await expect(page.locator('body')).not.toHaveClass(/glassEnabled/)
    await expect(opacitySlider).toHaveCount(0)
  })

  test("a translucent surface keeps the active theme's own colour", async ({ app }) => {
    const { page } = app
    await goTo(page, 'settings')

    await page.evaluate(() => {
      const store = document.querySelector('#app').__vue_app__.config.globalProperties.$store
      return store.dispatch('updateBaseTheme', 'dracula')
    })
    const opaque = await customProperty(page, '--card-bg-color')

    await setGlassTheme(page, {
      enabled: true,
      texture: 'acrylic',
      surfaces: ['chrome', 'cards', 'menus'],
      // The tint and the luminance lift are what would otherwise move the hue,
      // so they are the two knobs this assertion has to pin.
      tintMode: 'theme',
      luminance: 0,
      opacity: 60
    })

    const glass = splitColor(await customProperty(page, '--card-bg-color'))
    expect(glass).not.toBeNull()
    expect(glass.alpha).toBeLessThan(1)
    expect(glass.rgb).toBe(splitColor(opaque).rgb)
  })

  test('surface groups switch their own tokens on and off', async ({ app }) => {
    const { page } = app
    await goTo(page, 'settings')

    await setGlassTheme(page, { enabled: true, surfaces: ['cards'] })
    expect(splitColor(await customProperty(page, '--card-bg-color')).alpha).toBeLessThan(1)
    // The window chrome is off, so its token must still be the theme's own.
    expect(splitColor(await customProperty(page, '--side-nav-color'))?.alpha ?? 1).toBe(1)

    await setGlassTheme(page, { surfaces: ['cards', 'chrome'] })
    expect(splitColor(await customProperty(page, '--side-nav-color')).alpha).toBeLessThan(1)
  })

  test('glass surfaces carry the backdrop filter', async ({ app }) => {
    const { page } = app
    await goTo(page, 'settings')
    await setGlassTheme(page, {
      enabled: true, texture: 'acrylic', surfaces: ['chrome', 'cards'], blurRadius: 24
    })

    const topNavFilter = await page.locator('.topNav').evaluate(
      element => getComputedStyle(element).backdropFilter
    )
    expect(topNavFilter).toContain('blur(24px)')
    expect(topNavFilter).toContain('saturate')

    // Cards reach the filter through the token the theme system already used
    // for custom-theme blurs, rather than through a rule of their own.
    expect(await customProperty(page, '--card-bg-blur', '.sectionBody')).toContain('blur(24px)')
  })

  test('Liquid Glass builds a refraction filter and removes it again', async ({ app }) => {
    const { page } = app
    await goTo(page, 'settings')
    await setGlassTheme(page, {
      enabled: true,
      texture: 'liquid',
      surfaces: ['chrome', 'cards'],
      liquidBezel: 12,
      liquidScale: 9,
      liquidChromatic: 3
    })

    await expect.poll(() => page.locator('#otxLiquidGlassFilters filter').count())
      .toBeGreaterThan(0)
    await expect.poll(async () => (
      await customProperty(page, '--glass-backdrop-filter', '.sideNav')
    )).toMatch(/^url\("?#otxLiquidGlass/)

    const graph = await page.evaluate(() => {
      const reference = getComputedStyle(document.querySelector('.sideNav'))
        .getPropertyValue('--glass-backdrop-filter')
      const filter = document.querySelector(reference.match(/#(otxLiquidGlass\d+)/)[0])
      return {
        displacements: [...filter.querySelectorAll('feDisplacementMap')]
          .map(node => Number.parseFloat(node.getAttribute('scale'))),
        channels: filter.querySelectorAll('feColorMatrix').length,
        blends: filter.querySelectorAll('feBlend').length,
        lensMap: filter.querySelector('feImage')?.getAttribute('href') ?? ''
      }
    })

    // One displacement pass per colour channel, each at a different scale:
    // that difference is the chromatic aberration. The side nav is large
    // enough that neither value is clamped down to fit it.
    expect(graph.displacements).toEqual([9, 12, 15])
    expect(graph.channels).toBe(3)
    expect(graph.blends).toBe(2)
    expect(graph.lensMap.startsWith('data:image/png')).toBe(true)

    // The tab bar is only as tall as one row, so a 12px rim drawn in from both
    // edges would leave it with no flat middle and the whole strip would shift
    // instead of bending at its edge.
    const tabBarDisplacements = await page.evaluate(() => {
      const reference = getComputedStyle(document.querySelector('.tabBar'))
        .getPropertyValue('--glass-backdrop-filter')
      const filter = document.querySelector(reference.match(/#(otxLiquidGlass\d+)/)[0])
      return [...filter.querySelectorAll('feDisplacementMap')]
        .map(node => Number.parseFloat(node.getAttribute('scale')))
    })
    expect(tabBarDisplacements[0]).toBeLessThan(9)
    expect(tabBarDisplacements[0]).toBeGreaterThan(0)

    // Cards are reached by an enumerated rule rather than by the inherited
    // blur token, which is what lets each one resolve its own lens.
    await expect.poll(async () => (
      await page.locator('.sectionBody').first().evaluate(
        element => getComputedStyle(element).backdropFilter
      )
    )).toMatch(/^url\("?#otxLiquidGlass/)

    // Switching the texture away has to take the whole engine with it, not
    // just stop adding to it.
    await setGlassTheme(page, { texture: 'acrylic' })
    await expect(page.locator('#otxLiquidGlassFilters')).toHaveCount(0)
    expect(await customProperty(page, '--glass-backdrop-filter', '.topNav')).not.toContain('url(')
  })

  test('turning translucency off restores the theme tokens', async ({ app }) => {
    const { page } = app
    await goTo(page, 'settings')

    const opaque = await customProperty(page, '--card-bg-color')
    await setGlassTheme(page, { enabled: true, surfaces: ['cards'] })
    expect(await customProperty(page, '--card-bg-color')).not.toBe(opaque)

    await setGlassTheme(page, { enabled: false })
    await expect(page.locator('body')).not.toHaveClass(/glassEnabled/)
    expect(await customProperty(page, '--card-bg-color')).toBe(opaque)
    expect(await page.locator('body').getAttribute('data-glass-texture')).toBeNull()
  })

  test('the glass layer hands its surface tokens back to their owner', async ({ page }) => {
    // The glass layer writes the surface tokens to the same inline slots the
    // custom theme system uses for a theme's chosen colours. It therefore has
    // to give a slot back rather than clear it, or applying it would delete a
    // custom theme's colour the first time the effect was switched on.
    await goTo(page, 'settings')
    await page.evaluate(() => {
      document.body.style.setProperty('--card-bg-color', '#abcdef')
    })

    await setGlassTheme(page, { enabled: true, surfaces: ['cards'], luminance: 0 })
    const glass = splitColor(await customProperty(page, '--card-bg-color'))
    expect(glass.rgb).toBe('171 205 239', 'the slot is derived from the value it found there')
    expect(glass.alpha).toBeLessThan(1)

    await setGlassTheme(page, { enabled: false })
    expect(await customProperty(page, '--card-bg-color')).toBe('#abcdef')
  })

  test('the settings survive a restart', async ({ app }) => {
    await goTo(app.page, 'settings')
    await setGlassTheme(app.page, {
      enabled: true, texture: 'mica', tintMode: 'custom', tintColor: '#7aa2f7', opacity: 55
    })

    const restarted = await app.relaunch()
    await expect(restarted.page.locator('body')).toHaveClass(/glassEnabled/)
    await expect(restarted.page.locator('body')).toHaveAttribute('data-glass-texture', 'mica')
  })
})
