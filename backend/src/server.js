import mongoose from 'mongoose';
import { assertProductionConfig, config } from './config.js';
import { createApp } from './app.js';
import { getRecommender } from './ml/recommender.js';
import { createFirebase } from './services/firebase.js';

assertProductionConfig();

const t0 = performance.now();
const recommender = getRecommender(config.modelDir);
console.log(`Model ${recommender.meta.version}: ${recommender.n} movies × ${recommender.dim} dims loaded in ${(performance.now() - t0).toFixed(0)} ms`);

await mongoose.connect(config.mongoUri, { maxPoolSize: 20, serverSelectionTimeoutMS: 10_000 });
console.log('MongoDB connected');

const firebase = createFirebase();
console.log(`Sign-in: Identity Platform project "${config.firebase.projectId}"${config.firebase.emulatorHost ? ` via emulator at ${config.firebase.emulatorHost}` : ''}`);

const server = createApp({ recommender, firebase }).listen(config.port, () => {
  console.log(`MovieMatch API listening on http://localhost:${config.port}`);
});

// Cloud Run sends SIGTERM before stopping an instance.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
