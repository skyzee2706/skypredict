import { createConfig, http } from 'wagmi';
import { injected, coinbaseWallet } from 'wagmi/connectors';
import { seismicTestnet } from './seismicChain';

export const wagmiConfig = createConfig({
    chains: [seismicTestnet],
    connectors: [
        injected(),
        coinbaseWallet({ appName: 'PM Kit' })
    ],
    transports: {
        [seismicTestnet.id]: http(process.env.NEXT_PUBLIC_RITUAL_RPC_URL || process.env.NEXT_PUBLIC_SEISMIC_RPC_URL || 'https://rpc.ritualfoundation.org')
    }
});
