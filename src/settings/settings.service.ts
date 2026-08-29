import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const settings = await this.prisma.setting.findMany();
    const formatted: Record<string, string> = {};
    for (const s of settings) {
      formatted[s.key] = s.value;
    }
    return formatted;
  }

  async update(settingsDto: Record<string, string>) {
    const promises = Object.entries(settingsDto).map(([key, value]) => {
      // Convert to string to ensure safe database schema writing
      const strValue = typeof value === 'string' ? value : String(value);
      return this.prisma.setting.upsert({
        where: { key },
        update: { value: strValue },
        create: { key, value: strValue },
      });
    });
    
    await Promise.all(promises);
    return { success: true };
  }
}
