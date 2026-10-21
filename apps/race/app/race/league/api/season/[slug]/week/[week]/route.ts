import { leaguePublicApi } from "../../../../../../../../src/server/league-public-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { slug: string; week: string } }): Promise<Response> {
  return leaguePublicApi("results", req, { slug: params.slug, week: params.week });
}
