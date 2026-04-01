import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export type CurrentUserPayload = {
  sub?: string;
  email?: string;
  roles?: string[];
  jti?: string;
  [key: string]: unknown;
};

export const CurrentUser = createParamDecorator(
  (data: keyof CurrentUserPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as CurrentUserPayload | undefined;

    if (!data) {
      return user;
    }

    return user?.[data];
  },
);
