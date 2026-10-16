import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadConfig, loadDotEnvIfPresent } from './config/env.js';

async function bootstrap() {
  loadDotEnvIfPresent();
  const { port } = loadConfig();

  const app = await NestFactory.create(AppModule.register());
  app.enableShutdownHooks();
  await app.listen(port);
}
await bootstrap();
