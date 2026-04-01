import { IsLatitude, IsLongitude } from "class-validator";

export class ReverseLocationDto {
  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;
}
