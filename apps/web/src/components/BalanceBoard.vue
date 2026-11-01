<script setup lang="ts">
import type { BalanceSnapshot } from '@liftwise/core';
import { IonItem, IonLabel, IonList, IonNote } from '@ionic/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../composables/format';
import BalanceMeter from './BalanceMeter.vue';

// The balance guard (§5.8, D6): every muscle group with the days since its last direct work and
// its hard sets of the last 7 days against the target (only "too much" is tagged: below the range is
// the usual state of a week in progress), then the movement patterns. A pattern
// never done is a visible gap, not hidden.
const props = defineProps<{ snapshot: BalanceSnapshot }>();

const { t } = useI18n();
const format = useFormat();

// One scale for every row, with room above the highest target for "too much".
const scale = computed(
  () =>
    Math.max(...props.snapshot.muscles.map((m) => Math.max(m.target.max, m.hardSets)), 1) * 1.25,
);
</script>

<template>
  <section>
    <h2 class="lw-heading">{{ t('balance.muscles') }}</h2>
    <p class="lw-board__hint">{{ t('balance.musclesHint') }}</p>
    <ion-list>
      <ion-item
        v-for="muscle in snapshot.muscles"
        :key="muscle.group"
        :router-link="`/history/muscle/${muscle.group}`"
        :detail="false"
      >
        <ion-label class="lw-board__muscle">
          <span class="lw-board__head">
            <span class="lw-board__name">{{ format.sentence(format.muscle(muscle.group)) }}</span>
            <span
              v-if="muscle.status === 'over'"
              class="lw-board__tag"
              :class="`is-${muscle.status}`"
            >
              {{ t(`balance.status.${muscle.status}`) }}
            </span>
            <span class="lw-board__since">{{ format.daysSince(muscle.daysSince) }}</span>
          </span>
          <balance-meter :muscle="muscle" :scale="scale" />
        </ion-label>
      </ion-item>
    </ion-list>

    <h2 class="lw-heading">{{ t('balance.patterns') }}</h2>
    <ion-list>
      <ion-item v-for="pattern in snapshot.patterns" :key="pattern.pattern">
        <ion-label>{{ format.sentence(format.pattern(pattern.pattern)) }}</ion-label>
        <span v-if="pattern.daysSince === null" slot="end" class="lw-board__tag is-never">
          {{ t('balance.never') }}
        </span>
        <ion-note v-else slot="end">{{ format.daysSince(pattern.daysSince) }}</ion-note>
      </ion-item>
    </ion-list>
  </section>
</template>

<style scoped>
.lw-board__hint {
  margin: -4px 0 8px;
  font-size: 14px;
  color: var(--lw-muted);
}

.lw-board__muscle {
  display: grid;
  gap: 8px;
  padding-block: 4px;
}

.lw-board__head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.lw-board__name {
  font-size: 16px;
  font-weight: 600;
}

.lw-board__since {
  margin-left: auto;
  font-size: 14px;
  color: var(--lw-muted);
}

.lw-board__tag {
  padding: 0 8px;
  font-size: 13px;
  font-weight: 600;
  line-height: 20px;
  border-radius: 10px;
}

.lw-board__tag.is-over,
.lw-board__tag.is-never {
  color: var(--ion-color-warning-contrast);
  background: var(--ion-color-warning);
}
</style>
