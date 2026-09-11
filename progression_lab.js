// RPG Progression Lab: tier-step design sandbox built on CombatEngine and the data.js catalog.
// Loaded after combat_engine.js, before app.js; exposes the global `ProgressionLab`.
//
// WHAT IS GROUNDED
//   The numbers come from the same decompiled-Java model as the rest of the visualizer:
//   CombatEngine.calculateDamage / getWeaponLevelDamageModifier (CombatManager.java:3794-3801),
//   getStrengthMod (IsoGameCharacter.java:4547-4569), the floor multiplier
//   (IsoGameCharacter.java:6191-6196) and the crit chance at the end of the damage chain.
//   The per-tier weapon scaling is CombatEngine.applyTZonyneWeapon, which mirrors
//   OnWeaponSwing.lua applyTierStats: tier dmg / crit rate / crit multiplier multiplied onto
//   the SCRIPT BASE stats, never stacked.
//
// WHAT IS HYPOTHETICAL (NOT Vanilla, NOT the TZonyne mod)
//   The entry build goals, the entry/blocked HTK targets, the optional
//   WEAPON_LEVEL_DAMAGE_CURVE / STRENGTH_DAMAGE_CURVE config arrays and every calibrated
//   tier damage multiplier are levers of this lab. The lab reports what the existing damage
//   model would do under them; it does not claim they exist in any pack.
//
// MODEL
//   A "point" is a FRESH shambler fight: no moodles, maintenance pinned at 2, no traits, melee
//   context at max range. HTK is deterministic and crit-adjusted: the engine's
//   expectedHitsToKill over the mean-roll normal/crit damage pair with the crit chance as the
//   Bernoulli probability, i.e. the engine's own "mean rolls, no roll spread" convention.
//

