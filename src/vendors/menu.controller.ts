import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AppContext } from '../auth/decorators/app-context.decorator';
import { AppType } from '../auth/dto/auth-context.dto';
import { MenuService } from './menu.service';

@ApiTags('7. Vendors')
@Controller('vendors/:vendorId/menu')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @AppContext(AppType.VENDOR)
  @Post('categories')
  @ApiOperation({ summary: '[Vendor] Create a menu category' })
  async createCategory(@Param('vendorId') vendorId: string, @Body() data: { name: string }) {
    return this.menuService.createCategory(vendorId, data);
  }

  @Get('categories')
  @ApiOperation({ summary: '[Any Role] Get all menu categories for a vendor' })
  async getCategories(@Param('vendorId') vendorId: string) {
    return this.menuService.getCategories(vendorId);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @AppContext(AppType.VENDOR)
  @Put('categories/:id')
  @ApiOperation({ summary: '[Vendor] Update a menu category' })
  async updateCategory(@Param('id') id: string, @Body() data: { name?: string; isActive?: boolean }) {
    return this.menuService.updateCategory(id, data);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @AppContext(AppType.VENDOR)
  @Delete('categories/:id')
  @ApiOperation({ summary: '[Vendor] Delete a menu category' })
  async deleteCategory(@Param('id') id: string) {
    return this.menuService.deleteCategory(id);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @AppContext(AppType.VENDOR)
  @Post('categories/:categoryId/items')
  @ApiOperation({ summary: '[Vendor] Create a menu item' })
  async createItem(
    @Param('categoryId') categoryId: string,
    @Body() data: { name: string; description?: string; price: number; imageUrl?: string },
  ) {
    return this.menuService.createItem(categoryId, data);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @AppContext(AppType.VENDOR)
  @Put('items/:id')
  @ApiOperation({ summary: '[Vendor] Update a menu item' })
  async updateItem(
    @Param('id') id: string,
    @Body() data: { name?: string; description?: string; price?: number; imageUrl?: string; isAvailable?: boolean },
  ) {
    return this.menuService.updateItem(id, data);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @AppContext(AppType.VENDOR)
  @Delete('items/:id')
  @ApiOperation({ summary: '[Vendor] Delete a menu item' })
  async deleteItem(@Param('id') id: string) {
    return this.menuService.deleteItem(id);
  }

  @Get()
  @ApiOperation({ summary: '[Any Role] Get full vendor menu (active items only)' })
  async getFullMenu(@Param('vendorId') vendorId: string) {
    return this.menuService.getVendorMenu(vendorId);
  }
}
