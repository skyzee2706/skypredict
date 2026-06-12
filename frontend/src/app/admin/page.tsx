'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import Header from '../components/Header/Header';
import { useWallet } from '../providers/WalletProvider';
import { fetchAllMarkets } from '../../lib/onchain/reads';
import { createBet, createMarketWithOutcomes, resolveBet, resolveWithOutcome, setCreatorApproval } from '../../lib/onchain/adminWrites';
import { formatResolutionDate } from '../../utils/formatters';
import { MarketData } from '../../data/markets';
import { getDepositBalance, withdrawDepositFunds } from '../../lib/onchain/writes';
import { TOKEN_ADDRESS } from '../../lib/constants';
import { formatEther } from 'viem';
import { getResolvableMarkets } from '../../lib/markets/resolutionFilters';
import { dedupeMarketsByEvent } from '../../lib/markets/marketMath';

const AdminPage: React.FC = () => {
    const router = useRouter();
    const { walletAddress, isConnected, connect, isConnecting } = useWallet();
    const [markets, setMarkets] = useState<MarketData[]>([]);
    const [loadingMarkets, setLoadingMarkets] = useState(false);
    const [creating, setCreating] = useState(false);
    const [approving, setApproving] = useState(false);
    const [resolvingId, setResolvingId] = useState<string | null>(null);
    const [depositBal, setDepositBal] = useState<bigint>(0n);
    const [withdrawingFunds, setWithdrawingFunds] = useState(false);

    const [formType, setFormType] = useState<'CRYPTO' | 'SPORTS' | 'POLITICS'>('CRYPTO');
    const [form, setForm] = useState({
        title: '',
        resolutionCriteria: '',
        sideAName: '',
        drawName: '',
        sideBName: '',
        endDate: '',
        symbol: '',
        tokenName: ''
    });

    const [newAdmin, setNewAdmin] = useState({ address: '', approved: true });
    const [resolveOutcome, setResolveOutcome] = useState<Record<string, string>>({});

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
        getDepositBalance().then(setDepositBal).catch(() => setDepositBal(0n));
    }, []);

    const handleWithdrawFunds = async () => {
        if (!isOwner || !walletAddress) return;
        setWithdrawingFunds(true);
        try {
            await withdrawDepositFunds(walletAddress as `0x${string}`);
            const balance = await getDepositBalance();
            setDepositBal(balance);
        } finally {
            setWithdrawingFunds(false);
        }
    };

    const handleCreate = async () => {
        if (!isOwner) return;
        if (!form.endDate || !form.title.trim()) return;

        setCreating(true);
        try {
            const endDateMs = new Date(form.endDate).getTime();
            const endDateSeconds = Math.floor(endDateMs / 1000);

            if (formType === 'CRYPTO') {
                await createBet({
                    title: form.title,
                    resolutionCriteria: form.resolutionCriteria,
                    sideAName: form.sideAName || 'YES',
                    sideBName: form.sideBName || 'NO',
                    endDate: endDateSeconds,
                    resolutionType: 0,
                    resolutionData: '0x'
                });
            } else {
                await createMarketWithOutcomes({
                    question: form.title,
                    sideAName: form.sideAName || (formType === 'SPORTS' ? 'Home' : 'Yes'),
                    drawName: form.drawName || 'Draw',
                    sideBName: form.sideBName || (formType === 'SPORTS' ? 'Away' : 'No'),
                    marketType: formType,
                    endDate: endDateSeconds,
                });
            }

            await loadMarkets();
            setForm({ title: '', resolutionCriteria: '', sideAName: '', drawName: '', sideBName: '', endDate: '', symbol: '', tokenName: '' });
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
            if (market.category === 'POLITICS') {
                const outcomeStr = resolveOutcome[market.id] || '0';
                const outcome = parseInt(outcomeStr) as 0 | 1 | 2;
                await resolveWithOutcome(market.contractId as `0x${string}`, outcome);
            } else {
                await resolveBet(market.contractId as `0x${string}`);
            }
            await loadMarkets();
        } finally {
            setResolvingId(null);
        }
    };

    const visibleMarkets = useMemo(
        () =>
            getResolvableMarkets(dedupeMarketsByEvent(markets)).sort((a, b) => {
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
                {/* Treasury */}
                <div className={styles.card}>
                    <div className={styles.sectionTitle}>Deposit Fund Treasury</div>
                    <div className={styles.muted}>Token contract: {TOKEN_ADDRESS}</div>
                    <div className={styles.treasuryAmount}>{formatEther(depositBal)} RITUAL</div>
                    <div className={styles.muted} style={{ marginBottom: '12px' }}>Total RITUAL accumulated from user deposits</div>
                    <button className={styles.button} onClick={handleWithdrawFunds} disabled={withdrawingFunds || depositBal === 0n}>
                        {withdrawingFunds ? 'Withdrawing...' : 'Withdraw deposit funds'}
                    </button>
                </div>

                {/* Create Market */}
                <div className={styles.card}>
                    <div className={styles.sectionTitle}>Create Market</div>
                    
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                        {(['CRYPTO', 'SPORTS', 'POLITICS'] as const).map((type) => (
                            <button
                                key={type}
                                onClick={() => setFormType(type)}
                                style={{
                                    padding: '10px 18px',
                                    borderRadius: '10px',
                                    border: formType === type ? '2px solid var(--primary)' : '1px solid var(--border)',
                                    background: formType === type ? 'rgba(34,197,94,0.15)' : 'var(--bg-card)',
                                    color: 'var(--text-primary)',
                                    cursor: 'pointer',
                                    fontWeight: 800,
                                    fontSize: '13px'
                                }}
                            >
                                {type}
                            </button>
                        ))}
                    </div>

                    <div className={styles.formGrid}>
                        <input className={styles.input} placeholder={formType === 'CRYPTO' ? 'Will BTC/USD be above $100,000 by...' : formType === 'SPORTS' ? 'Team A vs Team B' : 'Will X happen by...?'} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                        <input className={styles.input} placeholder={formType === 'CRYPTO' ? 'Side A (YES)' : formType === 'SPORTS' ? 'Home Team' : 'Yes / Option A'} value={form.sideAName} onChange={(e) => setForm({ ...form, sideAName: e.target.value })} />
                        {(formType === 'SPORTS' || formType === 'POLITICS') && (
                            <input className={styles.input} placeholder="Draw (optional for politics)" value={form.drawName} onChange={(e) => setForm({ ...form, drawName: e.target.value })} />
                        )}
                        <input className={styles.input} placeholder={formType === 'CRYPTO' ? 'Side B (NO)' : formType === 'SPORTS' ? 'Away Team' : 'No / Option B'} value={form.sideBName} onChange={(e) => setForm({ ...form, sideBName: e.target.value })} />
                        <input className={styles.input} type="datetime-local" placeholder="End date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
                    </div>
                    {formType === 'CRYPTO' && (
                        <textarea className={styles.textarea} placeholder="Resolution criteria (optional)" value={form.resolutionCriteria} onChange={(e) => setForm({ ...form, resolutionCriteria: e.target.value })} />
                    )}
                    <button className={styles.button} onClick={handleCreate} disabled={creating}>
                        {creating ? 'Creating...' : `Create ${formType.toLowerCase()} market`}
                    </button>
                </div>

                {/* Approve Creator */}
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

                {/* Resolve Markets */}
                <div className={styles.card}>
                    <div className={styles.sectionTitle}>Resolve Markets</div>
                    {loadingMarkets ? (
                        <div className={styles.muted}>Loading markets...</div>
                    ) : (
                        <div className={styles.list}>
                            {visibleMarkets.map((m, idx) => {
                                const deadline = typeof m.deadline === 'string' ? parseInt(m.deadline, 10) : m.deadline;
                                const deadlinePassed = Date.now() >= deadline * 1000;
                                const isPolitics = m.category === 'POLITICS';
                                const isResolved = m.state === 'RESOLVED';
                                const canResolve = deadlinePassed && !isResolved;

                                return (
                                    <div key={m.contractId || m.id || idx} className={styles.marketRow}>
                                        <div className={styles.marketMeta}>
                                            <div style={{ fontWeight: 700 }}>{m.title}</div>
                                            <div className={styles.muted}>
                                                Deadline: {formatResolutionDate(deadline) ?? '-'} · 
                                                Type: <b>{m.category}</b> · 
                                                State: {m.state}
                                                {isResolved && m.resolvedOutcome && ` · Winner: ${m.resolvedOutcome}`}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            {isPolitics && canResolve && (
                                                <select
                                                    className={styles.input}
                                                    style={{ width: '140px', padding: '8px' }}
                                                    value={resolveOutcome[m.id] || '0'}
                                                    onChange={(e) => setResolveOutcome({ ...resolveOutcome, [m.id]: e.target.value })}
                                                >
                                                    <option value="0">{m.sideAName || 'Side A'}</option>
                                                    <option value="1">{m.drawName || 'Draw'}</option>
                                                    <option value="2">{m.sideBName || 'Side B'}</option>
                                                </select>
                                            )}
                                            <button
                                                className={`${styles.button} ${!canResolve ? styles.muted : ''}`}
                                                onClick={() => handleResolve(m)}
                                                disabled={!canResolve || resolvingId === m.id}
                                                title={!isPolitics && (m.category === 'SPORTS' || m.category === 'CRYPTO') ? 'Auto-resolved by scheduler' : ''}
                                            >
                                                {resolvingId === m.id ? 'Resolving...' : isPolitics ? 'Resolve (Manual)' : 'Resolve'}
                                            </button>
                                        </div>
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
