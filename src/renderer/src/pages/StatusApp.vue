<template>
  <main class="status-window" aria-live="polite">
    <span class="status-text">待機中</span>
  </main>
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
  color: #f8fafc;
  background: #0f172a;
  font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
}

.status-window {
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
  padding: 12px 16px;
  border: 1px solid #334155;
  background: #111827;
  -webkit-app-region: drag;
}

.status-text {
  overflow: hidden;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
