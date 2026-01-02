<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import CopyPageButton from './CopyPageButton.vue'
import { useData } from 'vitepress'

const { Layout } = DefaultTheme
const { frontmatter } = useData()
</script>

<template>
  <Layout>
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
</style>
