'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import Header from './components/Header/Header';
import LandingView from './components/LandingView/LandingView';
import styles from './page.module.css';
import { type AppPage, getAppPagePath } from '../lib/navigation/appRoutes';

export default function Home() {
  const router = useRouter();

  const navigateToPage = React.useCallback((page: AppPage) => {
    router.push(getAppPagePath(page));
  }, [router]);

  return (
    <>
      <Header onNavigate={navigateToPage} currentPage="landing" />
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
