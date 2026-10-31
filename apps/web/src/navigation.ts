import { calendarOutline, chatbubbleOutline, settingsOutline, timeOutline } from 'ionicons/icons';

// Top-level sections: bottom tabs on phones, the side menu on wide screens (SPEC §5.13).
export const SECTIONS = [
  { tab: 'calendar', path: '/calendar', icon: calendarOutline },
  { tab: 'history', path: '/history', icon: timeOutline },
  { tab: 'agent', path: '/agent', icon: chatbubbleOutline },
  { tab: 'settings', path: '/settings', icon: settingsOutline },
] as const;

export type Section = (typeof SECTIONS)[number]['tab'];
