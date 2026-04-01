import { Memorial } from "@prisma/client"
import { IsArray, IsNumber, IsOptional, IsString } from "class-validator"

export class CreateMemorialDto {
    @IsString()
    displayName: Memorial["displayName"];

    @IsNumber()
    yearOfBirth?: Memorial["yearOfBirth"];

    @IsNumber()
    yearOfPassing?: Memorial["yearOfPassing"];

    @IsString()
    salutationDecoratorId?: Memorial["salutationDecoratorId"];

    @IsString()
    visibility: Memorial["visibility"];

    @IsString()
    status: Memorial["status"];

    @IsString()
    theme: Memorial["theme"];

    @IsArray()
    tags: Memorial["tags"];

}


export class UpdateMemorialDto {
    @IsString()
    @IsOptional()
    displayName?: Memorial["displayName"];

    @IsNumber()
    @IsOptional()
    yearOfBirth?: Memorial["yearOfBirth"];

    @IsNumber()
    @IsOptional()
    yearOfPassing?: Memorial["yearOfPassing"];

    @IsString()
    @IsOptional()
    coverAssetUrl?: Memorial["coverAssetUrl"];

    @IsString()
    @IsOptional()
    coverAssetId?: Memorial["coverAssetId"];

    @IsString()
    @IsOptional()
    salutationDecoratorId?: Memorial["salutationDecoratorId"];

    @IsString()
    @IsOptional()
    visibility?: Memorial["visibility"];

    @IsString()
    @IsOptional()
    status?: Memorial["status"];

    @IsString()
    @IsOptional()
    theme?: Memorial["theme"];

    @IsArray()
    @IsOptional()
    tags?: Memorial["tags"];
}
