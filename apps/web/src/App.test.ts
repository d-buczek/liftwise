import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vite-plus/test';
import App from './App.vue';

describe('App', () => {
  it('mounts', () => {
    expect(mount(App).find('main').exists()).toBe(true);
  });
});
