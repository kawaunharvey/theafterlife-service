import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { BusinessesService } from "./businesses.service";
import {
  ListBusinessesDto,
  BusinessParamsDto,
} from "./dto/list-businesses.dto";
import { UpdateBusinessDto } from "./dto/update-business.dto";
import { UpsertBusinessDto } from "./dto/upsert-from-crownworks.dto";

@Controller("businesses")
export class BusinessesController {
  constructor(private readonly businessesService: BusinessesService) {}

  @Post("upsert")
  async upsertFromCrownworks(@Body() body: UpsertBusinessDto) {
    return this.businessesService.upsertFromCrownworks(body);
  }

  @Get()
  async list(@Query() query: ListBusinessesDto) {
    return this.businessesService.listBusinesses(query);
  }

  @Get(":id")
  async getById(@Param() params: BusinessParamsDto) {
    return this.businessesService.getBusinessProfile(params.id);
  }

  @Patch(":id")
  async updateBusiness(
    @Param() params: BusinessParamsDto,
    @Body() body: UpdateBusinessDto,
  ) {
    return this.businessesService.updateBusiness(params.id, body);
  }
}
