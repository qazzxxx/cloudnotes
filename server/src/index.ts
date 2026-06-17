import { createApp } from './app';
import { env } from './config/env';

const app = createApp();

const server = app.listen(env.port, () => {
  console.log(`
  ☁️  云简 CloudNote
     └─ API    http://localhost:${env.port}/api
     └─ Root   ${env.rootSpace}
     └─ Auth   ${env.authEnabled ? '已开启 (NAS_PASSWORD)' : '开放模式 (未设置 NAS_PASSWORD)'}
`);
});

// 优雅退出
const shutdown = (signal: string) => {
  console.log(`\n  ${signal} received, shutting down...`);
  server.close(() => process.exit(0));
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
