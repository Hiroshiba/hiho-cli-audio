<template>
  <main class="history-window">
    <header class="history-header">
      <h1>履歴</h1>
    </header>
    <section class="history-empty">履歴はありません</section>
  </main>
</template>

<style scoped>
:global(html),
:global(body),
:global(#app) {
  width: 100%;
  min-height: 100%;
  margin: 0;
}

:global(body) {
  overflow: hidden;
  color: #172033;
  background: #f8fafc;
  font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
}

.history-window {
  display: flex;
  min-height: 100vh;
  flex-direction: column;
  background: #f8fafc;
}

.history-header {
  padding: 14px 16px;
  border-bottom: 1px solid #d7dde8;
  background: #ffffff;
}

.history-header h1 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.4;
}

.history-empty {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: #64748b;
  font-size: 14px;
}
</style>
