import { Abi } from 'viem';
import MarketFactoryAbi from './contracts/MarketFactory.json';

export const TOKEN_ADDRESS =
  (process.env.NEXT_PUBLIC_SKYUSD_ADDRESS ||
    '0x0000000000000000000000000000000000000000') as `0x${string}`;

export const FACTORY_ADDRESS =
  (process.env.NEXT_PUBLIC_FACTORY_ADDRESS ||
    '0x0000000000000000000000000000000000000000') as `0x${string}`;

export const FACTORY_ABI = MarketFactoryAbi.abi as unknown as Abi;

export const ROUTER_ADDRESS =
  (process.env.NEXT_PUBLIC_ROUTER_ADDRESS ||
    '0x0000000000000000000000000000000000000000') as `0x${string}`;

export const ROUTER_ABI = [
  {
    type: 'function',
    name: 'placeBet',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'marketAddress', type: 'address', internalType: 'address' },
      { name: 'outcome', type: 'uint8', internalType: 'enum PredictionMarket.Outcome' },
      { name: 'amount', type: 'uint256', internalType: 'uint256' }
    ],
    outputs: []
  }
] as const satisfies Abi;

export const TOKEN_SYMBOL = 'SkyUSD';

export const ERC20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address', internalType: 'address' }],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }]
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address', internalType: 'address' },
      { name: 'amount', type: 'uint256', internalType: 'uint256' }
    ],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }]
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address', internalType: 'address' },
      { name: 'spender', type: 'address', internalType: 'address' }
    ],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }]
  }
] as const satisfies Abi;

export const SKYUSD_DECIMALS = 18;
export const SKYUSD_MULTIPLIER = 1_000_000_000_000_000_000; // 1e18

export const DEPOSIT_FEE = 0.01; // RITUAL
export const DEPOSIT_AMOUNT = 100; // SkyUSD received per 0.01 RITUAL

export const SKYUSD_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address', internalType: 'address' }],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }]
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address', internalType: 'address' },
      { name: 'amount', type: 'uint256', internalType: 'uint256' }
    ],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }]
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address', internalType: 'address' },
      { name: 'spender', type: 'address', internalType: 'address' }
    ],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }]
  },
  {
    type: 'function',
    name: 'deposit',
    stateMutability: 'payable',
    inputs: [],
    outputs: []
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8', internalType: 'uint8' }]
  },
  {
    type: 'function',
    name: 'withdrawFunds',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'recipient', type: 'address', internalType: 'address payable' }],
    outputs: []
  },
  {
    type: 'function',
    name: 'depositBalance',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }]
  },
  {
    type: 'function',
    name: 'owner',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'address' }]
  }
] as const satisfies Abi;
