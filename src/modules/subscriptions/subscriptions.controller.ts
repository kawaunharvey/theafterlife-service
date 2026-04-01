import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { SubscriptionsService } from "./subscriptions.service";

@ApiTags("subscriptions")
@Controller("subscriptions")
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get("lifetime/availability")
  getLifetimeAvailability() {
    return this.subscriptionsService.getLifetimeAvailability();
  }
}
