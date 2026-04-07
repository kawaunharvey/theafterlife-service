import { IsNotEmpty, IsString } from "class-validator";

export class ReferWaitlistDto {
  @IsString()
  @IsNotEmpty()
  id: string;
}
