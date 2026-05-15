import React, { useState, useEffect } from 'react';
import { auth, logout } from '../lib/api';

interface AutoLogoutProps {
  children: React.ReactNode;
}

export function AutoLogout({ children }: AutoLogoutProps) {
  // Load saved timeout or default to 15 minutes for logout
  const [timeoutMs, setTimeoutMs] = useState(() => {
    const saved = localStorage.getItem('logout_timeout');
    const oldLock = localStorage.getItem('lock_timeout');
    if (saved) return parseInt(saved, 10);
    if (oldLock) return parseInt(oldLock, 10);
    return 31536000000; // Default to 1 year (practically disabled)
  });

  const [isEnabled, setIsEnabled] = useState(() => {
    const saved = localStorage.getItem('auto_logout_enabled');
    return saved === 'true'; // Default to false if not set
  });

  useEffect(() => {
    if (!auth.currentUser || !isEnabled) {
      // If disabled, we still want to listen for updates to re-enable it
      const handleTimeoutUpdate = (e: any) => {
        if (e.detail && typeof e.detail === 'number') {
          const newMs = e.detail * 60 * 1000;
          setTimeoutMs(newMs);
          localStorage.setItem('logout_timeout', newMs.toString());
        }
      };
      const handleToggleUpdate = (e: any) => {
        if (e.detail !== undefined) {
          setIsEnabled(e.detail);
          localStorage.setItem('auto_logout_enabled', e.detail.toString());
        }
      };
      window.addEventListener('update-logout-timeout', handleTimeoutUpdate);
      window.addEventListener('toggle-auto-logout', handleToggleUpdate);
      return () => {
        window.removeEventListener('update-logout-timeout', handleTimeoutUpdate);
        window.removeEventListener('toggle-auto-logout', handleToggleUpdate);
      };
    }

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    let timerId: number;

    const performLogout = async () => {
      console.log('Automatic logout triggered due to inactivity');
      await logout();
    };

    const resetTimer = () => {
      window.clearTimeout(timerId);
      timerId = window.setTimeout(performLogout, timeoutMs);
    };

    events.forEach(event => window.addEventListener(event, resetTimer));
    
    timerId = window.setTimeout(performLogout, timeoutMs);

    // Listen for custom updates
    const handleTimeoutUpdate = (e: any) => {
      if (e.detail && typeof e.detail === 'number') {
        const newMs = e.detail * 60 * 1000;
        setTimeoutMs(newMs);
        localStorage.setItem('logout_timeout', newMs.toString());
      }
    };
    const handleToggleUpdate = (e: any) => {
      if (e.detail !== undefined) {
        setIsEnabled(e.detail);
        localStorage.setItem('auto_logout_enabled', e.detail.toString());
      }
    };
    window.addEventListener('update-logout-timeout', handleTimeoutUpdate);
    window.addEventListener('toggle-auto-logout', handleToggleUpdate);

    return () => {
      events.forEach(event => window.removeEventListener(event, resetTimer));
      window.removeEventListener('update-logout-timeout', handleTimeoutUpdate);
      window.removeEventListener('toggle-auto-logout', handleToggleUpdate);
      window.clearTimeout(timerId);
    };
  }, [timeoutMs, isEnabled]);

  return <>{children}</>;
}
