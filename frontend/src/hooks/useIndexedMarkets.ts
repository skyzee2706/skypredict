'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MarketData } from '../data/markets';

type IndexedMarketsState = {
  markets: MarketData[];
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
};

type IndexedMarketsResponse = {
  markets?: MarketData[];
};

export function useIndexedMarkets(refetchInterval = 7_500) {
  const mountedRef = useRef(false);
  const [state, setState] = useState<IndexedMarketsState>({
    markets: [],
    isLoading: true,
    isFetching: false,
    error: null,
  });

  const refetch = useCallback(async () => {
    setState((previous) => ({ ...previous, isFetching: true }));
    try {
      const response = await fetch(`/api/markets?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Market API failed: ${response.status}`);
      const payload = (await response.json()) as IndexedMarketsResponse;
      if (!mountedRef.current) return;
      setState({
        markets: Array.isArray(payload.markets) ? payload.markets : [],
        isLoading: false,
        isFetching: false,
        error: null,
      });
    } catch (error) {
      if (!mountedRef.current) return;
      setState((previous) => ({
        ...previous,
        isLoading: false,
        isFetching: false,
        error: error instanceof Error ? error : new Error('Failed to load markets'),
      }));
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refetch();
    const id = window.setInterval(() => void refetch(), refetchInterval);
    const refresh = () => void refetch();
    window.addEventListener('skypredict:markets-refresh', refresh);
    return () => {
      mountedRef.current = false;
      window.clearInterval(id);
      window.removeEventListener('skypredict:markets-refresh', refresh);
    };
  }, [refetch, refetchInterval]);

  return { ...state, refetch };
}
