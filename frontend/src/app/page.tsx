'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import Header from './components/Header/Header';
import LandingView from './components/LandingView/LandingView';
import styles from './page.module.css';

export default function Home() {
  const router = useRouter();

  const hardNavigate = React.useCallback((path: string) => {
    if (typeof window !== 'undefined' && window.location.pathname !== path) {
      window.location.assign(path);
      return;
    }
    router.push(path);
  }, [router]);

  return (
    <>
      <Header onNavigate={(page) => {
        if (page === 'markets') hardNavigate('/markets');
        else if (page === 'faucet') hardNavigate('/faucet');
        else if (page === 'portfolio') hardNavigate('/portfolio');
        else if (page === 'leaderboard') hardNavigate('/leaderboard');
        else if (page === 'landing') hardNavigate('/');
      }} currentPage="landing" />
      <div className={styles.mainContainer}>
        <div className={styles.contentArea}>
          <div className={styles.scrollContent} style={{ width: '100%', paddingTop: '24px' }}>
            <LandingView />
          </div>
        </div>
      </div>
    </>
  );
}
