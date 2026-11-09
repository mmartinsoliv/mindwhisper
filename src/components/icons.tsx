import type { ReactNode, SVGProps } from 'react';
const Svg = ({ children, ...p }: SVGProps<SVGSVGElement> & { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>{children}</svg>
);
export const MicIcon = (p: SVGProps<SVGSVGElement>) => <Svg {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></Svg>;
export const StopIcon = (p: SVGProps<SVGSVGElement>) => <Svg {...p}><rect x="6" y="6" width="12" height="12" rx="2" /></Svg>;
export const XIcon = (p: SVGProps<SVGSVGElement>) => <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const CheckIcon = (p: SVGProps<SVGSVGElement>) => <Svg {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
export const AlertIcon = (p: SVGProps<SVGSVGElement>) => <Svg {...p}><path d="M12 8v5M12 17h.01" /><path d="M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></Svg>;
export const HistoryIcon = (p: SVGProps<SVGSVGElement>) => <Svg {...p}><path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2" /></Svg>;
export const BookIcon = (p: SVGProps<SVGSVGElement>) => <Svg {...p}><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5" /></Svg>;
export const SettingsIcon = (p: SVGProps<SVGSVGElement>) => <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></Svg>;
export const CopyIcon = (p: SVGProps<SVGSVGElement>) => <Svg {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></Svg>;
export const TrashIcon = (p: SVGProps<SVGSVGElement>) => <Svg {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Svg>;
export const SearchIcon = (p: SVGProps<SVGSVGElement>) => <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></Svg>;
export const RetryIcon = (p: SVGProps<SVGSVGElement>) => <Svg {...p}><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" /></Svg>;
