import { describe, expect, it } from "vitest";
import { LeagueError } from "../domain/errors";
import type { Actor } from "../domain/types";
import { InMemoryLeague } from "./in-memory-league";

/** League role management — the same rules as the database functions (race_league_find_account / race_league_set_staff), exercised through the gateway. */
const superAdmin: Actor = { id: "su", isSuperAdmin: true, roles: [] };
const creator: Actor = { id: "creator", isSuperAdmin: false, roles: ["LEAGUE_ADMIN"] };
const plain: Actor = { id: "plain", isSuperAdmin: false, roles: [] };
const judge: Actor = { id: "judge", isSuperAdmin: false, roles: ["JUDGE"] };

async function rejects(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof LeagueError && e.code === code);
}
const acct = (id: string, extra: Partial<InMemoryLeague["state"]["accounts"][number]> = {}) => ({ id, email: `${id}@example.test`, fullName: id, active: true, emailConfirmed: true, banned: false, ...extra });

async function setup() {
  const l = new InMemoryLeague(creator, () => new Date("2026-11-04T12:00:00Z"));
  l.state.accounts.push(acct("creator"), acct("owner1"), acct("owner2"), acct("plain"), acct("judge"), acct("unconfirmed", { emailConfirmed: false }), acct("inactive", { active: false }), acct("banned", { banned: true }));
  const s = await l.createSeason({ slug: "roles-season", name: "Roles", startsOn: "2026-11-02", endsOn: "2026-12-27" });
  await l.setSeasonStatus(s, "scheduled");
  return { l, s };
}
const appoint = (l: InMemoryLeague, seasonId: string, profileId: string, role: "LEAGUE_ADMIN" | "JUDGE" | "REVIEWER" = "LEAGUE_ADMIN", active = true, reason = "approved for the pilot") =>
  l.setStaff({ seasonId, profileId, role, active, reason });

describe("account lookup", () => {
  it("is for a Super Admin only, exact, case-insensitive, and never grants anything", async () => {
    const { l, s } = await setup();
    for (const who of [creator, plain, judge, null]) await rejects(l.as(who).findAccount("owner1@example.test"), "LEAGUE_FORBIDDEN");
    l.as(superAdmin);
    expect(await l.findAccount("  OWNER1@Example.Test ")).toMatchObject({ found: true, id: "owner1", emailConfirmed: true });
    expect(await l.findAccount("ghost@example.test")).toEqual({ found: false });
    expect(await l.findAccount("%@example.test")).toEqual({ found: false });
    await rejects(l.findAccount("not an address"), "LEAGUE_INVALID");
    expect((await l.as(creator).overview(s)).staff?.some((x) => x.profileId === "owner1")).toBe(false); // a lookup appointed nobody
  });
});

