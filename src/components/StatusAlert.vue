<script setup lang="ts">
import { useEngineStore } from '../stores/engine'

const e = useEngineStore()
</script>

<template>
  <div v-if="e.errorMessage" class="alert">
    <div class="alert-content">
      <span class="alert-icon">⚠️</span>
      <span class="alert-text">{{ e.errorMessage }}</span>
    </div>
    <div class="alert-actions">
      <button class="alert-btn" @click="e.errorMessage = null">关闭</button>
    </div>
  </div>
</template>

<style scoped>
.alert {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  background: linear-gradient(135deg, rgba(255,80,80,0.2), rgba(255,120,40,0.15));
  border: 1px solid rgba(255,100,100,0.35);
  border-radius: 10px;
  color: #ffb0b0;
  font-size: 14px;
  animation: slideDown 0.3s ease-out;
}

.alert-content {
  display: flex;
  align-items: center;
  gap: 8px;
}

.alert-icon {
  font-size: 18px;
}

.alert-actions {
  display: flex;
  gap: 8px;
}

.alert-btn {
  padding: 4px 12px;
  border-radius: 4px;
  border: 1px solid rgba(255,100,100,0.3);
  background: rgba(255,100,100,0.1);
  color: #ffb0b0;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.alert-btn:hover {
  background: rgba(255,100,100,0.2);
}

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
