import { IsEmail, IsString, Length, IsOptional } from "class-validator";

export class VerifyCodeDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(5, 5)
  code!: string;

  @IsOptional()
  @IsString()
  deviceType?: string;

  @IsOptional()
  @IsString()
  deviceName?: string;
}
