<script setup lang="ts">
import VoiceRecorder from '../components/VoiceRecorder.vue'
</script>

<template>
  <div class="app">
    <VoiceRecorder />
  </div>
</template>

<style scoped>
:global(html),
:global(body),
:global(#app) {
  width: 100%;
  height: 100%;
  margin: 0;
}

:global(body) {
  overflow: hidden;
  background: transparent;
}
</style>
