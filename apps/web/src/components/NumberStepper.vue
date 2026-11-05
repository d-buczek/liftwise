<script setup lang="ts">
import { IonButton, IonIcon } from '@ionic/vue';
import { add, remove } from 'ionicons/icons';
import { nextTick, ref, useTemplateRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// A number with − / + on both sides. With `parse` the value can also be typed: tap it; Enter or
// leaving the field applies the text, Esc or an empty field keeps the old value. Text that doesn't
// parse keeps the field open and sets `invalid`, so the screen holds back the action that would
// use the old value.
const props = defineProps<{
  label: string;
  value: string;
  unit: string;
  size?: 'md' | 'lg';
  parse?: (text: string) => number | null;
  invalidText?: string;
}>();
const emit = defineEmits<{ step: [direction: 1 | -1]; enter: [value: number] }>();
const invalid = defineModel<boolean>('invalid', { default: false });

// Longer than a weight like 26,25: over 100 kg the numerals shrink to fit between − and +.
const LONG_VALUE = 5;

const { t } = useI18n();
const text = ref<string | null>(null); // null when not typing
const rejected = ref(false); // shows the message only after an attempt, not at every keystroke
const input = useTemplateRef<HTMLInputElement>('input');
const valueButton = useTemplateRef<HTMLButtonElement>('valueButton');

function close() {
  text.value = null;
  rejected.value = false;
  invalid.value = false;
}

// The value changed from outside (another exercise, a logged set): the typed text is out of date.
watch(() => props.value, close);

async function open() {
  text.value = props.value;
  await nextTick();
  input.value?.focus();
  input.value?.select();
}

function onInput(event: Event) {
  const typed = (event.target as HTMLInputElement).value;
  text.value = typed;
  rejected.value = false;
  invalid.value = typed.trim() !== '' && props.parse?.(typed) === null;
}

// Returns whether the field closed.
function apply(): boolean {
  if (text.value === null) return true;
  if (text.value.trim() === '') {
    close();
    return true;
  }
  const value = props.parse?.(text.value) ?? null;
  if (value === null) {
    rejected.value = true;
    return false;
  }
  close();
  emit('enter', value);
  return true;
}

// Another window or app taking the focus also blurs the field, with the field still the document's
// active element: the user comes back to finish typing, so half a number isn't applied.
function onBlur() {
  if (document.activeElement !== input.value) apply();
}

// From the keyboard the focus returns to the value, so Tab goes on from there.
async function focusValue() {
  await nextTick();
  valueButton.value?.focus();
}

function onEnter() {
  if (apply()) void focusValue();
}

function onEscape() {
  close();
  void focusValue();
}

// A step from text that doesn't parse drops the text and counts from the last good value.
function step(direction: 1 | -1) {
  close();
  emit('step', direction);
}
</script>

<template>
  <div
    class="lw-stepper"
    :class="[`is-${size ?? 'md'}`, { 'is-long': value.length > LONG_VALUE }]"
    role="group"
    :aria-label="label"
  >
    <!-- The message takes the label's line: it appears during a press elsewhere (blur comes on
         mousedown), and a new line would move that press's target. -->
    <p v-if="rejected" class="lw-stepper__label lw-stepper__error" role="alert">
      {{ invalidText }}
    </p>
    <span v-else class="lw-stepper__label">{{ label }}</span>
    <div class="lw-stepper__row">
      <ion-button
        class="lw-stepper__button"
        fill="outline"
        :aria-label="t('set.less', { label })"
        @click="step(-1)"
      >
        <ion-icon slot="icon-only" :icon="remove" aria-hidden="true" />
      </ion-button>
      <div v-if="text !== null" class="lw-stepper__value lw-stepper__field lw-num">
        <input
          ref="input"
          class="lw-stepper__input"
          type="text"
          inputmode="decimal"
          enterkeyhint="done"
          autocomplete="off"
          :value="text"
          :aria-label="label"
          :aria-invalid="rejected"
          @input="onInput"
          @blur="onBlur"
          @keydown.enter.prevent="onEnter"
          @keydown.esc.stop="onEscape"
        /><small>{{ unit }}</small>
      </div>
      <output v-else class="lw-stepper__value lw-num" aria-live="polite">
        <button
          v-if="parse"
          ref="valueButton"
          class="lw-stepper__typed"
          type="button"
          :aria-description="t('set.typeValue')"
          @click="open"
        >
          {{ value }}<small>{{ unit }}</small>
        </button>
        <template v-else
          >{{ value }}<small>{{ unit }}</small></template
        >
      </output>
      <ion-button
        class="lw-stepper__button"
        fill="outline"
        :aria-label="t('set.more', { label })"
        @click="step(1)"
      >
        <ion-icon slot="icon-only" :icon="add" aria-hidden="true" />
      </ion-button>
    </div>
  </div>
</template>

<style scoped>
.lw-stepper__label {
  display: block;
  font-size: 14px;
  color: var(--lw-muted);
}

.lw-stepper__row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 8px;
}

.lw-stepper__value {
  font-size: 52px;
  line-height: 1;
  text-align: center;
  text-shadow: var(--lw-cast);
}

.lw-stepper__value small {
  margin-left: 5px;
  font-family: var(--lw-font);
  font-size: 15px;
  font-weight: 600;
  color: var(--lw-muted);
  text-shadow: none;
}

/* The value as a tap target: the whole space between − and +. */
.lw-stepper__typed {
  width: 100%;
  min-height: 56px;
  padding: 0;
  border: 0;
  border-radius: 12px;
  background: none;
  color: inherit;
  font: inherit;
}

.lw-stepper__field {
  display: flex;
  min-width: 0;
  align-items: baseline;
  justify-content: center;
}

.lw-stepper__field small {
  flex: none;
}

/* As tall as the button it replaces: closing the field must not move what's under the row, least of
   all "Zrobione", which is what closes it. A browser won't let the line height of an input do this. */
.lw-stepper__input {
  flex: 0 1 auto;
  min-width: 2ch;
  height: 56px;
  field-sizing: content;
  padding: 0;
  border: 0;
  border-bottom: 2px solid var(--ion-color-primary);
  border-radius: 0;
  outline: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: center;
}

.lw-stepper__input[aria-invalid='true'] {
  border-bottom-color: var(--ion-color-danger);
}

.lw-stepper__error {
  margin: 0;
  color: var(--ion-color-danger);
}

.lw-stepper__button {
  --background: var(--lw-control);
  --border-radius: var(--lw-control-radius);
  --border-width: 1px;
  --border-color: var(--lw-control-border);
  --box-shadow: var(--lw-control-shadow);
  --color: var(--ion-text-color);
  width: 56px;
  height: 56px;
  margin: 0;
}

/* Proportional figures and a tight row: 26,25 with its unit fits on a 375 px phone at this size, and
   it scales down with a narrower one. Nothing here counts down, so the figures may differ in width. */
.is-lg .lw-stepper__row {
  gap: 4px;
}

.is-lg .lw-stepper__value {
  font-size: min(90px, 24vw);
  font-variant-numeric: normal;
  line-height: 0.92;
}

.is-lg.is-long .lw-stepper__value {
  font-size: min(72px, 19vw);
}

.is-lg .lw-stepper__typed {
  min-height: 84px;
}

/* A weight like 112,25 with its unit fits between − and + on a phone. */
.is-lg .lw-stepper__input {
  height: 84px;
  font-size: 0.8em;
}

.is-lg .lw-stepper__button {
  width: 60px;
  height: 60px;
}
</style>
