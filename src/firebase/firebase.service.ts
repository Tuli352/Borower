import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);

  onModuleInit() {
    const serviceAccountPath = join(process.cwd(), 'firebase-service-account.json');
    if (existsSync(serviceAccountPath)) {
      try {
        const fileContent = readFileSync(serviceAccountPath, 'utf8');
        // Handle empty file edge case
        if (!fileContent.trim()) {
           this.logger.warn('firebase-service-account.json is empty. Firebase Admin skipped.');
           return;
        }

        const serviceAccount = JSON.parse(fileContent);
        if (!admin.apps.length) {
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
          });
          this.logger.log('Firebase Admin initialized successfully');
        }
      } catch (error: any) {
        this.logger.error(`Failed to initialize Firebase Admin: ${error.message}`);
      }
    } else {
      this.logger.warn('firebase-service-account.json not found');
    }
  }

  getAuth() {
    return admin.auth();
  }
}
