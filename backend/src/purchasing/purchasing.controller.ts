//backend/src/purchasing/purchasing.controller.ts
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ProjectAccessGuard, ProjectParam } from '../common/guards/project-access.guard';
import { PurchasingService } from './purchasing.service';
import { StockService } from './stock.service';
import { CancelOrderDto, CreateDeliveryDto, CreateOrderDto, CreateStockItemDto, CreateStockMovementDto, MovementQueryDto, OrderQueryDto, UpdateStockItemDto } from './dto/purchasing.dto';

/** Commandes, livraisons et stock du chantier. */
@Controller('projects/:projectId')
@UseGuards(ProjectAccessGuard)
@ProjectParam('projectId')
export class PurchasingController {
  constructor(
    private readonly purchasing: PurchasingService,
    private readonly stock: StockService,
  ) {}

  @Get('purchase-orders')
  async listOrders(@Param('projectId', ParseUUIDPipe) projectId: string, @Query() query: OrderQueryDto) {
    return this.purchasing.listOrders(projectId, query);
  }

  @Get('purchase-orders/:id')
  async findOrder(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.purchasing.findOrder(projectId, id);
  }

  @Post('purchase-orders')
  async createOrder(@Param('projectId', ParseUUIDPipe) projectId: string, @Body() dto: CreateOrderDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.purchasing.createOrder(projectId, dto, actor);
  }

  @Post('purchase-orders/:id/cancel')
  async cancelOrder(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelOrderDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.purchasing.cancelOrder(projectId, id, dto, actor);
  }

  @Get('deliveries')
  async listDeliveries(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.purchasing.listDeliveries(projectId);
  }

  @Get('deliveries/:id')
  async findDelivery(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.purchasing.findDelivery(projectId, id);
  }

  @Post('deliveries')
  async createDelivery(@Param('projectId', ParseUUIDPipe) projectId: string, @Body() dto: CreateDeliveryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.purchasing.createDelivery(projectId, dto, actor);
  }

  @Get('stock/items')
  async listItems(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.stock.listItems(projectId);
  }

  @Post('stock/items')
  async createItem(@Param('projectId', ParseUUIDPipe) projectId: string, @Body() dto: CreateStockItemDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.stock.createItem(projectId, dto, actor);
  }

  @Patch('stock/items/:itemId')
  async updateItem(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('itemId', ParseUUIDPipe) itemId: string, @Body() dto: UpdateStockItemDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.stock.updateItem(projectId, itemId, dto, actor);
  }

  @Post('stock/items/:itemId/movements')
  async recordMovement(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('itemId', ParseUUIDPipe) itemId: string, @Body() dto: CreateStockMovementDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.stock.recordMovement(projectId, itemId, dto, actor);
  }

  @Get('stock/movements')
  async listMovements(@Param('projectId', ParseUUIDPipe) projectId: string, @Query() query: MovementQueryDto) {
    return this.stock.listMovements(projectId, query);
  }

  @Get('stock/consumption')
  async consumption(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.stock.consumption(projectId);
  }
}
