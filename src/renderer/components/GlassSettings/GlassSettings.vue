<template>
  <FtSettingsSection :title="t('Settings.Glass Settings.Translucency')">
    <p class="glassIntro">
      {{ t('Settings.Glass Settings.Description') }}
    </p>

    <FtFlexBox>
      <FtToggleSwitch
        :label="t('Settings.Glass Settings.Enable Translucency')"
        compact
        setting-key="glassTheme"
        :default-value="draft.enabled"
        :tooltip="t('Tooltips.Glass Settings.Enable Translucency')"
        @change="commit('enabled', $event)"
      />
    </FtFlexBox>

    <template v-if="draft.enabled">
      <FtFlexBox class="glassRow">
        <FtSelect
          :placeholder="t('Settings.Glass Settings.Texture.Texture')"
          :value="draft.texture"
          :select-names="textureNames"
          :select-values="GLASS_TEXTURES"
          :icon="['fas', 'layer-group']"
          :tooltip="t('Tooltips.Glass Settings.Texture')"
          @change="changeTexture"
        />
      </FtFlexBox>

      <h4 class="glassGroupTitle">
        {{ t('Settings.Glass Settings.Surfaces.Surfaces') }}
      </h4>
      <div class="switchGrid">
        <FtToggleSwitch
          v-for="group in GLASS_SURFACE_GROUPS"
          :key="group"
          :label="surfaceNames[group]"
          compact
          :default-value="draft.surfaces.includes(group)"
          @change="toggleSurface(group, $event)"
        />
      </div>

      <h4 class="glassGroupTitle">
        {{ t('Settings.Glass Settings.Groups.opacity') }}
      </h4>
      <FtFlexBox class="glassRow">
        <FtSlider
          v-for="key in OPACITY_KNOBS"
          :key="key"
          :label="knobNames[key]"
          :default-value="draft[key]"
          :min-value="knob(key).min"
          :max-value="knob(key).max"
          :step="knob(key).step"
          value-extension="%"
          @input="preview(key, $event)"
          @change="commit(key, $event)"
        />
      </FtFlexBox>

      <h4 class="glassGroupTitle">
        {{ t('Settings.Glass Settings.Groups.backdrop') }}
      </h4>
      <FtFlexBox class="glassRow">
        <FtSlider
          :label="knobNames.blurRadius"
          :default-value="draft.blurRadius"
          :min-value="knob('blurRadius').min"
          :max-value="knob('blurRadius').max"
          :step="knob('blurRadius').step"
          value-extension="px"
          @input="preview('blurRadius', $event)"
          @change="commit('blurRadius', $event)"
        />
        <FtSlider
          v-for="key in ['saturation', 'brightness', 'contrast']"
          :key="key"
          :label="knobNames[key]"
          :default-value="draft[key]"
          :min-value="knob(key).min"
          :max-value="knob(key).max"
          :step="knob(key).step"
          value-extension="%"
          @input="preview(key, $event)"
          @change="commit(key, $event)"
        />
      </FtFlexBox>

      <h4 class="glassGroupTitle">
        {{ t('Settings.Glass Settings.Groups.tint') }}
      </h4>
      <FtFlexBox class="glassRow">
        <FtSelect
          :placeholder="t('Settings.Glass Settings.Tint Mode.Tint Mode')"
          :value="draft.tintMode"
          :select-names="tintModeNames"
          :select-values="GLASS_TINT_MODES"
          :icon="['fas', 'palette']"
          :tooltip="t('Tooltips.Glass Settings.Tint Mode')"
          @change="commit('tintMode', $event)"
        />
        <FtSlider
          :label="knobNames.tintStrength"
          :disabled="draft.tintMode !== 'custom'"
          :default-value="draft.tintStrength"
          :min-value="knob('tintStrength').min"
          :max-value="knob('tintStrength').max"
          :step="knob('tintStrength').step"
          value-extension="%"
          @input="preview('tintStrength', $event)"
          @change="commit('tintStrength', $event)"
        />
      </FtFlexBox>
      <FtFlexBox
        v-if="draft.tintMode === 'custom'"
        class="glassRow"
      >
        <FtColorPicker
          :model-value="draft.tintColor"
          :label="knobNames.tintColor"
          :allow-alpha="false"
          @update:model-value="preview('tintColor', $event)"
          @change="commit('tintColor', draft.tintColor)"
        />
      </FtFlexBox>

      <h4 class="glassGroupTitle">
        {{ t('Settings.Glass Settings.Groups.texture') }}
      </h4>
      <FtFlexBox class="glassRow">
        <FtSlider
          v-for="key in ['noiseOpacity', 'noiseScale']"
          :key="key"
          :label="knobNames[key]"
          :default-value="draft[key]"
          :min-value="knob(key).min"
          :max-value="knob(key).max"
          :step="knob(key).step"
          value-extension="%"
          @input="preview(key, $event)"
          @change="commit(key, $event)"
        />
      </FtFlexBox>

      <h4 class="glassGroupTitle">
        {{ t('Settings.Glass Settings.Groups.edge') }}
      </h4>
      <FtFlexBox class="glassRow">
        <FtSelect
          :placeholder="t('Settings.Glass Settings.Border Tone.Border Tone')"
          :value="draft.borderTone"
          :select-names="borderToneNames"
          :select-values="GLASS_BORDER_TONES"
          :icon="['fas', 'border-all']"
          @change="commit('borderTone', $event)"
        />
        <FtSlider
          :label="knobNames.borderWidth"
          :default-value="draft.borderWidth"
          :min-value="knob('borderWidth').min"
          :max-value="knob('borderWidth').max"
          :step="knob('borderWidth').step"
          value-extension="px"
          @input="preview('borderWidth', $event)"
          @change="commit('borderWidth', $event)"
        />
        <FtSlider
          v-for="key in ['borderOpacity', 'highlightOpacity', 'innerShadowOpacity', 'shadowStrength']"
          :key="key"
          :label="knobNames[key]"
          :default-value="draft[key]"
          :min-value="knob(key).min"
          :max-value="knob(key).max"
          :step="knob(key).step"
          value-extension="%"
          @input="preview(key, $event)"
          @change="commit(key, $event)"
        />
      </FtFlexBox>

      <template v-if="draft.texture === 'liquid'">
        <h4 class="glassGroupTitle">
          {{ t('Settings.Glass Settings.Groups.liquid') }}
        </h4>
        <p class="glassNote">
          {{ t('Settings.Glass Settings.Liquid Warning') }}
        </p>
        <FtFlexBox class="glassRow">
          <FtSelect
            :placeholder="t('Settings.Glass Settings.Liquid Quality.Liquid Quality')"
            :value="draft.liquidQuality"
            :select-names="liquidQualityNames"
            :select-values="GLASS_LIQUID_QUALITIES"
            :icon="['fas', 'gauge']"
            :tooltip="t('Tooltips.Glass Settings.Liquid Quality')"
            @change="commit('liquidQuality', $event)"
          />
          <FtSlider
            v-for="key in LIQUID_KNOBS"
            :key="key"
            :label="knobNames[key]"
            :default-value="draft[key]"
            :min-value="knob(key).min"
            :max-value="knob(key).max"
            :step="knob(key).step"
            :value-extension="LIQUID_KNOB_UNITS[key] ?? ''"
            @input="preview(key, $event)"
            @change="commit(key, $event)"
          />
        </FtFlexBox>
      </template>

      <h4 class="glassGroupTitle">
        {{ t('Settings.Glass Settings.Groups.system') }}
      </h4>
      <p
        v-if="!systemBackdropSupported"
        class="glassNote"
      >
        {{ t('Settings.Glass Settings.System Backdrop Unavailable') }}
      </p>
      <FtFlexBox class="glassRow">
        <FtSelect
          :placeholder="t('Settings.Glass Settings.System Backdrop.System Backdrop')"
          :value="draft.systemBackdrop"
          :disabled="!systemBackdropSupported"
          :select-names="systemBackdropNames"
          :select-values="GLASS_SYSTEM_BACKDROPS"
          :icon="['fas', 'display']"
          :tooltip="t('Tooltips.Glass Settings.System Backdrop')"
          @change="commit('systemBackdrop', $event)"
        />
      </FtFlexBox>
      <div class="switchGrid">
        <FtToggleSwitch
          :label="knobNames.transparentWindowBackground"
          compact
          :disabled="!systemBackdropSupported"
          :default-value="draft.transparentWindowBackground"
          :tooltip="t('Tooltips.Glass Settings.Transparent Window Background')"
          @change="commit('transparentWindowBackground', $event)"
        />
        <FtToggleSwitch
          :label="knobNames.respectReducedTransparency"
          compact
          :default-value="draft.respectReducedTransparency"
          :tooltip="t('Tooltips.Glass Settings.Respect Reduced Transparency')"
          @change="commit('respectReducedTransparency', $event)"
        />
      </div>
      <FtFlexBox class="glassRow">
        <FtSlider
          :label="knobNames.fallbackOpacity"
          :default-value="draft.fallbackOpacity"
          :min-value="knob('fallbackOpacity').min"
          :max-value="knob('fallbackOpacity').max"
          :step="knob('fallbackOpacity').step"
          value-extension="%"
          @input="preview('fallbackOpacity', $event)"
          @change="commit('fallbackOpacity', $event)"
        />
      </FtFlexBox>

      <FtFlexBox class="glassRow">
        <FtButton
          :label="t('Settings.Glass Settings.Reset')"
          :disabled="isDefault"
          @click="resetToDefaults"
        />
      </FtFlexBox>
    </template>
  </FtSettingsSection>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import FtSettingsSection from '../FtSettingsSection/FtSettingsSection.vue'
