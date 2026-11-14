import { describe, expect, it } from 'vitest';
import { loadContent } from '@dead-sector/content';
import {
  buildUpgrade,
  campaignDeadline,
  carryOver,
  endDay,
  GameSimulation,
  migrateCampaign,
  missionModifiers,
  newCampaign,
  operationReinforcements,
  siegeThreshold,
  upgradeBlockReason,
  type CampaignState,
} from '../src';

const content = loadContent();
const def = content.campaigns['ferrugem']!;
const up = (id: string) => def.upgrades.find((u) => u.id === id)!;

/** A campaign with enough stock to build anything. */
function rich(difficulty = 'normal'): CampaignState {
  const c = newCampaign(content, 'ferrugem', 9, difficulty);
  c.stock = { food: 60, medicine: 5, ammo: 200, parts: 20 };
  return c;
}

describe('shelter upgrades', () => {
  it('cost the stock once, do not take the day and cannot be built twice', () => {
    const c = rich();
    const next = buildUpgrade(content, c, 'horta')!;
    expect(next.upgrades).toEqual(['horta']);
    expect(next.stock.parts).toBe(c.stock.parts - up('horta').cost.parts);
    expect(next.stock.food).toBe(c.stock.food - up('horta').cost.food);
    expect(next.operatedToday).toBe(false);
    expect(next.lastReport.at(-1)).toEqual({ kind: 'built', upgrade: 'horta' });
    expect(upgradeBlockReason(content, next, 'horta')).toBe('built');
    expect(buildUpgrade(content, next, 'horta')).toBeNull();
    const poor = { ...newCampaign(content, 'ferrugem', 9), stock: { ...c.stock, parts: 1 } };
    expect(upgradeBlockReason(content, poor, 'muro')).toBe('cost');
    expect(upgradeBlockReason(content, c, 'nope')).toBe('unknown');
  });

  it('the garden feeds the shelter every night', () => {
    const c = buildUpgrade(content, rich(), 'horta')!;
    const plain = endDay(content, rich()).campaign;
    const fed = endDay(content, c).campaign;
    // two harvested, minus what the patch cost to plant
    expect(fed.stock.food - plain.stock.food).toBe(2 - up('horta').cost.food);
    expect(fed.lastReport).toContainEqual({ kind: 'harvest', food: 2 });
  });

  it('the infirmary heals more at night', () => {
    const hurt = (c: CampaignState) => {
      c.roster[0]!.health = 20;
      return c;
    };
    const plain = endDay(content, hurt(rich())).campaign.roster[0]!.health;
    const cared = endDay(content, hurt(buildUpgrade(content, rich(), 'enfermaria')!)).campaign
      .roster[0]!.health;
    expect(cared).toBeGreaterThan(plain);
  });

  it('the workshop sends one more plank kit with every squad', () => {
    const c = buildUpgrade(content, rich(), 'oficina')!;
    const mods = missionModifiers(content, c, 'ferrugem');
    expect(mods.barricadeKitBonus).toBe(1);
    const sim = GameSimulation.create(
      'a-ultima-farmacia',
      undefined,
      content,
      carryOver(c),
      1,
      mods,
    );
    expect(sim.state.squads.map((s) => s.barricadeKits)).toEqual([3, 3]);
    expect(missionModifiers(content, rich(), 'ferrugem').barricadeKitBonus).toBe(0);
  });

  it('reinforced walls raise the siege later and lose fewer people in a breach', () => {
    const siege = def.siege!;
    const walled = buildUpgrade(content, rich(), 'muro')!;
    expect(siegeThreshold(content, walled)).toBe(siege.raisedFrom + 15);
    walled.sectors['abrigo']!.infestation = siege.raisedFrom + 5;
    expect(endDay(content, walled).campaign.siegePending).toBe(false);

    const open = rich();
    open.siegePending = true;
    const brick = buildUpgrade(content, rich(), 'muro')!;
    brick.siegePending = true;
    const lostOpen = open.population - endDay(content, open).campaign.population;
    const lostBrick = brick.population - endDay(content, brick).campaign.population;
    expect(lostOpen).toBe(siege.breachLoss);
    expect(lostBrick).toBe(siege.breachLoss - 2);
  });
});

describe('campaign difficulties', () => {
  it('change the starting stock, the deadline, the growth and the reinforcements', () => {
    const easy = newCampaign(content, 'ferrugem', 4, 'facil');
    const normal = newCampaign(content, 'ferrugem', 4);
    const hard = newCampaign(content, 'ferrugem', 4, 'dificil');
    expect(easy.stock.food).toBeGreaterThan(normal.stock.food);
    expect(hard.stock.ammo).toBeLessThan(normal.stock.ammo);
    expect([easy, normal, hard].map((c) => campaignDeadline(content, c))).toEqual([14, 12, 10]);
    expect(operationReinforcements(content, hard, 'ferrugem')).toBeGreaterThan(
      operationReinforcements(content, normal, 'ferrugem'),
    );
    // the avenue grows by itself: faster on hard
    const grown = (c: CampaignState) =>
      endDay(content, c).campaign.sectors['mercadao']!.infestation;
    expect(grown(hard)).toBeGreaterThan(grown(easy));
  });

  it('the deadline follows the difficulty', () => {
    const hard = newCampaign(content, 'ferrugem', 4, 'dificil');
    hard.day = 10;
    const end = endDay(content, hard).campaign;
    expect(end.status).toBe('lost');
    expect(end.endReason).toEqual({ kind: 'deadline' });
    const normal = newCampaign(content, 'ferrugem', 4);
    normal.day = 10;
    expect(endDay(content, normal).campaign.status).toBe('active');
  });

  it('version 5 saves play on normal with no upgrades', () => {
    const c = newCampaign(content, 'ferrugem', 4) as Partial<CampaignState>;
    delete c.difficultyId;
    delete c.upgrades;
    const back = migrateCampaign(content, { ...c, version: 5 })!;
    expect(back.version).toBe(6);
    expect(back.difficultyId).toBe('normal');
    expect(back.upgrades).toEqual([]);
  });
});
