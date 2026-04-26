'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import Header from '../components/Header/Header';
import { useWallet } from '../providers/WalletProvider';
import { fetchAllMarkets } from '../../lib/onchain/reads';
import { createBet, resolveBet, setCreatorApproval } from '../../lib/onchain/adminWrites';
import { MarketData } from '../../data/markets';
import { formatResolutionDate } from '../../utils/formatters';

const AdminPage: React.FC = () => {
    const router = useRouter();
    const { walletAddress, isConnected, connect, isConnecting } = useWallet();
    const [markets, setMarkets] = useState<MarketData[]>([]);
    const [loadingMarkets, setLoadingMarkets] = useState(false);
    const [creating, setCreating] = useState(false);
    const [approving, setApproving] = useState(false);
    const [resolvingId, setResolvingId] = useState<string | null>(null);

    const [form, setForm] = useState({
        title: '',
        resolutionCriteria: '',
        sideAName: '',
        sideBName: '',
        endDate: '',
        resolutionType: '0',
        symbol: '',
        tokenName: ''
    });

    const [newAdmin, setNewAdmin] = useState({ address: '', approved: true });

    const owner = process.env.NEXT_PUBLIC_OWNER_ADDRESS?.toLowerCase() || '';
    const isOwner = walletAddress && walletAddress.toLowerCase() === owner;

    const loadMarkets = async () => {
        setLoadingMarkets(true);
        try {
            const data = await fetchAllMarkets();
            setMarkets(data);
        } finally {
            setLoadingMarkets(false);
        }
    };

    useEffect(() => {
        loadMarkets();
    }, []);

    const handleCreate = async () => {
        if (!isOwner) return;
        if (!form.endDate || !form.title.trim()) return;

        setCreating(true);
        try {
            const endDateMs = new Date(form.endDate).getTime();
            const endDateSeconds = Math.floor(endDateMs / 1000);

            // Old contract flow running on Seismic Testnet
            await createBet({
                title: form.title,
                resolutionCriteria: form.resolutionCriteria,
                sideAName: form.sideAName,
                sideBName: form.sideBName,
                endDate: endDateSeconds,
                resolutionType: Number(form.resolutionType),
                resolutionData: '0x'
            });

            await loadMarkets();
        } finally {
            setCreating(false);
        }
    };

    const handleApproval = async () => {
        if (!isOwner || !newAdmin.address) return;
        setApproving(true);
        try {
            await setCreatorApproval(newAdmin.address as `0x${string}`, newAdmin.approved);
        } finally {
            setApproving(false);
        }
    };

    const handleResolve = async (market: MarketData) => {
        if (!isOwner) return;
        setResolvingId(market.id);
        try {
            await resolveBet(market.contractId as `0x${string}`);
            await loadMarkets();
        } finally {
            setResolvingId(null);
        }
    };

    const visibleMarkets = useMemo(
        () =>
            markets.sort((a, b) => {
                const aDeadline = typeof a.deadline === 'string' ? parseInt(a.deadline, 10) : a.deadline;
                const bDeadline = typeof b.deadline === 'string' ? parseInt(b.deadline, 10) : b.deadline;
                return aDeadline - bDeadline;
            }),
        [markets]
    );

    if (!isConnected || !isOwner) {
        return (
            <>
                <Header onNavigate={(page) => (page === 'landing' ? router.push('/') : router.push('/markets'))} currentPage="markets" />
                <div className={styles.page}>
                    <div className={styles.card}>
                        {!isConnected ? (
                            <button className={styles.button} onClick={connect} disabled={isConnecting}>
                                {isConnecting ? 'Connecting...' : 'Connect wallet'}
                            </button>
                        ) : (
                            <div>Access denied: wallet is not the admin.</div>
                        )}
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <Header onNavigate={(page) => (page === 'landing' ? router.push('/') : router.push('/markets'))} currentPage="markets" />
            <div className={styles.page}>
                <div className={styles.card}>
                    <div className={styles.sectionTitle}>Create Bet</div>
                    <div className={styles.formGrid}>
                        <input className={styles.input} placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                        <input className={styles.input} placeholder="Side A name" value={form.sideAName} onChange={(e) => setForm({ ...form, sideAName: e.target.value })} />
                        <input className={styles.input} placeholder="Side B name" value={form.sideBName} onChange={(e) => setForm({ ...form, sideBName: e.target.value })} />
                        <input className={styles.input} type="datetime-local" placeholder="End date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
                        <select className={styles.input} value={form.resolutionType} onChange={(e) => setForm({ ...form, resolutionType: e.target.value })}>
                            <option value="0">CRYPTO</option>
                            <option value="1">STOCKS</option>
                        </select>
                        <input className={styles.input} placeholder="Symbol (e.g., BTC or AAPL)" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} />
                        <input className={styles.input} placeholder="Name (e.g., Bitcoin)" value={form.tokenName} onChange={(e) => setForm({ ...form, tokenName: e.target.value })} />
                    </div>
                    <textarea className={styles.textarea} placeholder="Resolution criteria" value={form.resolutionCriteria} onChange={(e) => setForm({ ...form, resolutionCriteria: e.target.value })} />
                    <button className={styles.button} onClick={handleCreate} disabled={creating}>
                        {creating ? 'Creating...' : 'Create bet'}
                    </button>
                </div>

                <div className={styles.card}>
                    <div className={styles.sectionTitle}>Approve Creator</div>
                    <div className={styles.formGrid}>
                        <input className={styles.input} placeholder="Creator address" value={newAdmin.address} onChange={(e) => setNewAdmin({ ...newAdmin, address: e.target.value })} />
                        <select className={styles.input} value={newAdmin.approved ? 'true' : 'false'} onChange={(e) => setNewAdmin({ ...newAdmin, approved: e.target.value === 'true' })}>
                            <option value="true">Approve</option>
                            <option value="false">Revoke</option>
                        </select>
                    </div>
                    <button className={styles.button} onClick={handleApproval} disabled={approving}>
                        {approving ? 'Updating...' : 'Update approval'}
                    </button>
                </div>

                <div className={styles.card}>
                    <div className={styles.sectionTitle}>Resolve Bets</div>
                    {loadingMarkets ? (
                        <div className={styles.muted}>Loading markets...</div>
                    ) : (
                        <div className={styles.list}>
                            {visibleMarkets.map((m, idx) => {
                                const deadline = typeof m.deadline === 'string' ? parseInt(m.deadline, 10) : m.deadline;
                                const deadlinePassed = Date.now() >= deadline * 1000;
                                return (
                                    <div key={m.contractId || m.id || idx} className={styles.marketRow}>
                                        <div className={styles.marketMeta}>
                                            <div style={{ fontWeight: 700 }}>{m.title}</div>
                                            <div className={styles.muted}>Deadline: {formatResolutionDate(deadline) ?? '-'}</div>
                                            <div className={styles.muted}>State: {m.state}</div>
                                        </div>
                                        <button
                                            className={`${styles.button} ${!deadlinePassed ? styles.muted : ''}`}
                                            onClick={() => handleResolve(m)}
                                            disabled={!deadlinePassed || resolvingId === m.id}
                                        >
                                            {resolvingId === m.id ? 'Resolving...' : 'Resolve'}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

export default AdminPage;
