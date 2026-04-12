<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import CopyPageButton from './CopyPageButton.vue'
import { useData, onContentUpdated } from 'vitepress'
import { onMounted } from 'vue'

const { Layout } = DefaultTheme
const { frontmatter } = useData()

function redirectLogo() {
  const link = document.querySelector('.VPNavBarTitle a')
  if (link) {
    link.setAttribute('href', 'https://sidebutton.com')
  }
}

onMounted(redirectLogo)
onContentUpdated(redirectLogo)
</script>

<template>
  <Layout>
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
