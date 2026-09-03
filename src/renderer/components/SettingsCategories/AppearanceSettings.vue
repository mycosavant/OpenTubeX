<template>
  <div class="settingsCategory">
    <ThemeSettings />
    <GlassSettings />
    <GeneralSettings mode="appearance" />
  </div>
</template>

<script setup>
import GeneralSettings from '../GeneralSettings/GeneralSettings.vue'
import GlassSettings from '../GlassSettings/GlassSettings.vue'
import ThemeSettings from '../ThemeSettings.vue'
</script>
