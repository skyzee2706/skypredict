const {createPublicClient,http,parseAbiItem,decodeEventLog}=require('viem');
const client=createPublicClient({transport:http('https://rpc.ritualfoundation.org')});
const factory='0xCCC9B7eC20fA8e017273518e7D5A5b361AA3D55F';
const abi=[{type:'function',name:'getAllMarkets',stateMutability:'view',inputs:[],outputs:[{type:'address[]'}]}];
(async()=>{
 const markets=await client.readContract({address:factory,abi,functionName:'getAllMarkets'});
 const logs=await client.getLogs({address:markets,fromBlock:14600000n,toBlock:14699999n});
 console.log('raw logs',logs.length);
 const ev=parseAbiItem('event BetPlaced(address indexed user, uint8 outcome, uint256 amount, uint256 ethFeePaid)');
 for(const l of logs.slice(0,30)){
  console.log('LOG', l.address,l.topics,l.data);
  try{console.log('DECODE', decodeEventLog({abi:[ev],topics:l.topics,data:l.data}))}catch(e){}
 }
})().catch(e=>{console.error(e);process.exit(1)});
