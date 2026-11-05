import { calendarOutline, chatbubbleOutline, settingsOutline, timeOutline } from 'ionicons/icons';

// Top-level sections: bottom tabs on phones, the side menu on wide screens (SPEC §5.13).
export const SECTIONS = [
  { tab: 'calendar', path: '/calendar', icon: calendarOutline },
  { tab: 'history', path: '/history', icon: timeOutline },
  { tab: 'agent', path: '/agent', icon: chatbubbleOutline },
  { tab: 'settings', path: '/settings', icon: settingsOutline },
] as const;

export type Section = (typeof SECTIONS)[number]['tab'];

const sectionIndex = (path: string) =>
  SECTIONS.findIndex((section) => path === section.path || path.startsWith(`${section.path}/`));

// Which way a move between two paths goes along the tabs: 1 to the right, -1 to the left, 0 within
// a section or outside the tabs.
export function sectionStep(from: string, to: string): -1 | 0 | 1 {
  const [start, end] = [sectionIndex(from), sectionIndex(to)];
  if (start < 0 || end < 0 || start === end) return 0;
  return end > start ? 1 : -1;
}