import FtFlexBox from '../ft-flex-box/ft-flex-box.vue'
import FtToggleSwitch from '../FtToggleSwitch/FtToggleSwitch.vue'
import FtSelect from '../FtSelect/FtSelect.vue'
import FtSlider from '../FtSlider/FtSlider.vue'
import FtButton from '../FtButton/FtButton.vue'
import FtColorPicker from '../FtColorPicker/FtColorPicker.vue'

import store from '../../store/index'
import { applyGlassThemeToDocument } from '../../helpers/glassTheme'
import {
  applyGlassTexturePreset,
  cloneDefaultGlassTheme,
  getGlassKnob,
  GLASS_BORDER_TONES,
  GLASS_LIQUID_QUALITIES,
  GLASS_SURFACE_GROUPS,
  GLASS_SYSTEM_BACKDROPS,
  GLASS_TEXTURES,
  GLASS_TINT_MODES,
  isDefaultGlassTheme,
  normalizeGlassTheme,
} from '../../../glassTheme'

const OPACITY_KNOBS = Object.freeze([
  'opacity', 'baseOpacity', 'chromeOpacity', 'cardOpacity', 'menuOpacity', 'inputOpacity', 'luminance',
])

const LIQUID_KNOBS = Object.freeze([
  'liquidScale', 'liquidBezel', 'liquidRadius', 'liquidChromatic', 'liquidBlur',
  'liquidSpecular', 'liquidMaxElements',
])