describe("appointing and removing", () => {
  it("only a Super Admin appoints or removes league administrators; nobody promotes themselves", async () => {
    const { l, s } = await setup();
    for (const who of [plain, judge, creator, null]) {
      await rejects(l.as(who).setStaff({ seasonId: s, profileId: who?.id ?? "x", role: "LEAGUE_ADMIN", active: true, reason: "self" }), "LEAGUE_FORBIDDEN");
      await rejects(l.as(who).setStaff({ seasonId: s, profileId: "owner1", role: "LEAGUE_ADMIN", active: true, reason: "x" }), "LEAGUE_FORBIDDEN");
    }
    await rejects(l.as(plain).setStaff({ seasonId: s, profileId: "plain", role: "JUDGE", active: true, reason: "self" }), "LEAGUE_FORBIDDEN");
    await rejects(l.as(judge).setStaff({ seasonId: s, profileId: "judge", role: "REVIEWER", active: true, reason: "self" }), "LEAGUE_FORBIDDEN");
    expect((await l.as(creator).overview(s)).staff?.filter((x) => x.role === "LEAGUE_ADMIN")).toHaveLength(1); // still only the creator
  });
  it("refuses a missing account, a missing season, an invented role, a missing reason, an unconfirmed, a deactivated and a banned account", async () => {
    const { l, s } = await setup();
    l.as(superAdmin);
    await rejects(appoint(l, s, "ghost"), "LEAGUE_NOT_FOUND");
    await rejects(appoint(l, "no-season", "owner1"), "LEAGUE_NOT_FOUND");
    await rejects(l.setStaff({ seasonId: s, profileId: "owner1", role: "OWNER" as never, active: true, reason: "x" }), "LEAGUE_INVALID");
    await rejects(l.setStaff({ seasonId: s, profileId: "", role: "LEAGUE_ADMIN", active: true, reason: "x" }), "LEAGUE_INVALID");
    await rejects(appoint(l, s, "owner1", "LEAGUE_ADMIN", true, "   "), "LEAGUE_REASON_REQUIRED");
    await rejects(appoint(l, s, "unconfirmed"), "LEAGUE_INVALID");
    await rejects(appoint(l, s, "inactive"), "LEAGUE_INVALID");
    await rejects(appoint(l, s, "banned"), "LEAGUE_INVALID");
  });
  it("is idempotent: repeating a request changes nothing and writes no second audit entry", async () => {
    const { l, s } = await setup();
    l.as(superAdmin);
    expect(await appoint(l, s, "owner1")).toEqual({ changed: true, administrators: 2 });
    const audits = l.state.audit.length;
    expect(await appoint(l, s, "owner1")).toEqual({ changed: false, administrators: 2 });
    expect(l.state.audit).toHaveLength(audits);
    expect(l.state.staff.filter((x) => x.profileId === "owner1")).toHaveLength(1);
    expect(await appoint(l, s, "plain", "LEAGUE_ADMIN", false)).toMatchObject({ changed: false }); // removing someone who never held the role
  });
  it("records actor, target, role, reason and season for every change", async () => {
    const { l, s } = await setup();
    l.as(superAdmin);
    await appoint(l, s, "owner1", "LEAGUE_ADMIN", true, "second independent administrator");
    const line = l.state.audit.find((x) => x.action === "league.staff.appoint");
    expect(line).toMatchObject({ actor: "su", seasonId: s, metadata: { target: "owner1", role: "LEAGUE_ADMIN", reason: "second independent administrator" } });
  });
  it("two administrators are required to go live, and a live season never drops below two", async () => {
    const { l, s } = await setup();
    await rejects(l.as(creator).setSeasonStatus(s, "active"), "LEAGUE_INVALID");
    await rejects(l.as(creator).setPublished(s, true, "preview"), "LEAGUE_INVALID");
    await appoint(l.as(superAdmin), s, "owner1");
    await l.as(creator).setSeasonStatus(s, "active");
    await rejects(appoint(l.as(superAdmin), s, "owner1", "LEAGUE_ADMIN", false), "LEAGUE_INVALID"); // the last required administrator
    await rejects(appoint(l, s, "creator", "LEAGUE_ADMIN", false), "LEAGUE_INVALID");
    expect((await l.overview(s)).staff?.filter((x) => x.role === "LEAGUE_ADMIN" && x.active)).toHaveLength(2); // a refused removal left everything as it was
    await appoint(l, s, "owner2");
    expect(await appoint(l, s, "owner1", "LEAGUE_ADMIN", false, "handover complete")).toEqual({ changed: true, administrators: 2 });
    await appoint(l, s, "owner1", "LEAGUE_ADMIN", true, "re-appointed");
  });
  it("a removed administrator loses access at once; a season administrator manages judges and reviewers only", async () => {
    const { l, s } = await setup();
    await appoint(l.as(superAdmin), s, "owner1");
    const owner1: Actor = { id: "owner1", isSuperAdmin: false, roles: [] };
    await expect(l.as(owner1).overview(s)).resolves.toBeTruthy();
    await appoint(l.as(superAdmin), s, "owner2");
    await appoint(l, s, "owner1", "LEAGUE_ADMIN", false);
    await rejects(l.as(owner1).overview(s), "LEAGUE_FORBIDDEN");
    expect(await appoint(l.as(creator), s, "judge", "JUDGE", true, "roster")).toMatchObject({ changed: true });
    await rejects(appoint(l.as(plain), s, "judge", "REVIEWER"), "LEAGUE_FORBIDDEN");
  });
  it("a completed season's staff is final", async () => {
    const { l, s } = await setup();
    await appoint(l.as(superAdmin), s, "owner1");
    await l.as(creator).setSeasonStatus(s, "active");
    await l.setSeasonStatus(s, "completed");
    await rejects(appoint(l.as(superAdmin), s, "owner2"), "LEAGUE_SEASON_LOCKED");
  });
  it("the overview shows a name and a masked hint, never the full address, and tells only a Super Admin so", async () => {
    const { l, s } = await setup();
    await appoint(l.as(superAdmin), s, "owner1");
    const o = await l.as(creator).overview(s);
    expect(JSON.stringify(o)).not.toContain("owner1@example.test");
    expect(o.staff?.find((x) => x.profileId === "owner1")).toMatchObject({ fullName: "owner1", emailHint: "o***@example.test" });
    expect(o.isSuperAdmin).toBe(false);
    expect((await l.as(superAdmin).overview(s)).isSuperAdmin).toBe(true);
  });
});
