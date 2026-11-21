<script setup>
import DefaultTheme from 'vitepress/theme'
import { withBase } from 'vitepress'

const { Layout } = DefaultTheme
</script>

<template>
  <Layout>
    <!-- On every docs page: this is the fork's site, not the official one. -->
    <template #doc-before>
      <p class="fork-notice">
        These are the docs of <a href="https://github.com/abedmurrar/express">abedmurrar/express</a>, an
        unofficial fork of Express. The official Express docs are at
        <a href="https://expressjs.com">expressjs.com</a>. What the fork changes is in the
        <a :href="withBase('/fork/')">Fork</a> section.
      </p>
    </template>
  </Layout>
</template>