const LIQUID_KNOB_UNITS = Object.freeze({
  liquidScale: 'px',
  liquidBezel: 'px',
  liquidRadius: 'px',
  liquidChromatic: 'px',
  liquidBlur: 'px',
  liquidSpecular: '%',
})

const { t } = useI18n()

/** @type {import('vue').ComputedRef<object>} */
const stored = computed(() => store.getters.getGlassTheme)

/**
 * A local copy so a slider can repaint the app while it is being dragged
 * without writing to the database on every frame. Dragging is exactly when the
 * feedback matters, and every knob here is judged by eye.
 */
const draft = ref(normalizeGlassTheme(stored.value))

watch(stored, (value) => { draft.value = normalizeGlassTheme(value) }, { deep: true })

const systemBackdropSupported = ref(false)

onMounted(async () => {
  if (!process.env.IS_ELECTRON) return
  try {
    const support = await window.ftElectron.getWindowBackdropSupport()
    systemBackdropSupported.value = support?.supported === true
  } catch (error) {
    console.error('Failed to read window backdrop support:', error)
  }
})

const isDefault = computed(() => isDefaultGlassTheme(draft.value))

/**
 * @param {string} key
 */
function knob(key) {
  return getGlassKnob(key)
}

/**
 * Repaints with the pending value without persisting it, so dragging a slider
 * is immediately visible.
 * @param {string} key
 * @param {unknown} value
 */
function preview(key, value) {
  draft.value = normalizeGlassTheme({ ...draft.value, [key]: value })
  applyGlassThemeToDocument(draft.value)
}

/**
 * @param {string} key
 * @param {unknown} value
 */
function commit(key, value) {
  const next = normalizeGlassTheme({ ...draft.value, [key]: value })
  draft.value = next
  applyGlassThemeToDocument(next)
  store.dispatch('updateGlassTheme', next)
}

/**
 * @param {string} texture
 */
function changeTexture(texture) {
  const next = applyGlassTexturePreset(draft.value, texture)
  draft.value = next
  applyGlassThemeToDocument(next)
  store.dispatch('updateGlassTheme', next)
}

/**
 * @param {string} group
 * @param {boolean} enabled
 */
function toggleSurface(group, enabled) {
  const surfaces = enabled
    ? [...draft.value.surfaces, group]
    : draft.value.surfaces.filter(entry => entry !== group)
  commit('surfaces', surfaces)
}

function resetToDefaults() {
  const defaults = cloneDefaultGlassTheme()
  // Leaving the section on would silently discard everything the user tuned
  // without showing them the plain theme they are being returned to.
  defaults.enabled = draft.value.enabled
  draft.value = defaults
  applyGlassThemeToDocument(defaults)
  store.dispatch('updateGlassTheme', defaults)
}

