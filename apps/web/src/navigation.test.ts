import { expect, it } from 'vite-plus/test';
import { sectionStep } from './navigation';

it('tells which way a move between sections goes along the tabs', () => {
  expect(sectionStep('/calendar', '/history')).toBe(1);
  expect(sectionStep('/settings', '/calendar')).toBe(-1);
  expect(sectionStep('/calendar/2026-11-04/workout', '/agent')).toBe(1);
});

it('sees no step within a section or outside the tabs', () => {
  expect(sectionStep('/calendar', '/calendar/2026-11-04')).toBe(0);
  expect(sectionStep('/pair', '/calendar')).toBe(0);
  expect(sectionStep('/calendar', '/calendarium')).toBe(0);
});
