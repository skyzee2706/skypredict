import { createConfig } from '@privy-io/wagmi';
import { http } from 'wagmi';
import { seismicTestnet } from './seismicChain';

export const wagmiConfig = createConfig({
    chains: [seismicTestnet],
    transports: {
        [seismicTestnet.id]: http(process.env.NEXT_PUBLIC_RITUAL_RPC_URL || 'https://rpc.ritualfoundation.org')
    }
});

declare module 'wagmi' {
    interface Register {
        config: typeof wagmiConfig;
    }
}
