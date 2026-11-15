import type { SimContext } from '../world';
import { despawn } from '../world';
import { startWardenScene } from '../cutscenes/warden';
import { ensureChains, ensureMech } from './mech';
import { ensureGarrison } from './soldiers';

/**
 * The Underworld route's story beats (M6). The barricade is torn down when
 * its health runs out, which opens the tunnel to the Asphodel Fields.
 */
export function updateRoute(ctx: SimContext, defeated: ReadonlyArray<{ entityId: string; by: string | null }>): void {
  if (!ctx.isAuthority) return;
  const { world } = ctx;
  // The humans' garrison holds the fields beyond the grotto.
  if (world.flags.descended && !world.flags.garrisonPlaced) ensureGarrison(ctx);
  // Cerberus Mk. II keeps watch at the Gates (M7; older saves get it on load).
  if (world.flags.descended && !world.flags.mechPlaced) ensureMech(ctx);
  if (world.flags.mechPlaced && !world.flags.cerberusFreed && world.tick % 30 === 0) ensureChains(ctx);
  // A save where the Mk. II fell before the Warden existed: he climbs out now.
  if (world.flags.mechPlaced && !world.flags.wardenEmerged && !world.flags.cerberusFreed && !world.cutscene) {
    const mech = Object.values(world.entities).find((e) => e.mech?.mode === 'down');
    if (mech) startWardenScene(ctx, mech.id);
  }
  if (world.flags.barricadeBroken) return;
  const barricade = Object.values(world.entities).find((e) => e.structure?.kind === 'barricade');
  if (!barricade?.health || barricade.health.current > 0) return;
  world.flags.barricadeBroken = true;
  const by = defeated.find((d) => d.entityId === barricade.id)?.by ?? null;
  despawn(ctx, barricade.id);
  ctx.emit('barricade:broken', { by });
}
