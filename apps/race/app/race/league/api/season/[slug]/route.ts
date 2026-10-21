import { leaguePublicApi } from "../../../../../../src/server/league-public-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { slug: string } }): Promise<Response> {
  return leaguePublicApi("season", req, { slug: params.slug });
}
