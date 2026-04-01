import { IsOptional, IsString, MaxLength } from "class-validator";

export class SubmitClaimDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  claimReason?: string;
}

export class ClaimDecisionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  decisionNotes?: string;
}

export class ClaimIdDto {
  @IsString()
  claimId!: string;
}
