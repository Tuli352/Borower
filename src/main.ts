import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const reflector = app.get(Reflector);

  // Enable CORS for the React Frontend
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });
  
  app.setGlobalPrefix('api');

  // Enable global validation (class-validator)
  app.useGlobalPipes(new ValidationPipe({
    whitelist: false,
    transform: true,
  }));

  app.useGlobalInterceptors(new TransformInterceptor(reflector));
  app.useGlobalFilters(new HttpExceptionFilter());

  // Configure Swagger API Docs
  const config = new DocumentBuilder()
    .setTitle('Kogi Rider Platform API (v1)')
    .setDescription('Unified API documentation for Customer, Driver, and Vendor apps. Organised by functional categories to simplify mobile integration.')
    .setVersion('1.1')
    .addBearerAuth()
    .build();
    
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  // Start on port 3000
  await app.listen(3000);
}
bootstrap();
