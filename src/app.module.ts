import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RidersModule } from './riders/riders.module';
import { CustomersModule } from './customers/customers.module';
import { VendorsModule } from './vendors/vendors.module';
import { PaymentsModule } from './payments/payments.module';
import { SupportModule } from './support/support.module';
import { SearchModule } from './search/search.module';
import { SettingsModule } from './settings/settings.module';
import { BroadcastModule } from './broadcast/broadcast.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { OrdersModule } from './orders/orders.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { NotificationsModule } from './notifications/notifications.module';
import { TrackingModule } from './tracking/tracking.module';
import { SmsModule } from './sms/sms.module';
import { FirebaseModule } from './firebase/firebase.module';
import { MessagesModule } from './messages/messages.module';
import { DispatchModule } from './dispatch/dispatch.module';
import { PricingModule } from './pricing/pricing.module';
import { SafetyModule } from './safety/safety.module';
import { PromosModule } from './promos/promos.module';
import { DisputeModule } from './disputes/dispute.module';
import { RouteOptimizationModule } from './services/route-optimization.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { RidePreferencesModule } from './preferences/ride-preferences.module';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { RedisModule } from './redis/redis.module';
import { LocationModule } from './location/location.module';
import { LogisticsModule } from './logistics/logistics.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { FamilyModule } from './family/family.module';
import { SharedRidesModule } from './shared-rides/shared-rides.module';
import { FleetModule } from './fleet/fleet.module';
import { InterStateModule } from './inter-state/inter-state.module';
import { ParcelsModule } from './parcels/parcels.module';
import { CorporateModule } from './corporate/corporate.module';
import { AiMonitoringModule } from './ai-monitoring/ai-monitoring.module';
import { TransportCompaniesModule } from './transport-companies/transport-companies.module';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    PrismaModule,
    RedisModule,
    AuthModule,
    UsersModule,
    RidersModule,
    CustomersModule,
    VendorsModule,
    PaymentsModule,
    SupportModule,
    SearchModule,
    SettingsModule,
    BroadcastModule,
    WebhooksModule,
    OrdersModule,
    DashboardModule,
    NotificationsModule,
    TrackingModule,
    SmsModule,
    FirebaseModule,
    MessagesModule,
    DispatchModule,
    PricingModule,
    SafetyModule,
    PromosModule,
    DisputeModule,
    RouteOptimizationModule,
    AnalyticsModule,
    RidePreferencesModule,
    LoyaltyModule,
    LocationModule,
    LogisticsModule,
    SubscriptionsModule,
    FamilyModule,
    SharedRidesModule,
    FleetModule,
    InterStateModule,
    ParcelsModule,
    CorporateModule,
    AiMonitoringModule,
    TransportCompaniesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
