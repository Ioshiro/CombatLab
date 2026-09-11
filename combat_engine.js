// Combat Engine: Project Zomboid Build 42.20
// Grounded in CombatManager.java, IsoGameCharacter.Hit, IsoPlayer.calculateCritChance,
// HandWeapon.getDamageMod, IsoZombie toughness, InventoryItem.damageCheck.
// TZonyne tier scaling: OnWeaponSwing.lua applyTierStats; zone zombie mix: lrzombies_sand.lua.
//
// Numeric convention: every damage statistic is the MEAN of its roll (min/mean/max are
// carried for display only), so expectedHitsToKill() models two fixed mean rolls and
// does not model the spread of the continuous Rand.Next(minDamage, maxDamage) roll.
// For scenarios requiring over 1000 normal hits it uses the mean-damage approximation.

const CombatEngine = {
  getZombieHP(toughness, customHP = null) {
    if (customHP !== null && customHP > 0) {
      return { min: customHP, max: customHP, mean: customHP, name: "Custom", critMod: 0 };
    }
    const preset = ZOMBIE_TOUGHNESS_PRESETS[toughness] || ZOMBIE_TOUGHNESS_PRESETS[2];
    return {
      min: preset.minHP,
      max: preset.maxHP,
      mean: preset.meanHP,
      name: preset.name,
      critMod: preset.critMod
    };
  },

  // HandWeapon.java:472 — only Axe / Long Blunt / Spear
  getPerkBonus(category, skillLevel) {
    if (category === "Axe" || category === "Blunt" || category === "Spear") {
      if (skillLevel >= 7) return 1.2;
      if (skillLevel >= 3) return 1.1;
    }
    return 1.0;
  },

  // Optional 11-level curve lookup shared by getStrengthMod / getWeaponLevelDamageModifier.
  //
  // HYPOTHETICAL CUSTOM LEVER — this is neither vanilla B42 nor the TZonyne mod: it is a
  // design sandbox on top of the decompiled damage model, used by the RPG progression lab.
  // When `config[key]` is an array of exactly 11 finite, non-negative numbers it REPLACES the
  // vanilla formula at every level; anything else (absent, wrong length, a NaN, a negative
  // factor) is ignored wholesale and the vanilla formula runs. The array is only ever READ:
  // swapping a curve means replacing the reference, so a snapshot that kept the previous
  // array still sees the previous factors.
  curveLevelValue(config, key, level) {
    const curve = config ? config[key] : null;
    if (!Array.isArray(curve) || curve.length !== 11) return null;
    for (let i = 0; i < 11; i++) {
      const v = curve[i];
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null;
    }
    const idx = Math.max(0, Math.min(10, Math.floor(Number(level)) || 0));
    return curve[idx];
  },

  // IsoGameCharacter.java:4547 — Strength 0 is 0.75, not 0.80.
  // config.STRENGTH_DAMAGE_CURVE (hypothetical, see curveLevelValue) replaces the table for
  // the melee weapon path. The stomp branch keeps its own Java `strength * 0.2` term and
  // never used this table, so the curve does not reach it.
  getStrengthMod(strengthLevel, config = COMBAT_CONFIG_DEFAULTS) {
    const lvl = Math.max(0, Math.min(10, Math.round(strengthLevel !== undefined ? strengthLevel : 5)));
    const curveValue = this.curveLevelValue(config, "STRENGTH_DAMAGE_CURVE", lvl);
    if (curveValue !== null) return curveValue;
    const table = [0.75, 0.80, 0.85, 0.90, 0.95, 1.00, 1.05, 1.10, 1.15, 1.20, 1.25];
    return table[lvl];
  },

  getTraitDamageMod(traits = {}) {
    let mod = 1.0;
    if (traits.underweight) mod *= 0.8;
    if (traits.veryUnderweight) mod *= 0.6;
    if (traits.emaciated) mod *= 0.4;
    return mod;
  },

  getMoodleDamageMultipliers(moodles = {}) {
    const enduranceLevels = [1.0, 0.5, 0.2, 0.1, 0.05];
    const tiredLevels = [1.0, 0.5, 0.2, 0.1, 0.05];
    const eLvl = Math.max(0, Math.min(4, moodles.endurance || 0));
    const tLvl = Math.max(0, Math.min(4, moodles.tired || 0));
    return {
      endurance: enduranceLevels[eLvl],
      tired: tiredLevels[tLvl],
      combined: enduranceLevels[eLvl] * tiredLevels[tLvl]
    };
  },

  // CombatManager.java:974-986
  // melee: rangeDel = (dist / maxRange) * 2; if < 0.3 → 1.0
  // distanceRatio 1.0 = colpo a max range (rangeDel 2.0)
  getRangeDel(distanceRatio = 1.0, weapon = null, context = {}) {
    if (weapon && weapon.isRanged) return 1.0; // after *2 of 0.5 ranged base → 1.0
    if (context.isStomp) return 1.0; // stomp is point-blank; <0.3 branch → 1.0
    let rangeDel = distanceRatio * 2.0;
    if (rangeDel < 0.3) rangeDel = 1.0;
    return rangeDel;
  },

  // CombatManager.java:3794-3801 — vanilla is BASE + level × INCREMENT with level clamped to
  // [0, 10]. config.WEAPON_LEVEL_DAMAGE_CURVE (hypothetical, see curveLevelValue) replaces
  // that formula at every level.
  getWeaponLevelDamageModifier(skillLevel, config = COMBAT_CONFIG_DEFAULTS) {
    const lvl = Math.max(0, Math.min(10, skillLevel));
    const curveValue = this.curveLevelValue(config, "WEAPON_LEVEL_DAMAGE_CURVE", lvl);
    if (curveValue !== null) return curveValue;
    return config.BASE_WEAPON_DAMAGE_MULTIPLIER + lvl * config.WEAPON_LEVEL_DAMAGE_MULTIPLIER_INCREMENT;
  },

  // IsoGameCharacter.java:6191 — weapon ground attack only (aimAtFloor && !shove)
  // damage *= max(FLOOR_MIN, critMultiplier). Stomp does NOT get this.
  getFloorMultiplier(weapon, config = COMBAT_CONFIG_DEFAULTS) {
    const minFloor = config.FLOOR_DAMAGE_MIN_MULTIPLIER !== undefined ? config.FLOOR_DAMAGE_MIN_MULTIPLIER : 5.0;
    if (config.FLOOR_DAMAGE_FLAT) return minFloor;
    return Math.max(minFloor, weapon.critMultiplier || 0);
  },

  getCritMultiplier(weapon) {
    return Math.max(2.0, weapon.critMultiplier || 2.0);
  },

  // HandWeapon.getFatigueMod — Axe/Blunt/Spear only, skill >= 8
  getFatigueMod(weapon, skillLevel) {
    if (weapon.category === "Axe" || weapon.category === "Blunt" || weapon.category === "Spear") {
      return skillLevel >= 8 ? 0.8 : 1.0;
    }
    return 1.0;
  },

  // IsoGameCharacter.java:4462-4485 — Fitness perk mod; level 0 (no perk) is 1.0.
  // Multiplied into melee endurance loss by attacker.getFatigueMod() at
  // CombatManager.java:3832 (applyMeleeEnduranceLoss) and again at 1249 (processWeaponEndurance).
  getFitnessMod(fitnessLevel) {
    const table = [1.0, 0.95, 0.92, 0.89, 0.87, 0.85, 0.83, 0.81, 0.79, 0.77, 0.75];
    const lvl = Math.max(0, Math.min(10, Math.round(fitnessLevel !== undefined ? fitnessLevel : 5)));
    return table[lvl];
  },

  // Animation cycle estimate. Script SwingTime is NOT seconds (WoodAxe = 0.5 with Heavy anim).
  getAttackCycleSeconds(weapon) {
    if (weapon.category === "Unarmed") return 1.0;
    const anim = weapon.swingAnim || this.inferSwingAnim(weapon);
    const map = {
      Heavy: 1.6,
      Bat: 1.15,
      Stab: 0.85,
      Spear: 1.2,
      Handgun: 0.55,
      Rifle: 0.7,
      Unarmed: 1.0
    };
    return map[anim] || 1.15;
  },

  inferSwingAnim(weapon) {
    if (weapon.category === "Unarmed") return "Unarmed";
    if (weapon.isRanged) return weapon.twoHand ? "Rifle" : "Handgun";
    if (weapon.category === "Spear") return "Spear";
    if (weapon.category === "SmallBlade") return "Stab";
    if ((weapon.weight || 0) >= 5 || weapon.id === "WoodAxe" || weapon.id === "Sledgehammer") return "Heavy";
    return "Bat";
  },

  effectiveMaxHitCount(weapon, sandbox = {}) {
    if (weapon.isRanged) return weapon.maxHitCount || 1;
    if (!sandbox.multiHit) return 1;
    return Math.max(1, weapon.maxHitCount || 1);
  },

  calculateCritChance(weapon, character = {}, context = {}, sandbox = {}, config = {}) {
    if (weapon.alwaysKnockdown) return 90.0; // clamp in IsoPlayer.java:3930

    if (weapon.category === "Unarmed" || context.isStomp) {
      // IsoPlayer.java:3829 — isDoShove() branch (shove/stomp vs zombie): base 35.
      // Strength 0 must add +0: `character.strength || 5` silently substituted 5.
      const strength = character.strength !== undefined ? character.strength : 5;
      let baseChance = 35.0;
      baseChance -= (character.moodles?.endurance || 0) * 5;
      baseChance -= (character.moodles?.heavyLoad || 0) * 5;
      baseChance -= (character.moodles?.panic || 0) * 1.3;
      baseChance += strength * 2;
      // Java returns this branch unclamped (the [10, 90] clamp only closes the weapon
      // branch); the clamp here is a deliberate smoothing choice of this simulator.
      // Toughness ±6 is weapon-branch-only in Java, so it must NOT be applied here.
      return Math.max(10.0, Math.min(90.0, baseChance));
    }

    let chance = weapon.critChance || 0.0;
    if (weapon.hasSharpness && context.sharpness !== undefined) {
      chance *= context.sharpness;
    }

    if (weapon.isRanged) {
      chance += (weapon.aimingPerkCritModifier || 6) * (character.skillLevel || 0);
      chance -= (character.moodles?.panic || 0) * 4.0;
      chance -= (character.moodles?.tired || 0) * 2.5;
      chance -= (character.moodles?.endurance || 0) * 2.5;
    } else {
      if (weapon.twoHand && context.oneHanded) {
        chance -= chance / 3.0;
      }
      if (context.chargeTime !== undefined && context.chargeTime < 2.0) {
        chance -= chance / 5.0;
      }
      chance += (character.skillLevel || 0) * 3.0;

      if (context.isBehind) {
        chance += context.isUnalerted
          ? (config.ADDITIONAL_CRITICAL_HIT_CHANCE_FROM_BEHIND || 30.0)
          : (config.ADDITIONAL_CRITICAL_HIT_CHANCE_DEFAULT || 5.0);
      }

      // CombatManager.java:3237-3251 — +30 only for empty hand / FAKE_SPEAR on spear overhead, not every spear
      if (weapon.fakeSpear && (context.distanceRatio || 1.0) > 0.85 && !context.isFloor) {
        chance += 30.0;
      }

      chance -= (character.moodles?.endurance || 0) * 5.0;
      chance -= (character.moodles?.heavyLoad || 0) * 5.0;
      chance -= (character.moodles?.panic || 0) * 1.3;
    }

    const toughnessPreset = ZOMBIE_TOUGHNESS_PRESETS[sandbox.toughness];
    if (toughnessPreset && toughnessPreset.critMod) {
      chance += toughnessPreset.critMod;
    }

    return Math.max(10.0, Math.min(90.0, chance));
  },

  calculateDamage(weapon, character = {}, context = {}, sandbox = {}, config = COMBAT_CONFIG_DEFAULTS) {
    const isStomp = weapon.category === "Unarmed" || context.isStomp;
    const skill = character.skillLevel || 0;
    const strength = character.strength !== undefined ? character.strength : 5;
    const moodles = character.moodles || {};
    const traits = character.traits || {};

    const perkBonus = this.getPerkBonus(weapon.category, skill);
    const strengthMod = this.getStrengthMod(strength, config);
    const traitMod = this.getTraitDamageMod(traits);
    const moodleMults = this.getMoodleDamageMultipliers(moodles);
    const rangeDel = this.getRangeDel(
      context.distanceRatio !== undefined ? context.distanceRatio : 1.0,
      weapon,
      { isStomp }
    );
    const wpnLevelMod = this.getWeaponLevelDamageModifier(
      weapon.isRanged ? (character.aimingLevel || skill) : skill,
      config
    );

    const targetIdx = Math.max(1, context.targetNumber || 1);
    const splitDivisor = weapon.isRanged ? 1.0 : targetIdx * 0.5;

    const sharpnessMult = (weapon.hasSharpness && context.sharpness !== undefined)
      ? (context.sharpness + 1.0) / 2.0
      : 1.0;

    const minRaw = weapon.minDamage;
    const maxRaw = weapon.hasSharpness
      ? weapon.minDamage + (weapon.maxDamage - weapon.minDamage) * sharpnessMult
      : weapon.maxDamage;
    const meanRaw = (minRaw + maxRaw) / 2.0;

    const critChance = this.calculateCritChance(weapon, character, context, sandbox, config);
    const critMultVal = this.getCritMultiplier(weapon);
    const floorMultVal = this.getFloorMultiplier(weapon, config);
    const isWeaponFloor = !isStomp && !!context.isFloor && !weapon.isRanged;

    const computeForRaw = (raw) => {
      let dmg = raw;
      let notes = {};

      if (isStomp) {
        // CombatManager.java:1002-1009 — REPLACE weapon damage, then moodles/head/Hit()
        // Rand.Next(0.7, 1.0) + strength * 0.2, times shoe stompPower (barefoot 0.5)
        const stompPower = weapon.stompPower !== undefined ? weapon.stompPower : 2.1;
        let damageSplit = raw + strength * 0.2;
        damageSplit *= stompPower;
        damageSplit *= moodleMults.combined;

        if (context.hitLocation === "Head") {
          damageSplit *= config.HEAD_HIT_DAMAGE_SPLIT_MODIFIER;
        } else if (context.hitLocation === "Legs") {
          damageSplit *= config.LEG_HIT_DAMAGE_SPLIT_MODIFIER;
        }

        let finalDmg = damageSplit * rangeDel;
        finalDmg *= config.NON_PLAYER_RECEIVED_DAMAGE_MULTIPLIER;
        finalDmg *= wpnLevelMod;
        // Stomp is aimAtFloor && shove → NO floor 5x (IsoGameCharacter.java:6191)
        const normalDmg = Math.max(0.01, finalDmg * config.GLOBAL_MELEE_DAMAGE_REDUCTION_MULTIPLIER);
        return {
          normal: normalDmg,
          crit: normalDmg * critMultVal,
          floor: normalDmg,
          floorCrit: normalDmg * critMultVal,
          notes: { stompPower, rangeDel, wpnLevelMod, noFloorMult: true }
        };
      }

      if (!weapon.isRanged) {
        dmg *= perkBonus * strengthMod;

        if (weapon.twoHand && context.oneHanded && weapon.maxDamage > weapon.minDamage) {
          dmg = Math.max(0.1, dmg - weapon.minDamage);
        }

        dmg *= traitMod;
      }

      let damageSplit = dmg / splitDivisor;

      if (!weapon.isRanged) {
        if ((moodles.panic || 0) > 1) damageSplit -= moodles.panic * 0.1;
        if ((moodles.stress || 0) > 1) damageSplit -= moodles.stress * 0.1;
        if (damageSplit < 0.0) damageSplit = 0.1;
        damageSplit *= moodleMults.combined;
      }

      if (context.hitLocation === "Head") {
        damageSplit *= config.HEAD_HIT_DAMAGE_SPLIT_MODIFIER;
      } else if (context.hitLocation === "Legs") {
        damageSplit *= config.LEG_HIT_DAMAGE_SPLIT_MODIFIER;
      }

      if (sandbox.zombieArmorFactor) {
        const armorDef = Math.min(85, (context.zombieBaseDefense || 0) * (sandbox.zombieArmorFactor || 1.0));
        damageSplit *= (1.0 - armorDef / 100.0);
      }

      let finalDmg = damageSplit * rangeDel;

      if (context.isBehind) {
        finalDmg *= 1.5;
      }

      finalDmg *= config.NON_PLAYER_RECEIVED_DAMAGE_MULTIPLIER;
      finalDmg *= wpnLevelMod;

      if (weapon.twoHand && context.oneHanded) {
        finalDmg *= config.DAMAGE_PENALTY_ONE_HANDED_TWO_HANDED_WEAPON_MULTIPLIER;
      }

      let normalDmg = finalDmg;
      let critDmg = finalDmg * critMultVal;
      let floorDmg = isWeaponFloor ? finalDmg * floorMultVal : finalDmg;
      let floorCritDmg = isWeaponFloor ? finalDmg * floorMultVal * critMultVal : critDmg;

      if (!weapon.isRanged) {
        normalDmg *= config.GLOBAL_MELEE_DAMAGE_REDUCTION_MULTIPLIER;
        critDmg *= config.GLOBAL_MELEE_DAMAGE_REDUCTION_MULTIPLIER;
        floorDmg *= config.GLOBAL_MELEE_DAMAGE_REDUCTION_MULTIPLIER;
        floorCritDmg *= config.GLOBAL_MELEE_DAMAGE_REDUCTION_MULTIPLIER;
      }

      notes = { perkBonus, strengthMod, splitDivisor, rangeDel, wpnLevelMod, floorMultVal };
      return { normal: normalDmg, crit: critDmg, floor: floorDmg, floorCrit: floorCritDmg, notes };
    };

    const minRes = computeForRaw(minRaw);
    const meanRes = computeForRaw(meanRaw);
    const maxRes = computeForRaw(maxRaw);

    const normal = { min: minRes.normal, mean: meanRes.normal, max: maxRes.normal };
    const crit = { min: minRes.crit, mean: meanRes.crit, max: maxRes.crit };
    const floor = { min: minRes.floor, mean: meanRes.floor, max: maxRes.floor };
    const floorCrit = { min: minRes.floorCrit, mean: meanRes.floorCrit, max: maxRes.floorCrit };

    const critProb = critChance / 100.0;
    const expectedNormal = (1.0 - critProb) * normal.mean + critProb * crit.mean;
    const expectedFloor = (1.0 - critProb) * floor.mean + critProb * floorCrit.mean;

    return {
      normal,
      crit,
      floor,
      floorCrit,
      critChance,
      expected: context.isFloor ? expectedFloor : expectedNormal,
      floorMultiplier: isWeaponFloor ? floorMultVal : 1,
      critMultiplier: critMultVal,
      breakdown: {
        rawMean: meanRaw,
        perkBonus: isStomp ? 1 : perkBonus,
        strengthMod: isStomp ? 1 : strengthMod,
        splitDivisor,
        rangeDel,
        wpnLevelMod,
        nonPlayer: config.NON_PLAYER_RECEIVED_DAMAGE_MULTIPLIER,
        meleeReduction: weapon.isRanged ? 1 : config.GLOBAL_MELEE_DAMAGE_REDUCTION_MULTIPLIER,
        floorMult: isWeaponFloor ? floorMultVal : 1,
        headMult: context.hitLocation === "Head" ? config.HEAD_HIT_DAMAGE_SPLIT_MODIFIER : 1,
        isStomp
      }
    };
  },
  calculateDurability(weapon, character = {}, config = COMBAT_CONFIG_DEFAULTS) {
    if (weapon.condMax >= 900) {
      return {
        probPerHit: 0,
        expectedHitsPerCond: Infinity,
        totalExpectedHits: Infinity,
        maintenanceMod: 0
      };
    }

    const maintLevel = character.maintenanceLevel !== undefined ? character.maintenanceLevel : 2;
    const weaponSkill = character.skillLevel || 0;
    const maintMod = maintLevel + Math.floor(weaponSkill / 2);

    const wearScale = config.DURABILITY_WEAR_SCALE || 1.0;
    const effectiveChance = Math.max(1, Math.floor(weapon.condLowerChance / wearScale));
    const denominator = effectiveChance + maintMod;

    return {
      probPerHit: 1.0 / Math.max(1, denominator),
      expectedHitsPerCond: denominator,
      totalExpectedHits: weapon.condMax * denominator,
      maintenanceMod: maintMod
    };
  },

  // CombatManager.java:3828-3840 — weight × ENDURANCE_LOSS_BASE_SCALE ×
  // HandWeapon.getFatigueMod × attacker.getFatigueMod (Fitness) × enduranceMod ×
  // ENDURANCE_LOSS_WEIGHT_MODIFIER, then × ENDURANCE_LOSS_FINAL_MULTIPLIER; the
  // 2.0 floor-shove multiplier closes aimAtFloor && isDoShove (stomp/shove) swings.
  // Java has no minimum, so the former 0.003 clamp is gone: light weapons now
  // report their real (lower) cost instead of a fabricated floor.
  calculateEnduranceCost(weapon, character = {}, context = {}, config = COMBAT_CONFIG_DEFAULTS) {
    if (weapon.isRanged || weapon.useEndurance === false) return 0;

    const skill = character.skillLevel || 0;
    const weight = weapon.weight || 1.0;
    const baseScale = config.ENDURANCE_LOSS_BASE_SCALE || 0.28;
    const weightMod = config.ENDURANCE_LOSS_WEIGHT_MODIFIER || 0.3;
    const finalMult = config.ENDURANCE_LOSS_FINAL_MULTIPLIER || 0.04;
    const fatigueMod = this.getFatigueMod(weapon, skill);
    const fitnessMod = this.getFitnessMod(character.fitnessLevel);
    const enduranceMod = weapon.enduranceMod || 1.0;

    let loss = weight * baseScale * fatigueMod * fitnessMod * enduranceMod * weightMod * finalMult;

    if (weapon.category === "Unarmed" || context.isStomp) {
      loss *= config.ENDURANCE_LOSS_FLOOR_SHOVE_MULTIPLIER || 2.0;
    }

    return loss;
  },

  // Deterministic hits when EVERY hit deals exactly `damage` (mean roll, no crits):
  // the ceiling discards the overkill of the last hit, so this is the exact count for
  // that fixed damage. Zero/negative damage never kills → Infinity (not a tiny divisor).
  hitsToKill(hp, damage) {
    if (!(damage > 0)) return Infinity;
    if (!(hp > 0)) return 0;
    return Math.max(1, Math.ceil(hp / damage));
  },

  // P(X ≤ j) for X ~ Binomial(n, p), with 0 < p < 1.
  // Anchored at the end whose pmf cannot underflow (left end when p ≤ 0.5, right end
  // otherwise) and built by the stable pmf recurrence, so no factorials, no binomial
  // coefficients and no log-gamma are involved. Callers keep n ≤ 1000 (see
  // expectedHitsToKill) so 0.5^1000 ≈ 9e-302 still fits in a double.
  binomialCdf(n, p, j) {
    if (j >= n) return 1;
    if (j < 0) return 0;
    let pmf;
    let sum;
    if (p <= 0.5) {
      pmf = Math.pow(1 - p, n);
      sum = pmf;
      const ratio = p / (1 - p);
      for (let i = 0; i < j; i++) {
        pmf *= ((n - i) / (i + 1)) * ratio;
        sum += pmf;
      }
      return sum > 1 ? 1 : sum;
    }
    pmf = Math.pow(p, n);
    sum = pmf; // upper tail P(X ≥ n) seeded at X = n
    const ratio = (1 - p) / p;
    for (let i = n; i > j + 1; i--) {
      pmf *= (i / (n - i + 1)) * ratio;
      sum += pmf;
    }
    const cdf = 1 - sum;
    return cdf < 0 ? 0 : cdf;
  },

  // Expected hits to kill when each hit independently rolls one of the two FIXED mean
  // values the engine already works with: normalDmg with probability 1−p, critDmg with
  // probability p = critChancePct/100 (the crit roll is Bernoulli).
  //
  //   E[N] = Σ_{k≥0} P(S_k < hp),  S_k = damage of the first k hits
  //
  // This is the exact expectation for that two-point per-hit law. Unlike hp / E[damage]
  // it keeps BOTH effects that make the naive ratio wrong: overkill of the killing blow
  // is discarded (a 12-damage crit on a 2 HP zombie is one hit, not 0.17) and stopping is
  // stochastic (crits can end the fight an extra hit early, so E[N] > hp / E[damage]).
  // Sanity properties: ≥ 1 whenever hp > 0; ceil(hp / dmg) when both rolls are equal;
  // Infinity when neither roll deals damage; finite whenever any roll deals damage.
  //
  // Approximation, stated explicitly: real rolls are Rand.Next(minDamage, maxDamage) per
  // hit, i.e. continuous. Only the mean of each roll is modelled here (normal.mean /
  // crit.mean), so the SPREAD of a single roll is not simulated: a low roll can cost an
  // extra hit and a high roll can save one, both invisible to this number. Only the
  // crit-vs-non-crit Bernoulli is treated stochastically.
  //
  // Cost: O(Σ binomial terms), no sequence enumeration and no recursion.
  // Above 1000 normal hits use hp / E[damage] to keep interactive sweeps bounded.
  // This omits overkill; the UI explicitly identifies this extreme-case approximation.
  expectedHitsToKill(hp, normalDmg, critDmg, critChancePct) {
    const hpV = Math.max(0, Number(hp) || 0);
    if (hpV <= 0) return 0;
    const normal = Math.max(0, Number(normalDmg) || 0);
    const crit = Math.max(0, Number(critDmg) || 0);
    const pCrit = Math.max(0, Math.min(1, (Number(critChancePct) || 0) / 100));
    const critIsHigh = crit >= normal;
    const hi = critIsHigh ? crit : normal;
    const lo = critIsHigh ? normal : crit;
    const q = critIsHigh ? pCrit : 1 - pCrit; // P(a hit rolls `hi`)

    if (hi <= 0) return Infinity; // neither roll hurts: the target is unkillable this way
    const mean = (1 - q) * lo + q * hi;
    if (hi - lo <= hi * 1e-12) return Math.ceil(hpV / hi); // both rolls identical → deterministic
    if (q <= 0) return Math.ceil(hpV / lo);
    if (q >= 1) return Math.ceil(hpV / hi);
    if (lo <= 0) return Math.ceil(hpV / hi) / q; // only `hi` rolls hurt → negative binomial

    // k < kStart: even all-`hi` hits cannot kill yet, every term of the sum is exactly 1.
    // k ≥ kMax: pure `lo` hits already kill, so no term survives.
    const kStart = Math.ceil(hpV / hi);
    const kMax = Math.ceil(hpV / lo);
    if (kMax <= 1000) {
      let expected = kStart;
      const invSpan = 1 / (hi - lo);
      for (let k = kStart; k < kMax; k++) {
        // jMax = hits that may still roll `hi` and stay short of hp: j < (hp - k·lo)/(hi - lo).
        // The relative epsilon keeps an exact-multiple quotient (e.g. 5.000000000000004
        // from 0.5/0.1) from rounding a phantom extra hit into the binomial tail.
        const t = (hpV - k * lo) * invSpan;
        let jMax = Math.ceil(t * (1 - 1e-12)) - 1;
        if (jMax > k) jMax = k;
        expected += this.binomialCdf(k, q, jMax);
      }
      return expected;
    }
    return Math.max(1, hpV / mean);
  },

  // Tier-scaled weapon re-derived for one Aiming level. OnWeaponSwing.lua re-applies the
  // tier whenever the weapon is equipped or the zone changes, always with the player's
  // CURRENT Aiming level (rangedmulti = ... − AimingLevel/20), so a curve over skill levels
  // must recompute that exponent per level instead of reusing the one frozen at whatever
  // level the caller happened to pass. It starts from the pristine aiming modifier stored by
  // applyTZonyneWeapon, so calling it repeatedly never compounds the multiplier.
  // Non-ranged weapons (and unscaled ones) are returned untouched.
  weaponForAimingLevel(weapon, aimingLevel) {
    if (!weapon || !weapon.isRanged || weapon.tzonyneRangedTraitRm === undefined) return weapon;
    const scale = this.rangedAimScale(weapon.tzonyneDmg, weapon.tzonyneTier, weapon.tzonyneRangedTraitRm, aimingLevel);
    return {
      ...weapon,
      aimingPerkCritModifier: weapon.tzonyneRangedBaseAimCrit * scale,
      tzonyneRangedAimScale: scale
    };
  },

  generateMultiTraceProgression(weapon, character = {}, sandbox = {}, config = COMBAT_CONFIG_DEFAULTS) {
    const zombieHP = this.getZombieHP(sandbox.toughness, sandbox.customHP);
    const levels = [];
    const floorMult = weapon.category === "Unarmed" ? 1 : this.getFloorMultiplier(weapon, config);

    for (let lvl = 0; lvl <= 10; lvl++) {
      const charFresh = { ...character, skillLevel: lvl, moodles: { endurance: 0, tired: 0, panic: 0 } };
      const charExerted = { ...character, skillLevel: lvl, moodles: { endurance: 1, tired: 0, panic: 0 } };
      const charExhausted = { ...character, skillLevel: lvl, moodles: { endurance: 4, tired: 0, panic: 0 } };

      // Ranged tier modifier for THIS level's Aiming (traits come from the scaled weapon).
      const weaponLvl = this.weaponForAimingLevel(weapon, character.aimingLevel !== undefined ? character.aimingLevel : lvl);

      const dmgNormal = this.calculateDamage(weaponLvl, charFresh, { hitLocation: "Torso", isFloor: false, distanceRatio: 1.0 }, sandbox, config);
      const dmgHead = this.calculateDamage(weaponLvl, charFresh, { hitLocation: "Head", isFloor: false, distanceRatio: 1.0 }, sandbox, config);
      const dmgFloorBody = this.calculateDamage(weaponLvl, charFresh, { hitLocation: "Torso", isFloor: true, distanceRatio: 1.0 }, sandbox, config);
      const dmgFloorHead = this.calculateDamage(weaponLvl, charFresh, { hitLocation: "Head", isFloor: true, distanceRatio: 1.0 }, sandbox, config);
      const dmgExerted = this.calculateDamage(weaponLvl, charExerted, { hitLocation: "Torso", isFloor: false, distanceRatio: 1.0 }, sandbox, config);
      const dmgExhausted = this.calculateDamage(weaponLvl, charExhausted, { hitLocation: "Torso", isFloor: false, distanceRatio: 1.0 }, sandbox, config);

      const maxHits = this.effectiveMaxHitCount(weaponLvl, sandbox);
      const extraTargets = [];
      if (maxHits > 1 && !weaponLvl.isRanged && weaponLvl.category !== "Unarmed") {
        for (let t = 2; t <= maxHits; t++) {
          const extra = this.calculateDamage(
            weaponLvl,
            charFresh,
            { hitLocation: "Torso", isFloor: false, distanceRatio: 1.0, targetNumber: t },
            sandbox,
            config
          );
          extraTargets.push({ target: t, mean: extra.normal.mean, htk: this.hitsToKill(zombieHP.mean, extra.normal.mean) });
        }
      }

      const dura = this.calculateDurability(
        weapon,
        { ...charFresh, maintenanceLevel: character.maintenanceLevel !== undefined ? character.maintenanceLevel : 2 },
        config
      );

      const htkBody = this.hitsToKill(zombieHP.mean, dmgNormal.normal.mean);
      const htkHead = this.hitsToKill(zombieHP.mean, dmgHead.normal.mean);
      const htkFloorBody = this.hitsToKill(zombieHP.mean, dmgFloorBody.floor.mean);
      const htkFloorHead = this.hitsToKill(zombieHP.mean, dmgFloorHead.floor.mean);
      const htkCrit = this.hitsToKill(zombieHP.mean, dmgNormal.crit.mean);
      const htkExerted = this.hitsToKill(zombieHP.mean, dmgExerted.normal.mean);
      const htkExhausted = this.hitsToKill(zombieHP.mean, dmgExhausted.normal.mean);
      const expectedHtkBodyRaw = this.expectedHitsToKill(zombieHP.mean, dmgNormal.normal.mean, dmgNormal.crit.mean, dmgNormal.critChance);
      const expectedHtkBody = Math.max(1, expectedHtkBodyRaw);

      const killsBody = dura.totalExpectedHits === Infinity ? Infinity : Math.round(dura.totalExpectedHits / htkBody);
      const killsHead = dura.totalExpectedHits === Infinity ? Infinity : Math.round(dura.totalExpectedHits / htkHead);
      const killsFloor = dura.totalExpectedHits === Infinity ? Infinity : Math.round(dura.totalExpectedHits / htkFloorBody);
      const killsExpected = dura.totalExpectedHits === Infinity ? Infinity : Math.round(dura.totalExpectedHits / Math.max(1, expectedHtkBody));

      const endCost = this.calculateEnduranceCost(weapon, charFresh, {}, config);
      const swingsBeforeExertion = endCost <= 0 ? Infinity : Math.max(1, Math.floor(0.25 / endCost));

      const swingSeconds = this.getAttackCycleSeconds(weapon);
      const ttkSeconds = Math.round((expectedHtkBody * swingSeconds) * 10) / 10;

      levels.push({
        skillLevel: lvl,
        damage: {
          freshBody: dmgNormal.normal.mean,
          freshBodyMin: dmgNormal.normal.min,
          freshBodyMax: dmgNormal.normal.max,
          head: dmgHead.normal.mean,
          floorBody: dmgFloorBody.floor.mean,
          floorHead: dmgFloorHead.floor.mean,
          crit: dmgNormal.crit.mean,
          critChance: dmgNormal.critChance,
          expectedBody: dmgNormal.expected,
          exerted: dmgExerted.normal.mean,
          exhausted: dmgExhausted.normal.mean
        },
        htk: {
          body: htkBody,
          head: htkHead,
          floorBody: htkFloorBody,
          floorHead: htkFloorHead,
          crit: htkCrit,
          exerted: htkExerted,
          exhausted: htkExhausted,
          expectedBody: Math.round(expectedHtkBody * 10) / 10
        },
        durability: dura,
        kills: {
          body: killsBody,
          head: killsHead,
          floor: killsFloor,
          expected: killsExpected
        },
        endurance: {
          costPerSwing: endCost,
          swingsToExertion: swingsBeforeExertion
        },
        extraTargets,
        floorMultiplier: floorMult,
        breakdown: dmgNormal.breakdown,
        // Ranged only: the tier's aiming exponent for this level (see weaponForAimingLevel);
        // null for melee, where the tier scales the damage roll instead.
        rangedAimScale: weaponLvl.tzonyneRangedAimScale !== undefined ? weaponLvl.tzonyneRangedAimScale : null,
        ttkSeconds,
        attackCycleSeconds: swingSeconds
      });
    }

    return { weapon, zombieHP, levels, floorMultiplier: floorMult };
  },

  simulateHordeCombat(weapon, hordeSize = 20, tactic = "standing", character = {}, sandbox = {}, config = COMBAT_CONFIG_DEFAULTS) {
    const zombieHP = this.getZombieHP(sandbox.toughness, sandbox.customHP).mean;
    const skill = character.skillLevel !== undefined ? character.skillLevel : 3;
    const strength = character.strength !== undefined ? character.strength : 5;
    const charBase = { ...character, skillLevel: skill, strength };
    const maxHits = this.effectiveMaxHitCount(weapon, sandbox);

    const pack = Array.from({ length: hordeSize }, () => zombieHP);
    const swingsOn = Array.from({ length: hordeSize }, () => 0);
    let endurance = 1.0;
    let zombiesKilled = 0;
    let totalSwings = 0;
    let cliffExertion1 = null;
    let cliffExertion2 = null;
    let cliffExhausted = null;
    const rounds = [];

    const enduranceMult = (end) => {
      if (end <= 0.10) return 0.05;
      if (end <= 0.25) return 0.10;
      if (end <= 0.50) return 0.20;
      if (end <= 0.75) return 0.50;
      return 1.0;
    };

    while (zombiesKilled < hordeSize && endurance > 0.04 && totalSwings < 500) {
      const alive = [];
      for (let i = 0; i < pack.length; i++) if (pack[i] > 0) alive.push(i);
      if (!alive.length) break;

      totalSwings++;
      const eMult = enduranceMult(endurance);
      if (endurance <= 0.75 && cliffExertion1 === null) cliffExertion1 = zombiesKilled + 1;
      if (endurance <= 0.50 && cliffExertion2 === null) cliffExertion2 = zombiesKilled + 1;
      if (endurance <= 0.10 && cliffExhausted === null) cliffExhausted = zombiesKilled + 1;

      let cost = this.calculateEnduranceCost(weapon, charBase, {}, config);
      const primary = alive[0];

      if (tactic === "shove_stomp") {
        swingsOn[primary] += 1;
        if (swingsOn[primary] === 1) {
          pack[primary] -= 0.01;
          // Opener shove: fixed approximation (the push rolls no weapon damage).
          // Scaled by the same Fitness mod as the weapon formula so the lever moves it too.
          cost = 0.005 * this.getFitnessMod(charBase.fitnessLevel);
        } else {
          const dmgRes = this.calculateDamage(weapon, charBase, { hitLocation: "Torso", isFloor: true }, sandbox, config);
          pack[primary] -= dmgRes.floor.mean * eMult;
          cost = this.calculateEnduranceCost(weapon, charBase, { isStomp: weapon.category === "Unarmed" }, config);
        }
      } else {
        const loc = tactic === "headshot" ? "Head" : "Torso";
        const n = Math.min(maxHits, alive.length);
        for (let t = 0; t < n; t++) {
          const idx = alive[t];
          swingsOn[idx] += 1;
          const dmgRes = this.calculateDamage(
            weapon,
            charBase,
            { hitLocation: loc, isFloor: false, targetNumber: t + 1 },
            sandbox,
            config
          );
          pack[idx] -= dmgRes.normal.mean * eMult;
        }
      }

      endurance = Math.max(0.0, endurance - cost);

      for (let i = 0; i < pack.length; i++) {
        if (pack[i] <= 0 && swingsOn[i] > 0 && !rounds.some(r => r.zombieIndex === i + 1 && !r.survived)) {
          // newly dead this swing (or already recorded)
        }
      }

      for (const idx of alive) {
        if (pack[idx] <= 0) {
          zombiesKilled++;
          rounds.push({
            zombieIndex: zombiesKilled,
            endurancePct: Math.round(endurance * 100),
            swings: swingsOn[idx],
            totalSwings,
            effectiveDmg: Math.max(0.01, zombieHP / Math.max(1, swingsOn[idx])),
            survived: false
          });
        }
      }
    }

    return {
      weapon,
      hordeSize,
      tactic,
      zombiesKilled,
      totalSwings,
      finalEndurance: Math.round(endurance * 100),
      cliffExertion1,
      cliffExertion2,
      cliffExhausted,
      rounds,
      wiped: zombiesKilled >= hordeSize
    };
  },

  computeRadarMetrics(weapon, character = {}, config = COMBAT_CONFIG_DEFAULTS, sandbox = {}) {
    const skill = character.skillLevel !== undefined ? character.skillLevel : 3;
    const strength = character.strength !== undefined ? character.strength : 5;
    const maint = character.maintenanceLevel !== undefined ? character.maintenanceLevel : 2;

    const dmgRes = this.calculateDamage(weapon, { ...character, skillLevel: skill, strength }, { hitLocation: "Torso", isFloor: false }, sandbox, config);
    const meanDmg = dmgRes.normal.mean;
    const zombieHP = this.getZombieHP(sandbox.toughness, sandbox.customHP).mean;

    const lethality = Math.min(100, Math.round((meanDmg / Math.max(0.5, zombieHP * 1.2)) * 100));

    let longevity = 100;
    let longevityHits = Infinity;
    if (weapon.condMax < 900) {
      const maintMod = maint + Math.floor(skill / 2);
      longevityHits = weapon.condMax * (weapon.condLowerChance + maintMod);
      longevity = Math.min(100, Math.round((longevityHits / 1000) * 100));
    }

    const endCost = this.calculateEnduranceCost(weapon, { ...character, skillLevel: skill }, {}, config);
    const htk = this.hitsToKill(zombieHP, meanDmg);
    const endPerKill = htk * endCost;
    const staminaEff = endCost <= 0
      ? 100
      : Math.min(100, Math.round((0.08 / Math.max(0.004, endPerKill)) * 100));

    const reach = weapon.isRanged
      ? Math.min(100, Math.round(((weapon.maxRange || 10) / 40) * 100))
      : Math.min(100, Math.round(((weapon.maxRange || 1.0) / 1.6) * 100));

    const hitCount = this.effectiveMaxHitCount(weapon, sandbox);
    const kd = weapon.knockdownMod || 0;
    const pb = weapon.pushBackMod || 0.5;
    const cc = Math.min(100, Math.round(hitCount * 20 + Math.min(3, kd) * 15 + Math.min(1, pb) * 25 + (weapon.alwaysKnockdown ? 30 : 0)));

    const swingT = this.getAttackCycleSeconds(weapon);
    const speed = Math.min(100, Math.round((1.2 / Math.max(0.5, swingT)) * 100));

    return {
      weapon,
      axes: [
        { label: "Letalità", value: lethality, desc: `${meanDmg.toFixed(2)} HP / colpo vs ${zombieHP.toFixed(2)} HP` },
        { label: "Longevità", value: longevity, desc: weapon.condMax >= 900 ? "Infinita" : `${Math.round(longevityHits)} colpi` },
        { label: "Efficienza Fiato", value: staminaEff, desc: endCost <= 0 ? "Nessun consumo (arma da fuoco)" : `${endCost.toFixed(4)} stamina / swing` },
        { label: "Portata & Sicurezza", value: reach, desc: `${weapon.maxRange || 1.0}m portata` },
        { label: "Controllo Folla", value: cc, desc: sandbox.multiHit || weapon.isRanged ? `${hitCount} target, KD ${kd}` : `Multi-hit OFF (1 target), KD ${kd}` },
        { label: "Velocità Swing", value: speed, desc: `ciclo stimato ${swingT.toFixed(2)}s (${weapon.swingAnim || this.inferSwingAnim(weapon)})` }
      ]
    };
  },

  computeKnockdownProbabilities(weapon, character = {}) {
    const strength = character.strength !== undefined ? character.strength : 5;
    const enduranceMoodle = character.moodles?.endurance || 0;
    const panicMoodle = character.moodles?.panic || 0;

    let shove1Chance = 35.0 - enduranceMoodle * 5.0 - panicMoodle * 1.3 + strength * 2.0;
    shove1Chance = Math.max(5.0, Math.min(80.0, shove1Chance));
    const p = shove1Chance / 100.0;
    const expectedShovesToGround = Math.round((1 / Math.max(0.05, p)) * 100) / 100;

    const weaponKnockdownMod = weapon.knockdownMod || 0.0;
    const weaponDirectKDChance = weapon.alwaysKnockdown ? 100 : Math.min(85, Math.round(weaponKnockdownMod * 25));

    return {
      shove1KnockdownPct: Math.round(shove1Chance),
      shove2KnockdownPct: Math.round(shove1Chance),
      shove2IsDeadCode: true,
      expectedShovesToGround,
      weaponDirectKDChance,
      weaponKnockdownMod,
      alwaysKnockdown: !!weapon.alwaysKnockdown,
      stompGetsFloorMult: false
    };
  },

  // Grades a build from mean-roll statistics. Every single-hit claim is decided on
  // htk.body = ceil(hp / normal.mean), i.e. a hit that kills AT THE MEAN ROLL; the
  // crit-adjusted expectation (htk.expectedBody) is only ever reported as an expectation.
  // A 60% crit chance does not turn a two-hit weapon into a one-shot weapon: it lowers the
  // expected number of swings, which is a different statement.
  evaluatePowerLevel(levelData, weapon, zombieHP) {
    const standing = levelData.htk.body;                  // deterministic at the mean roll
    const expectedStanding = levelData.htk.expectedBody;  // crit-adjusted expectation, ≥ 1
    const floorHtk = levelData.htk.floorBody;
    const kills = levelData.kills.expected === Infinity ? 9999 : levelData.kills.expected;
    const endPerKill = levelData.htk.body * levelData.endurance.costPerSwing;
    const critPct = levelData.damage ? levelData.damage.critChance.toFixed(0) : "?";

    if (weapon.isRanged) {
      if (expectedStanding <= 1.2) return { score: "ELEVATO", tag: "Letale a distanza", desc: "Uno o due colpi a segno chiudono il bersaglio.", color: "var(--col-crit)", tagStyle: "color: var(--col-crit);" };
      if (expectedStanding <= 2.5) return { score: "SOLIDO", tag: "Affidabile", desc: "Buona resa, il limite è munizioni e rumore.", color: "var(--col-head)", tagStyle: "color: var(--col-head);" };
      return { score: "MODESTO", tag: "Poco efficiente", desc: "Serve mira e più di un colpo per zombie.", color: "var(--col-fresh)", tagStyle: "color: var(--col-fresh);" };
    }

    if (weapon.category === "Unarmed") {
      if (levelData.htk.head <= 1) return { score: "FORTE", tag: "Finisher", desc: "Lo stomp alla testa chiude, senza 5x a terra (non è un colpo arma).", color: "var(--col-head)", tagStyle: "color: var(--col-head);" };
      return { score: "DI SUPPORTO", tag: "Risparmio arma", desc: `Stomp corpo ~${levelData.htk.body} colpi. Utile dopo una spinta, non come DPS principale.`, color: "var(--col-fresh)", tagStyle: "color: var(--col-fresh);" };
    }

    if (standing <= 1 && kills > 80) {
      return { score: "ROTTO", tag: "One-shot in piedi", desc: `Chiude in piedi in 1 colpo al roll medio vs ${zombieHP.name} e dura ~${kills} kill. Il moltiplicatore a terra è irrilevante.`, color: "var(--col-zombie)", tagStyle: "color: var(--col-zombie);" };
    }
    if (standing > 1 && expectedStanding <= 1.15) {
      return { score: "FORTE", tag: "Crit-dipendente", desc: `Il colpo medio non chiude (${standing} colpi al corpo), ma col crit ${critPct}% l'atteso è ~${expectedStanding}: rendimento alto, non una garanzia.`, color: "var(--col-crit)", tagStyle: "color: var(--col-crit);" };
    }
    if (expectedStanding <= 2.2 && floorHtk <= 1 && endPerKill < 0.04) {
      return { score: "FORTE", tag: "Efficiente", desc: `In piedi ~${expectedStanding} colpi attesi (${standing} al roll medio), a terra 1-shot al roll medio. Il fiato regge il ritmo.`, color: "var(--col-crit)", tagStyle: "color: var(--col-crit);" };
    }
    if (standing <= 3.5) {
      return { score: "BILANCIATO", tag: "Mischia onesta", desc: `Servono ${standing} colpi al corpo (attesi ~${expectedStanding} col crit ${critPct}%). A terra ${floorHtk} colpo/i (x${levelData.floorMultiplier}).`, color: "var(--col-head)", tagStyle: "color: var(--col-head);" };
    }
    if (kills < 40) {
      return { score: "FRAGILE", tag: "Usura alta", desc: `Pochi zombie per arma (~${kills}). Il danno non è il problema principale: la durata sì.`, color: "var(--col-zombie)", tagStyle: "color: var(--col-zombie);" };
    }
    return { score: "GRIND", tag: "Lento in piedi", desc: `HTK atteso ${standing} al corpo. Funziona se atterri, fatica in orda in piedi.`, color: "var(--col-exerted)", tagStyle: "color: var(--col-exerted);" };
  },

  cloneWeapon(weapon) {
    return { ...weapon };
  },

  selectedTier(tzonyne) {
    const tz = tzonyne || TZONYNE_DEFAULTS;
    return tz.tiers.find(t => t.id === tz.selectedTier) || tz.tiers[0];
  },

  // (tierDmg / tierZone) ^ rangedMulti — OnWeaponSwing.lua computes this same exponent for
  // every aiming perk modifier (hit chance, crit, range) and for AimingTime:
  //   rangedMulti = sandbox.rangedmulti − traits ± − AimingLevel / 20
  // Kept in one place so applyTZonyneWeapon and generateMultiTraceProgression cannot
  // diverge on the formula.
  rangedAimScale(tierDmg, tierId, traitRangedMulti, aimingLevel) {
    const rm = (traitRangedMulti !== undefined ? traitRangedMulti : 1.0) - (aimingLevel || 0) / 20;
    return Math.pow((tierDmg || 1) / Math.max(1, tierId), rm);
  },

  // OnWeaponSwing.lua applyTierStats — scales SCRIPT BASE stats, never stacks.
  // The Lua re-reads the pristine stats through a fresh instanceItem(fullType) on every
  // application (getBaseMeleeStats/getBaseRangedStats), so re-applying a tier to an
  // already-tiered weapon is idempotent. This clones the same contract: the untouched
  // stats are remembered as `tzonyneBase` and every later call rescales FROM THEM, so a
  // second application (another tier, or the same tier at another Aiming level) can never
  // compound the multipliers. Ranged weapons store the trait/sandbox half of rangedMulti
  // plus the base aiming crit modifier, which is exactly what generateMultiTraceProgression
  // needs to re-derive the per-Aiming-level exponent.
  applyTZonyneWeapon(weapon, tzonyne, character = {}) {
    if (!weapon) return weapon;
    if (!tzonyne || !tzonyne.enabled) return weapon;
    if (weapon.category === "Unarmed" || (weapon.id && String(weapon.id).indexOf("Stomp") === 0)) return weapon;

    const tier = this.selectedTier(tzonyne);
    const w = this.cloneWeapon(weapon);
    const base = weapon.tzonyneBase || {
      minDamage: weapon.minDamage,
      maxDamage: weapon.maxDamage,
      critChance: weapon.critChance,
      critMultiplier: weapon.critMultiplier,
      aimingPerkCritModifier: weapon.aimingPerkCritModifier
    };
    w.tzonyneBase = base;
    w.tzonyneTier = tier.id;
    w.tzonyneDmg = tier.dmg;
    w.tzonyneCritRate = tier.critRate;
    w.tzonyneCritMulti = tier.critMulti;

    if (w.isRanged) {
      // Ranged damage is NOT scaled by the tier: only the aiming perk modifiers are.
      let traitRm = tzonyne.rangedMulti !== undefined ? tzonyne.rangedMulti : 1.0;
      const traits = character.traits || {};
      if (traits.brave) traitRm -= 0.125;
      if (traits.desensitized) traitRm -= 0.25;
      if (traits.cowardly) traitRm += 0.15;
      if (traits.shortSighted) traitRm += 0.1;
      if (traits.eagleEyed) traitRm -= 0.1;
      const aim = character.aimingLevel !== undefined ? character.aimingLevel : (character.skillLevel || 0);
      const baseAimCrit = base.aimingPerkCritModifier !== undefined && base.aimingPerkCritModifier !== null
        ? base.aimingPerkCritModifier
        : 6;
      const scale = this.rangedAimScale(tier.dmg, tier.id, traitRm, aim);
      w.tzonyneRangedTraitRm = traitRm;
      w.tzonyneRangedBaseAimCrit = baseAimCrit;
      w.tzonyneRangedAimScale = scale;
      w.aimingPerkCritModifier = baseAimCrit * scale;
      return w;
    }

    w.minDamage = base.minDamage * (tier.dmg || 1);
    w.maxDamage = base.maxDamage * (tier.dmg || 1);
    w.critChance = (base.critChance || 0) * (tier.critRate || 1);
    w.critMultiplier = (base.critMultiplier || 2) * (tier.critMulti || 1);
    return w;
  },

  // lrzombies_sand.lua: sprinterValue * nightFactor, distribution = 100 * value, <=1% → 0
  zoneZombieMix(tzonyne) {
    const tz = tzonyne || TZONYNE_DEFAULTS;
    const tier = this.selectedTier(tz);
    let sp = Number(tier.sprinterPct) || 0;
    if (tz.night) sp *= (tz.nightSprinterFactor !== undefined ? tz.nightSprinterFactor : 0.25);
    if (sp <= 1) sp = 0;
    const share = Math.max(0, Math.min(1, sp / 100));
    const sprinterHP = tz.sprinterHP !== undefined ? tz.sprinterHP : 0.1;
    const shamblerHP = tz.shamblerHP !== undefined ? tz.shamblerHP : 2.0;
    return {
      tier,
      sprinterPct: sp,
      sprinterShare: share,
      shamblerShare: 1 - share,
      sprinterHP,
      shamblerHP,
      mixHP: share * sprinterHP + (1 - share) * shamblerHP
    };
  },

  // Zone grade from mean-roll statistics.
  //   expShamblerHtk — expected hits on a shambler (crit-adjusted, mean rolls)
  //   sprinterHtk    — mean-roll hits to kill a sprinter (null when not applicable)
  //   floorHtk       — mean-roll hits to kill a shambler on the ground; null for ranged
  //                    weapons (guns have no floor attack) and when there is no floor hit
  //   survivalHtk    — the zone's hits-per-shambler budget (analytic reference)
  //   opts.sprinterShare — share of sprinters in the zone mix. lrzombies_sand.lua zeroes the
  //                    distribution at value ≤ 1%, so a tier can legitimately contain ZERO
  //                    sprinters: the one-shot-sprinter requirement must be skipped there
  //                    instead of grading the whole zone LETALE on a zombie that never spawns.
  //   opts.comfortHtk — comfortable hits budget (the tzonyne.comfortHtk lever). Defaults to
  //                    target − 1 (one hit better than required), never a falsy fallback.
  gradeZone(expShamblerHtk, sprinterHtk, floorHtk, survivalHtk, opts = {}) {
    const target = survivalHtk > 0 ? survivalHtk : 3;
    const expSham = expShamblerHtk > 0 ? expShamblerHtk : 1;
    const sprinterShare = opts.sprinterShare !== undefined ? opts.sprinterShare : 1;
    const comfort = opts.comfortHtk > 0 ? opts.comfortHtk : Math.max(1, target - 1);
    const floorOneShot = floorHtk !== null && floorHtk !== undefined && floorHtk <= 1;
    const sprinterOneShot = sprinterHtk !== null && sprinterHtk !== undefined && sprinterHtk <= 1;

    if (sprinterShare > 0 && !sprinterOneShot) {
      const pct = Math.round(sprinterShare * 100);
      return { id: "lethal", label: "LETALE", desc: `Non chiude in 1 colpo medio gli sprinter (${pct}% della zona). La zona è letale.`, color: "#f43f5e" };
    }
    if (expSham > target + 1) {
      return { id: "under", label: "SOTTO-LIVELLO", desc: `HTK ${expSham} vs target ${target}. Il shambler ti mangia il fiato.`, color: "#fb7185" };
    }
    if (expSham > target) {
      return { id: "tight", label: "AL LIMITE", desc: `HTK ${expSham} appena sopra il target ${target}.`, color: "#f97316" };
    }
    if (floorOneShot && expSham <= comfort) {
      return { id: "farm", label: "FARM", desc: `One-shot a terra (roll medio) e HTK ${expSham} entro il comfort ${comfort} in piedi. La zona è sotto il tuo ilvl.`, color: "#a855f7" };
    }
    if (expSham <= comfort) {
      return { id: "comfort", label: "COMODO", desc: `HTK ${expSham} entro il budget comfort (≤${comfort}) sul target ${target}. Puoi farmare senza shove obbligato.`, color: "#34d399" };
    }
    return { id: "viable", label: "VIABILE", desc: `HTK ${expSham} nel budget della zona (target ${target}).`, color: "#fbbf24" };
  },

  // Cheapest-build search over the 11×11 skill × strength grid.
  //
  // `score = skill * 1.2 + str` is a HEURISTIC build cost, NOT a game value: it prices one
  // weapon-skill level as 1.2 strength levels because in PZ weapon skill moves more numbers
  // (weapon-level damage modifier +10%/level, CombatManager.applyWeaponLevelDamageModifier;
  // +3 crit points/level, IsoPlayer.calculateCritChance; perk bonus 1.1 / 1.2 at levels 3/7,
  // HandWeapon.getDamageMod) while one strength level only shifts the hitting mod by 0.05
  // (IsoGameCharacter.getHittingMod). Ties therefore resolve toward strength.
  //
  // `best` is the cheapest combination whose MEAN-ROLL expected hits fit the zone budget
  // (and, only when the zone actually contains sprinters, whose mean roll one-shots them):
  // it is NOT a survival guarantee. Rolls below the mean, fatigue, armour and a denser
  // sprinter mix can each cost extra hits, so the result is a planning floor, not a promise.
  findMinBuild(weapon, sandbox, config, tzonyne, targetHtk) {
    const target = targetHtk || 3;
    const mix = this.zoneZombieMix(tzonyne);
    const needSprinterOneShot = mix.sprinterShare > 0;
    let best = null;
    let atCap = null;
    for (let skill = 0; skill <= 10; skill++) {
      for (let str = 0; str <= 10; str++) {
        const character = { skillLevel: skill, strength: str, maintenanceLevel: 2 };
        const scaled = this.applyTZonyneWeapon(weapon, { ...tzonyne, enabled: true }, character);
        const dmg = this.calculateDamage(scaled, character, { hitLocation: "Torso", isFloor: false }, { ...sandbox, customHP: mix.shamblerHP }, config);
        const htk = Math.max(1, this.expectedHitsToKill(mix.shamblerHP, dmg.normal.mean, dmg.crit.mean, dmg.critChance));
        const sprHtk = this.hitsToKill(mix.sprinterHP, dmg.normal.mean);
        const score = skill * 1.2 + str;
        const rec = { skill, str, htk: Math.round(htk * 10) / 10, sprHtk, score, dmg: dmg.normal.mean };
        if (skill === 10 && str === 10) atCap = rec;
        if (htk <= target && (!needSprinterOneShot || sprHtk <= 1)) {
          if (!best || score < best.score) best = rec;
        }
      }
    }
    return { target, mix, best, atCap, sprinterOneShotRequired: needSprinterOneShot, meanRollOnly: true, scoreWeights: { skill: 1.2, strength: 1.0 } };
  },

  // Fresh-body heatmap: 121 skill × strength cells of crit-adjusted expected hits against a
  // Torso hit on a shambler, with no moodles/fatigue (maintenance is pinned at 2, as in the
  // rest of the panel) and independent of the chart's own selectors.
  // `ok` = within the zone budget AND, only when the tier really contains sprinters, a
  // mean-roll one-shot on them. sprHtk stays numeric for display even when sprinterShare is 0
  // — lrzombies_sand.lua zeroes distributions ≤ 1% — but it cannot veto `ok` in that case.
  buildZoneHeatmap(weapon, sandbox, config, tzonyne) {
    const mix = this.zoneZombieMix(tzonyne);
    const needSprinterOneShot = mix.sprinterShare > 0;
    const target = tzonyne.survivalHtk || 3;
    const cells = [];
    for (let str = 0; str <= 10; str++) {
      for (let skill = 0; skill <= 10; skill++) {
        const character = { skillLevel: skill, strength: str, maintenanceLevel: 2 };
        const scaled = this.applyTZonyneWeapon(weapon, { ...tzonyne, enabled: true }, character);
        const dmg = this.calculateDamage(scaled, character, { hitLocation: "Torso", isFloor: false }, { ...sandbox, customHP: mix.shamblerHP }, config);
        const htk = Math.max(1, this.expectedHitsToKill(mix.shamblerHP, dmg.normal.mean, dmg.crit.mean, dmg.critChance));
        const sprHtk = this.hitsToKill(mix.sprinterHP, dmg.normal.mean);
        cells.push({
          skill,
          str,
          htk: Math.round(htk * 10) / 10,
          sprHtk,
          dmg: dmg.normal.mean,
          ok: htk <= target && (!needSprinterOneShot || sprHtk <= 1),
          sprinterOneShotRequired: needSprinterOneShot
        });
      }
    }
    return { cells, mix, target, tier: this.selectedTier(tzonyne), freshBody: true, hitLocation: "Torso", critAdjusted: true, meanRollOnly: true };
  },

  // Per-tier summary rows. Values are mean-roll statistics of a fresh character (the caller's
  // moodles/level are used as-is). Fields that describe a population the tier does not have
  // are null instead of a meaningless number:
  //   htkSprint / expSprint → null when the tier spawns no sprinters (sprinterShare 0)
  //   floorDmg / floorHtk   → null for ranged weapons (guns have no floor attack)
  // The grade only enforces the sprinter one-shot rule when sprinterShare > 0 and uses the
  // comfortHtk lever when supplied.
  analyzeTierProgression(weapon, character, sandbox, config, tzonyne) {
    const tzBase = tzonyne || TZONYNE_DEFAULTS;
    const rows = tzBase.tiers.map(tier => {
      const tz = { ...tzBase, selectedTier: tier.id, enabled: true, tiers: tzBase.tiers };
      const scaled = this.applyTZonyneWeapon(weapon, tz, character);
      const mix = this.zoneZombieMix(tz);
      const sb = { ...sandbox, customHP: mix.shamblerHP };
      const hasSprinters = mix.sprinterShare > 0;
      const hasFloorAttack = !weapon.isRanged;
      const dmg = this.calculateDamage(scaled, character, { hitLocation: "Torso", isFloor: false }, sb, config);
      const dmgHead = this.calculateDamage(scaled, character, { hitLocation: "Head", isFloor: false }, sb, config);
      const dmgFloor = this.calculateDamage(scaled, character, { hitLocation: "Torso", isFloor: true }, sb, config);
      const htkSham = this.hitsToKill(mix.shamblerHP, dmg.normal.mean);
      const expSham = Math.round(Math.max(1, this.expectedHitsToKill(mix.shamblerHP, dmg.normal.mean, dmg.crit.mean, dmg.critChance)) * 10) / 10;
      const htkSprint = hasSprinters ? this.hitsToKill(mix.sprinterHP, dmg.normal.mean) : null;
      const expSprint = hasSprinters
        ? Math.round(Math.max(1, this.expectedHitsToKill(mix.sprinterHP, dmg.normal.mean, dmg.crit.mean, dmg.critChance)) * 10) / 10
        : null;
      const floorHtk = hasFloorAttack ? this.hitsToKill(mix.shamblerHP, dmgFloor.floor.mean) : null;
      const mixHtk = Math.round(((hasSprinters ? mix.sprinterShare * expSprint : 0) + mix.shamblerShare * expSham) * 10) / 10;
      const ttk = Math.round(mixHtk * this.getAttackCycleSeconds(weapon) * 10) / 10;
      const req = this.findMinBuild(weapon, sandbox, config, tz, tzBase.survivalHtk);
      const grade = this.gradeZone(expSham, htkSprint, floorHtk, tzBase.survivalHtk, {
        sprinterShare: mix.sprinterShare,
        comfortHtk: tzBase.comfortHtk
      });
      const dmgPct = Math.round((dmg.normal.mean / mix.shamblerHP) * 100);
      return {
        tier,
        mix,
        damage: dmg.normal.mean,
        dmgPct,
        critChance: dmg.critChance,
        critMult: this.getCritMultiplier(scaled),
        headDmg: dmgHead.normal.mean,
        floorDmg: hasFloorAttack ? dmgFloor.floor.mean : null,
        htkSham,
        expSham,
        htkSprint,
        expSprint,
        floorHtk,
        mixHtk,
        ttk,
        req,
        grade
      };
    });
    return {
      weapon,
      rows,
      current: rows.find(r => r.tier.id === tzBase.selectedTier) || rows[0]
    };
  }
};
