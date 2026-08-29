import { Module } from '@nestjs/common';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';
import { MenuController } from './menu.controller';
import { MenuService } from './menu.service';

@Module({
  controllers: [VendorsController, MenuController],
  providers: [VendorsService, MenuService],
  exports: [VendorsService, MenuService]
})
export class VendorsModule {}
