import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type DeviceContextType = {
  isMobile: boolean;       // true when pointer is coarse (touch device)
  isNarrowScreen: boolean; // true when viewport < 768px (mobile layout breakpoint)
};

const DeviceContext = createContext<DeviceContextType>({ isMobile: false, isNarrowScreen: false });

export function DeviceProvider({ children }: { children: ReactNode }) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(pointer: coarse)').matches
      : false
  );

  const [isNarrowScreen, setIsNarrowScreen] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(max-width: 767px)').matches
      : false
  );

  useEffect(() => {
    const pointerMq = window.matchMedia('(pointer: coarse)');
    const pointerHandler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    pointerMq.addEventListener('change', pointerHandler);

    const widthMq = window.matchMedia('(max-width: 767px)');
    const widthHandler = (e: MediaQueryListEvent) => setIsNarrowScreen(e.matches);
    widthMq.addEventListener('change', widthHandler);

    return () => {
      pointerMq.removeEventListener('change', pointerHandler);
      widthMq.removeEventListener('change', widthHandler);
    };
  }, []);

  return (
    <DeviceContext.Provider value={{ isMobile, isNarrowScreen }}>
      {children}
    </DeviceContext.Provider>
  );
}

export function useDevice() {
  return useContext(DeviceContext);
}
