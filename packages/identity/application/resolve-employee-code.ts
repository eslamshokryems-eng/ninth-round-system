import type { Result, UseCase } from "@9thround/shared-kernel";
import type { AuthPort } from "../domain/auth-port";

/** Backs the web login page's "type an Employee ID, resolve it to an email, then sign in with the existing email+password flow unchanged" step. */
export class ResolveEmployeeCodeUseCase implements UseCase<string, string | null> {
  constructor(private readonly authPort: AuthPort) {}

  async execute(employeeCode: string): Promise<Result<string | null>> {
    return this.authPort.resolveEmployeeCode(employeeCode);
  }
}
