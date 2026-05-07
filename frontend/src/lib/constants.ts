import { Abi } from 'viem';
import MarketFactoryAbi from './contracts/MarketFactory.json';

export const TOKEN_ADDRESS =
  (process.env.NEXT_PUBLIC_SKYUSD_ADDRESS ||
    process.env.NEXT_PUBLIC_TOKEN_ADDRESS ||
    process.env.NEXT_PUBLIC_USDL_ADDRESS ||
    '0xFb756Aa348c59424ED3D5f820C7b4790cd176eED') as `0x${string}`;

export const FACTORY_ADDRESS =
  (process.env.NEXT_PUBLIC_FACTORY_ADDRESS ||
    process.env.NEXT_PUBLIC_BET_FACTORY_ADDRESS ||
    '0x0000000000000000000000000000000000000000') as `0x${string}`;

export const FACTORY_ABI = MarketFactoryAbi.abi as unknown as Abi;

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

export const SKYUSD_DECIMALS = 6;
export const SKYUSD_MULTIPLIER = 1_000_000;

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
    name: 'faucet',
    stateMutability: 'payable',
    inputs: [{ name: 'recipient', type: 'address', internalType: 'address' }],
    outputs: []
  },
  {
    type: 'function',
    name: 'cooldownRemaining',
    stateMutability: 'view',
    inputs: [{ name: 'recipient', type: 'address', internalType: 'address' }],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }]
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
    name: 'withdrawFees',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'recipient', type: 'address', internalType: 'address' }],
    outputs: []
  },
  {
    type: 'function',
    name: 'faucetFeeBalance',
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
  },
  {
    type: 'function',
    name: 'claimsRemaining',
    stateMutability: 'view',
    inputs: [{ name: 'recipient', type: 'address', internalType: 'address' }],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }]
  }
] as const satisfies Abi;

// Backward-compatible aliases used by existing components.
export const USDL_ADDRESS = TOKEN_ADDRESS;
export const MOCK_USDL_ABI = SKYUSD_ABI;
export const USDL_DECIMALS = SKYUSD_DECIMALS;
export const USDL_MULTIPLIER = SKYUSD_MULTIPLIER;
