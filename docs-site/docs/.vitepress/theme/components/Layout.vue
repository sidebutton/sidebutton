<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import CopyPageButton from './CopyPageButton.vue'
import HomeHero from './HomeHero.vue'
import { useData } from 'vitepress'

const { Layout } = DefaultTheme
const { frontmatter } = useData()
</script>

<template>
  <Layout>
    <!-- Custom hero for home page -->
    <template #home-hero-before>
      <HomeHero v-if="frontmatter.layout === 'home'" />
    </template>

    <!-- Hide default hero -->
    <template #home-hero-info v-if="frontmatter.layout === 'home'">
      <div style="display: none;"></div>
    </template>

    <template #home-hero-actions-after v-if="frontmatter.layout === 'home'">
      <div style="display: none;"></div>
    </template>

    <!-- Add copy button before the "On this page" outline -->
    <template #aside-outline-before>
      <div v-if="frontmatter.layout !== 'home'" class="copy-page-wrapper">
        <CopyPageButton />
      </div>
    </template>
  </Layout>
</template>

<style>
.copy-page-wrapper {
  margin-bottom: 16px;
  display: flex;
  justify-content: flex-end;
}

/* Hide default VitePress hero elements on home */
.VPHome .VPHero {
  padding-top: 0 !important;
}

.VPHome .VPHero .container {
  display: none !important;
}

.VPHome .VPHero .image {
  display: none !important;
}
</style>
