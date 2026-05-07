const mongoose = require('mongoose');
const redis = require('redis');
const fs = require('fs');

const MONGODB_URI = 'mongodb://localhost:27017/fanzone';
const REDIS_URL = 'redis://localhost:6379';
const NUM_MESSAGES = 10000;

const benchmarkSchema = new mongoose.Schema({ content: String, timestamp: Date });
const BenchMsg = mongoose.model('BenchMsg', benchmarkSchema);

async function runBenchmark() {
  console.log(`Starting Benchmark: Inserting ${NUM_MESSAGES} messages...`);

  await mongoose.connect(MONGODB_URI);
  const redisClient = redis.createClient({ url: REDIS_URL });
  await redisClient.connect();

  await BenchMsg.deleteMany({});
  await redisClient.del('bench_list');

  console.log('Testing MongoDB...');
  const mongoStart = Date.now();
  const mongoPromises = [];
  for (let i = 0; i < NUM_MESSAGES; i++) {
    mongoPromises.push(BenchMsg.create({ content: `Msg ${i}`, timestamp: new Date() }));
  }
  await Promise.all(mongoPromises);
  const mongoEnd = Date.now();
  const mongoTime = mongoEnd - mongoStart;
  console.log(`MongoDB Time: ${mongoTime}ms`);

  console.log('Testing Redis...');
  const redisStart = Date.now();
  const redisPromises = [];
  for (let i = 0; i < NUM_MESSAGES; i++) {
    redisPromises.push(redisClient.lPush('bench_list', JSON.stringify({ content: `Msg ${i}`, timestamp: new Date() })));
  }
  await Promise.all(redisPromises);
  const redisEnd = Date.now();
  const redisTime = redisEnd - redisStart;
  console.log(`Redis Time: ${redisTime}ms`);

  const mongoOps = Math.round((NUM_MESSAGES / mongoTime) * 1000);
  const redisOps = Math.round((NUM_MESSAGES / redisTime) * 1000);

  console.log('\n--- Results ---');
  console.log(`MongoDB: ${mongoOps} ops/sec`);
  console.log(`Redis: ${redisOps} ops/sec`);

  const csvContent = `Database,TimeMs,OperationsPerSecond\nMongoDB,${mongoTime},${mongoOps}\nRedis,${redisTime},${redisOps}`;
  fs.writeFileSync('./benchmarks/results.csv', csvContent);
  console.log('Results saved to ./benchmarks/results.csv');

  const jsonContent = {
    messages_inserted: NUM_MESSAGES,
    mongodb: { time_ms: mongoTime, ops_per_sec: mongoOps },
    redis: { time_ms: redisTime, ops_per_sec: redisOps }
  };
  fs.writeFileSync('./benchmarks/results.json', JSON.stringify(jsonContent, null, 2));
  console.log('Results saved to ./benchmarks/results.json');

  await mongoose.disconnect();
  await redisClient.disconnect();
  process.exit(0);
}

runBenchmark().catch(console.error);
