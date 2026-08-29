import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';

@ApiTags('Admin Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({ summary: '[Admin] Create a new Admin User' })
  @ApiBody({ schema: { type: 'object', properties: { email: { type: 'string' }, password: { type: 'string' }, name: { type: 'string' } } } })
  @Post('admin')
  createAdmin(@Body() createData: any) {
    return this.usersService.createAdmin(createData);
  }

  @ApiOperation({ summary: '[Admin] Get all Admin Users' })
  @Get('admin')
  findAllAdmins() {
    return this.usersService.findAll();
  }
}
