import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { AppDataService } from "./app-data.service";
import { UseJwtAuth } from "../auth/decorators/use-jwt-auth.decorator"

@Controller("app-data")
export class AppDataController {
  constructor(private readonly appDataService: AppDataService) {}

  @Get("policies")
  getPolicies() {
    return this.appDataService.getPolicies();
  }

  @Get("demo-user")
  getDemoUserData() {
    return this.appDataService.getDemoUserData();
  }

  @Get("session/check")
  checkSession(@Query("sessionId") sessionId: string) {
    return this.appDataService.checkSession(sessionId);
  }

  @Get("decorators/salutation")
  getSalutationDecorators() {
    return this.appDataService.getSalutationDecorators();
  }

  @Get("decorators/relationship")
  getRelationshipDecorators() {
    return this.appDataService.getRelationshipDecorators();
  }
  
  @Get("decorators/prompt")
  @UseJwtAuth()
  getPromptDecorators() {
    return this.appDataService.getPromptDecorators();
  }

  @Get("decorators/prompt/:id")
  @UseJwtAuth()
  getPromptDecoratorById(@Param("id") id: string) {
    return this.appDataService.getPromptDecoratorById(id);
  }
}
