import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  BadRequestException,
} from "@nestjs/common";
import { Response } from "express";

@Catch(BadRequestException)
export class ValidationExceptionFilter implements ExceptionFilter {
  catch(exception: BadRequestException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const exceptionRes = exception.getResponse() as any;

    console.error("[ValidationFilter] Validation error:", {
      statusCode: exception.getStatus(),
      message: exceptionRes.message,
      error: exceptionRes.error,
      requestBody: ctx.getRequest().body,
    });

    response.status(exception.getStatus()).json(exceptionRes);
  }
}
