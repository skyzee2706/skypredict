import * as dotenv from 'dotenv';
dotenv.config();

import { ethers } from 'ethers';

const RPC_URL = process.env.SEISMIC_RPC_URL || 'https://gcp-1.seismictest.net/rpc';
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
const FACTORY_ADDRESS = (process.env.FACTORY_ADDRESS || process.env.NEXT_PUBLIC_FACTORY_ADDRESS || process.env.NEXT_PUBLIC_BET_FACTORY_ADDRESS) as string;

if (!PRIVATE_KEY || !FACTORY_ADDRESS) {
  console.error('Missing required env vars: PRIVATE_KEY / FACTORY_ADDRESS');
  process.exit(1);
}

const FACTORY_ABI = ['function getAllMarkets() external view returns (address[])'];
const MARKET_ABI = [
  'function strikePrice() external view returns (uint256)',
  'function resolved() external view returns (bool)',
  'function resolveWithCustomPrice(uint256 price) external',
  'function question() external view returns (string)'
];

const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(PRIVATE_KEY, provider);

async function main() {
  console.log('Force resolving ALL unresolved markets...');
  const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, signer);
  const allMarkets = (await factory.getAllMarkets()) as string[];
  console.log(`Found ${allMarkets.length} total markets.`);

  for (const addr of allMarkets) {
    try {
      const market = new ethers.Contract(addr, MARKET_ABI, signer);
      const isResolved = await market.resolved();
      if (!isResolved) {
        const question = await market.question();
        const strikePrice = await market.strikePrice(); // Resolve with exactly strike price, or slightly above
        
        // Resolve with strike + 1 so YES wins, or keep it simple. Let's just resolve with strikePrice + 1000 so it resolves to YES
        const resolvePrice = BigInt(strikePrice) + 100n; 
        console.log(`Resolving market: ${question} at ${resolvePrice.toString()}`);
        
        const feeData = await provider.getFeeData();
        const data = market.interface.encodeFunctionData('resolveWithCustomPrice', [resolvePrice]);
        const txReq: any = { to: market.target, data: data, gasLimit: 400_000n };
        if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
          txReq.maxFeePerGas = feeData.maxFeePerGas;
          txReq.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
        } else if (feeData.gasPrice) {
          txReq.gasPrice = feeData.gasPrice;
        }
        
        const tx = await signer.sendTransaction(txReq);
        await tx.wait();
        console.log(`Successfully resolved ${addr}`);
      }
    } catch (e: any) {
      console.error(`Error resolving ${addr}:`, e.message);
    }
  }
  console.log('Done!');
}

main().catch(console.error);