const textureNames = computed(() => [
  t('Settings.Glass Settings.Texture.Blur'),
  t('Settings.Glass Settings.Texture.Acrylic'),
  t('Settings.Glass Settings.Texture.Mica'),
  t('Settings.Glass Settings.Texture.Mica Alt'),
  t('Settings.Glass Settings.Texture.Liquid Glass'),
])

const tintModeNames = computed(() => [
  t('Settings.Glass Settings.Tint Mode.Follow Theme'),
  t('Settings.Glass Settings.Tint Mode.Custom Color'),
])

const borderToneNames = computed(() => [
  t('Settings.Glass Settings.Border Tone.Automatic'),
  t('Settings.Glass Settings.Border Tone.Light'),
  t('Settings.Glass Settings.Border Tone.Dark'),
])

const liquidQualityNames = computed(() => [
  t('Settings.Glass Settings.Liquid Quality.Low'),
  t('Settings.Glass Settings.Liquid Quality.Medium'),
  t('Settings.Glass Settings.Liquid Quality.High'),
])

const systemBackdropNames = computed(() => [
  t('Settings.Glass Settings.System Backdrop.None'),
  t('Settings.Glass Settings.System Backdrop.Automatic'),
  t('Settings.Glass Settings.System Backdrop.Mica'),
  t('Settings.Glass Settings.System Backdrop.Mica Alt'),
  t('Settings.Glass Settings.System Backdrop.Acrylic'),
])

const surfaceNames = computed(() => ({
  chrome: t('Settings.Glass Settings.Surfaces.Window Chrome'),
  cards: t('Settings.Glass Settings.Surfaces.Cards'),
  menus: t('Settings.Glass Settings.Surfaces.Menus and Popups'),
  inputs: t('Settings.Glass Settings.Surfaces.Inputs'),
  player: t('Settings.Glass Settings.Surfaces.Player Panels'),
}))

const knobNames = computed(() => ({
  opacity: t('Settings.Glass Settings.Knobs.Luminous Opacity'),
  baseOpacity: t('Settings.Glass Settings.Knobs.Page Opacity'),
  chromeOpacity: t('Settings.Glass Settings.Knobs.Chrome Opacity'),
  cardOpacity: t('Settings.Glass Settings.Knobs.Card Opacity'),
  menuOpacity: t('Settings.Glass Settings.Knobs.Menu Opacity'),
  inputOpacity: t('Settings.Glass Settings.Knobs.Input Opacity'),
  luminance: t('Settings.Glass Settings.Knobs.Luminance'),
  blurRadius: t('Settings.Glass Settings.Knobs.Blur Radius'),
  saturation: t('Settings.Glass Settings.Knobs.Saturation'),
  brightness: t('Settings.Glass Settings.Knobs.Brightness'),
  contrast: t('Settings.Glass Settings.Knobs.Contrast'),
  tintColor: t('Settings.Glass Settings.Knobs.Tint Color'),
  tintStrength: t('Settings.Glass Settings.Knobs.Tint Strength'),
  noiseOpacity: t('Settings.Glass Settings.Knobs.Grain Opacity'),
  noiseScale: t('Settings.Glass Settings.Knobs.Grain Scale'),
  borderOpacity: t('Settings.Glass Settings.Knobs.Border Opacity'),
  borderWidth: t('Settings.Glass Settings.Knobs.Border Width'),
  highlightOpacity: t('Settings.Glass Settings.Knobs.Highlight Opacity'),
  innerShadowOpacity: t('Settings.Glass Settings.Knobs.Inner Shadow Opacity'),
  shadowStrength: t('Settings.Glass Settings.Knobs.Shadow Strength'),
  liquidScale: t('Settings.Glass Settings.Knobs.Refraction Strength'),
  liquidBezel: t('Settings.Glass Settings.Knobs.Bezel Width'),
  liquidRadius: t('Settings.Glass Settings.Knobs.Lens Radius'),
  liquidChromatic: t('Settings.Glass Settings.Knobs.Chromatic Aberration'),
  liquidBlur: t('Settings.Glass Settings.Knobs.Lens Blur'),
  liquidSpecular: t('Settings.Glass Settings.Knobs.Specular Highlight'),
  liquidMaxElements: t('Settings.Glass Settings.Knobs.Maximum Lensed Surfaces'),
  transparentWindowBackground: t('Settings.Glass Settings.Knobs.Transparent Window Background'),
  respectReducedTransparency: t('Settings.Glass Settings.Knobs.Respect Reduced Transparency'),
  fallbackOpacity: t('Settings.Glass Settings.Knobs.Fallback Opacity'),
}))
</script>

<style scoped src="./GlassSettings.css" />
