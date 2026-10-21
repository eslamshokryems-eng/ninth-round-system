import { leaguePublicApi } from "../../../../../../../../src/server/league-public-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { slug: string; publicId: string } }): Promise<Response> {
  return leaguePublicApi("athlete", req, { slug: params.slug, publicId: params.publicId });
}
