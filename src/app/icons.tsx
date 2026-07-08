/** Minimal geometric SVG icons — no emoji, consistent stroke style. */

function I({ children, size = 16 }: { children: React.ReactNode; size?: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

export const BusIcon = ({ size }: { size?: number }): React.JSX.Element => (
  <I {...(size !== undefined ? { size } : {})}>
    <rect x="4" y="3" width="16" height="14" rx="2" />
    <path d="M4 10h16" />
    <circle cx="8" cy="19.5" r="1.5" />
    <circle cx="16" cy="19.5" r="1.5" />
  </I>
);

export const TramIcon = ({ size }: { size?: number }): React.JSX.Element => (
  <I {...(size !== undefined ? { size } : {})}>
    <rect x="5" y="6" width="14" height="12" rx="2" />
    <path d="M5 12h14M12 6V3M8 3h8" />
    <circle cx="9" cy="15.5" r="0.5" />
    <circle cx="15" cy="15.5" r="0.5" />
  </I>
);

export const MetroIcon = ({ size }: { size?: number }): React.JSX.Element => (
  <I {...(size !== undefined ? { size } : {})}>
    <path d="M5 20 L12 4 L19 20" />
    <path d="M7.5 14.5h9" />
  </I>
);

export const RailIcon = ({ size }: { size?: number }): React.JSX.Element => (
  <I {...(size !== undefined ? { size } : {})}>
    <rect x="6" y="3" width="12" height="13" rx="3" />
    <path d="M6 10h12M9 20l-1.5 2M15 20l1.5 2M9 16l-1 2h8l-1-2" />
  </I>
);

export const SelectIcon = ({ size }: { size?: number }): React.JSX.Element => (
  <I {...(size !== undefined ? { size } : {})}>
    <path d="M5 3l14 8-6 2-3 6z" />
  </I>
);

export const StationIcon = ({ size }: { size?: number }): React.JSX.Element => (
  <I {...(size !== undefined ? { size } : {})}>
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.5" />
  </I>
);

export const TrackIcon = ({ size }: { size?: number }): React.JSX.Element => (
  <I {...(size !== undefined ? { size } : {})}>
    <circle cx="5" cy="19" r="2.5" />
    <circle cx="19" cy="5" r="2.5" />
    <path d="M7 17L17 7" />
  </I>
);

export const RouteIcon = ({ size }: { size?: number }): React.JSX.Element => (
  <I {...(size !== undefined ? { size } : {})}>
    <circle cx="5" cy="18" r="2" />
    <circle cx="12" cy="7" r="2" />
    <circle cx="19" cy="16" r="2" />
    <path d="M6.5 16.5L10.5 9M13.5 8.5l4 6" />
  </I>
);

export const BulldozeIcon = ({ size }: { size?: number }): React.JSX.Element => (
  <I {...(size !== undefined ? { size } : {})}>
    <path d="M4 4l16 16M20 4L4 20" />
  </I>
);

export const CoinsIcon = ({ size }: { size?: number }): React.JSX.Element => (
  <I {...(size !== undefined ? { size } : {})}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v8M9.5 9.8c0-1 1.1-1.8 2.5-1.8s2.5.8 2.5 1.8-1.1 1.6-2.5 2c-1.4.4-2.5 1-2.5 2s1.1 1.8 2.5 1.8 2.5-.8 2.5-1.8" />
  </I>
);

export const PeopleIcon = ({ size }: { size?: number }): React.JSX.Element => (
  <I {...(size !== undefined ? { size } : {})}>
    <circle cx="9" cy="8" r="3" />
    <path d="M3.5 20c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
    <circle cx="17" cy="9" r="2.4" />
    <path d="M16 15.2c2.6.2 4.5 2 4.5 4.3" />
  </I>
);

export const ThumbIcon = ({ size }: { size?: number }): React.JSX.Element => (
  <I {...(size !== undefined ? { size } : {})}>
    <path d="M7 11v9H4v-9zM7 11l4-7c1.5 0 2.5 1 2.5 2.5L13 10h5.5c1 0 1.8 1 1.5 2l-1.6 6.5c-.2.9-1 1.5-1.9 1.5H7" />
  </I>
);

export const ShareIcon = ({ size }: { size?: number }): React.JSX.Element => (
  <I {...(size !== undefined ? { size } : {})}>
    <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />
  </I>
);

export const PinIcon = ({ size }: { size?: number }): React.JSX.Element => (
  <I {...(size !== undefined ? { size } : {})}>
    <path d="M12 21s-6.5-5.5-6.5-10a6.5 6.5 0 0113 0c0 4.5-6.5 10-6.5 10z" />
    <circle cx="12" cy="10.5" r="2" />
  </I>
);