const ProgressionLab = {
  // Calibration search window for a tier's damage multiplier (see calibrate).
  DMG_MIN: 0.000001,
  DMG_MAX: 20,

  DEFAULT_GOAL: { skill: 0, strength: 0 },
  DEFAULT_ENTRY_HTK: 3,
  DEFAULT_BLOCKED_HTK: 8,

  // Hypothetical 60/40 split of logarithmic growth, not additive damage shares.
  // Preserve the old proposal's initial product (.3*.85) and cap (72.9*1.1).
  generateCurves(weaponBase = 0.3, combinedCap = 80.19, weaponShare = 0.6) {
    const strengthBase = 0.85;
    const growth = combinedCap / (weaponBase * strengthBase);
    return {
      weaponCurve: Array.from({ length: 11 }, (_, level) => weaponBase * growth ** (weaponShare * level / 10)),
      strengthCurve: Array.from({ length: 11 }, (_, level) => strengthBase * growth ** ((1 - weaponShare) * level / 10))
    };
  },

  freshCharacter(skill, strength) {
    return {
      skillLevel: skill,
      strength: strength,
      maintenanceLevel: 2,
      traits: {},
      moodles: { endurance: 0, tired: 0, panic: 0 }
    };
  },

  hitContext(hit) {
    if (hit === "head") return { hitLocation: "Head", isFloor: false };
    if (hit === "floor") return { hitLocation: "Torso", isFloor: true };
    return { hitLocation: "Torso", isFloor: false };
  },

  positive(value, fallback) {
    return Number.isFinite(value) && value > 0 ? value : fallback;
  },

  // The lab always measures the tier ON: `enabled` is forced true and `tier` (a tier id or a
  // tier object, e.g. one returned by calibrate) becomes the selected tier. The input is never
  // mutated: `tiers` is a fresh array of fresh objects, and an unknown numeric id gets a
  // neutral synthetic tier (dmg/crit 1.0, no sprinters) instead of silently reusing T1.
  scaledTz(tzonyne, tier) {
    const tz = tzonyne || TZONYNE_DEFAULTS;
    const source = Array.isArray(tz.tiers) && tz.tiers.length ? tz.tiers : TZONYNE_DEFAULTS.tiers;
    const tiers = source.map(t => ({ ...t }));
    let selected;
    if (tier && typeof tier === "object") {
      selected = { ...tier };
    } else {
      selected = tiers.find(t => t.id === tier);
      if (!selected) {
        selected = { id: tier, name: `T${tier}`, dmg: 1.0, critRate: 1.0, critMulti: 1.0, sprinterPct: 0 };
      }
    }
    const idx = tiers.findIndex(t => t.id === selected.id);
    if (idx >= 0) tiers[idx] = selected;
    else tiers.push(selected);
    return { ...tz, tiers, enabled: true, selectedTier: selected.id };
  },

  point(weapon, skill, strength, tier, sandbox = {}, config = COMBAT_CONFIG_DEFAULTS, tzonyne = TZONYNE_DEFAULTS, hit = "body") {
    const tz = this.scaledTz(tzonyne, tier);
    const character = this.freshCharacter(skill, strength);
    const scaled = CombatEngine.applyTZonyneWeapon(weapon, tz, character);
    const context = this.hitContext(hit);
    const result = CombatEngine.calculateDamage(scaled, character, context, { ...(sandbox || {}) }, config);
    const channel = context.isFloor
      ? { damage: result.floor.mean, critDamage: result.floorCrit.mean }
      : { damage: result.normal.mean, critDamage: result.crit.mean };
    const hp = CombatEngine.zoneZombieMix(tz).shamblerHP;
    return {
      htk: CombatEngine.expectedHitsToKill(hp, channel.damage, channel.critDamage, result.critChance),
      damage: channel.damage,
      critChance: result.critChance
    };
  },

  // Compare each entry build with the preceding build in the SAME tier.
  // firstSkill scans all levels: user-authored curves need not be monotonic.
  // Isolate lagging strength/weapon skill; head/floor expose tactical bypasses.
  analyze(weapon, sandbox = {}, config = COMBAT_CONFIG_DEFAULTS, tzonyne = TZONYNE_DEFAULTS, goals = [], entryHtk = 3, blockedHtk = 8) {
    const tz = tzonyne || TZONYNE_DEFAULTS;
    const list = Array.isArray(tz.tiers) ? tz.tiers : [];
    const goalList = Array.isArray(goals) ? goals : [];
    const entryTarget = this.positive(entryHtk, this.DEFAULT_ENTRY_HTK);
    const blockedTarget = this.positive(blockedHtk, this.DEFAULT_BLOCKED_HTK);

    const rows = list.map((tier, i) => {
      const goal = goalList[i] || goalList[goalList.length - 1] || this.DEFAULT_GOAL;
      const prevGoal = i > 0 ? (goalList[i - 1] || goal) : null;

      const entryHtkValue = this.point(weapon, goal.skill, goal.strength, tier, sandbox, config, tz, "body").htk;
      const previousHtk = prevGoal
        ? this.point(weapon, prevGoal.skill, prevGoal.strength, tier, sandbox, config, tz, "body").htk
        : null;

      let firstSkill = null;
      for (let s = 0; s <= 10; s++) {
        if (this.point(weapon, s, goal.strength, tier, sandbox, config, tz, "body").htk <= entryTarget) {
          firstSkill = s;
          break;
        }
      }

      return {
        tierId: tier.id,
        entryHtk: entryHtkValue,
        previousHtk: previousHtk,
        entryOk: entryHtkValue <= entryTarget,
        wallOk: previousHtk === null ? true : previousHtk >= blockedTarget,
        firstSkill: firstSkill,
        strengthBehindHtk: prevGoal
          ? this.point(weapon, goal.skill, prevGoal.strength, tier, sandbox, config, tz, "body").htk
          : null,
        skillBehindHtk: prevGoal
          ? this.point(weapon, prevGoal.skill, goal.strength, tier, sandbox, config, tz, "body").htk
          : null,
        floorPreviousHtk: (prevGoal && !weapon.isRanged)
          ? this.point(weapon, prevGoal.skill, prevGoal.strength, tier, sandbox, config, tz, "floor").htk
          : null,
        headPreviousHtk: prevGoal
          ? this.point(weapon, prevGoal.skill, prevGoal.strength, tier, sandbox, config, tz, "head").htk
          : null
      };
    });
    return rows;
  },

  // Fit entry access by changing only tier.dmg; never assume this closes the previous-build wall.
  // Upward rounding keeps a passing threshold passing. Non-scalable attacks remain unchanged.
  calibrate(weapon, sandbox = {}, config = COMBAT_CONFIG_DEFAULTS, tzonyne = TZONYNE_DEFAULTS, goals = [], entryHtk = 3, blockedHtk = 8) {
    const tz = tzonyne || TZONYNE_DEFAULTS;
    const list = Array.isArray(tz.tiers) ? tz.tiers : [];
    const goalList = Array.isArray(goals) ? goals : [];
    const entryTarget = this.positive(entryHtk, this.DEFAULT_ENTRY_HTK);
    const scalable = !weapon.isRanged
      && weapon.category !== "Unarmed"
      && !(weapon.id && String(weapon.id).indexOf("Stomp") === 0);

    const tiers = list.map((tier, i) => {
      const cloned = { ...tier };
      if (!scalable) return cloned;
      const goal = goalList[i] || goalList[goalList.length - 1] || this.DEFAULT_GOAL;
      const meets = (dmg) => this.point(
        weapon, goal.skill, goal.strength, { ...cloned, dmg }, sandbox, config, tz, "body"
      ).htk <= entryTarget;
      cloned.dmg = this.lowestPermittingDmg(meets, cloned.dmg);
      return cloned;
    });

    const calibrated = { ...tz, tiers };
    return {
      tiers,
      rows: this.analyze(weapon, sandbox, config, calibrated, goals, entryTarget, blockedHtk)
    };
  },

  // Search a monotone HTK predicate, then verify the rounded multiplier.
  // If the search window cannot reach the target, retain the original multiplier.
  lowestPermittingDmg(meets, fallbackDmg) {
    if (!meets(this.DMG_MAX)) return fallbackDmg;
    const lo0 = this.DMG_MIN;
    if (meets(lo0)) return this.roundUp6(lo0);
    let lo = lo0;
    let hi = this.DMG_MAX;
    for (let i = 0; i < 80 && hi - lo > 1e-9; i++) {
      const mid = (lo + hi) / 2;
      if (meets(mid)) hi = mid;
      else lo = mid;
    }
    let candidate = this.roundUp6(hi);
    for (let guard = 0; guard < 32; guard++) {
      if (meets(candidate)) return candidate;
      candidate = this.roundUp6(candidate + 1e-6);
    }
    return this.DMG_MAX;
  },

  roundUp6(value) {
    return Math.ceil(value * 1e6) / 1e6;
  }
};
