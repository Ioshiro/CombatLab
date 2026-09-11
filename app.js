// Impeccable Application Controller for Project Zomboid Combat Analyzer
document.addEventListener("DOMContentLoaded", () => {
  const INK = {
    ground: "#0c0f0c", paper: "#141810", paper2: "#1b2116", line: "#3a3f30",
    ink: "#c4b48a", dim: "#8a9378", amber: "#d6a11a", alarm: "#c45c4a",
    sage: "#8a9378", ghost: "#4a4e3a", figure: "#e4d2a8", figureDim: "#b49a6c",
    median: "#e0b03a", figureAlarm: "#f08a78"
  };
  const FONT = "11px 'IBM Plex Mono', ui-monospace, monospace";
  const FONT_BOLD = "700 11px 'IBM Plex Mono', ui-monospace, monospace";
  const FONT_SM = "10px 'IBM Plex Mono', ui-monospace, monospace";
  const TRACE_MARKS = ["circle", "square", "triangle", "diamond"];
  const TRACE_DASHES = [[], [6, 4], [2, 3], [10, 3, 2, 3], [4, 4], [8, 2, 2, 2], [1, 3]];
  const TRACE_INKS = [INK.figure, INK.median, INK.figureAlarm, INK.sage, INK.figureDim, INK.amber, INK.ink];
  function fillMarker(ctx, x, y, kind, r) {
    ctx.beginPath();
    if (kind === "square") ctx.rect(x - r, y - r, r * 2, r * 2);
    else if (kind === "triangle") { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y + r); ctx.lineTo(x - r, y + r); ctx.closePath(); }
    else if (kind === "diamond") { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); }
    else ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  function hatchFill(ctx, x, y, w, h, color, gap) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.strokeStyle = color; ctx.lineWidth = 1;
    const span = Math.abs(w) + Math.abs(h);
    for (let i = -span; i < span * 2; i += gap) {
      ctx.beginPath(); ctx.moveTo(x + i, y); ctx.lineTo(x + i + h, y + h); ctx.stroke();
    }
    ctx.restore();
  }

  // --- STATE ---
  const state = {
    selectedWeaponId: "Axe",
    categoryFilter: "ALL",
    viewMode: "zones",
    selectedSkillLevel: 3,
    floorOverkillMode: false,
    hoverLevel: null,
    zoneMetric: "htk",
    zoneTarget: "shambler",
    zoneHit: "body",
    zoneCritical: true,
    zoneFatigue: 0,
    zoneCompare: false,
    zoneLog: false,
    zoneLevels: new Set([0, 3, 5, 7, 10]),
    hordeSize: 15,
    hordeTactic: "standing", // "standing" | "shove_stomp" | "headshot"
    sandbox: {
      toughness: 2,
      multiHit: false,
      customHP: null
    },
    character: {
      strength: 5,
      fitnessLevel: 5,
      maintenanceLevel: 2,
      traits: {}
    },
    config: { ...COMBAT_CONFIG_DEFAULTS },
    rebalanceConfig: { ...COMBAT_CONFIG_DEFAULTS },
    tzonyne: { ...cloneTZonyne(TZONYNE_DEFAULTS), enabled: true }
  };
  let zoneBaseline = { config: { ...state.config }, tzonyne: cloneTZonyne(state.tzonyne), sandbox: { ...state.sandbox } };
  let zonePlot = null;
  const rangeControls = document.querySelectorAll('input[type="range"]');
  const zonePoints = new Map();
  const rpg = {
    goals: [0, 2, 4, 6, 8, 10].map(skill => ({ skill, strength: skill })),
    entryHtk: 3,
    blockedHtk: 8,
    ...ProgressionLab.generateCurves()
  };

  const allWeapons = [...WEAPON_CATALOG, ...STOMP_DATA];
  const comparisonWeapons = [
    allWeapons.find(w => w.id === "Axe"),
    allWeapons.find(w => w.id === "Crowbar"),
    allWeapons.find(w => w.id === "BaseballBat"),
    allWeapons.find(w => w.id === "Katana"),
    allWeapons.find(w => w.id === "SpearCrafted"),
    allWeapons.find(w => w.id === "HuntingKnife"),
    allWeapons.find(w => w.id === "Stomp_Boots")
  ].filter(Boolean);

  // DOM Elements
  const el = {
    presetSelect: document.getElementById("presetSelect"),
    viewBtns: document.querySelectorAll(".view-btn"),
    categoryChips: document.getElementById("categoryChips"),
    weaponSelect: document.getElementById("weaponSelect"),
    selectToughness: document.getElementById("selectToughness"),
    inputCustomHP: document.getElementById("inputCustomHP"),
    skillChips: document.getElementById("skillChips"),
    sliderSkillLevel: document.getElementById("sliderSkillLevel"),
    valSkillLevelText: document.getElementById("valSkillLevelText"),
    checkMultiHit: document.getElementById("checkMultiHit"),
    kpiDmg: document.getElementById("kpiDmg"),
    kpiDmgRange: document.getElementById("kpiDmgRange"),
    tagDmgPct: document.getElementById("tagDmgPct"),
    kpiHTK: document.getElementById("kpiHTK"),
    tagHTK: document.getElementById("tagHTK"),
    kpiHTKSub: document.getElementById("kpiHTKSub"),
    kpiHits: document.getElementById("kpiHits"),
    tagDurability: document.getElementById("tagDurability"),
    kpiKills: document.getElementById("kpiKills"),
    tagPowerLevel: document.getElementById("tagPowerLevel"),
    kpiPowerScore: document.getElementById("kpiPowerScore"),
    kpiPowerDesc: document.getElementById("kpiPowerDesc"),
    stageTitle: document.getElementById("stageTitle"),
    stageSubtitle: document.getElementById("stageSubtitle"),
    stageLegend: document.getElementById("stageLegend"),
    legendFloorText: document.getElementById("legendFloorText"),
    legendZombieHP: document.getElementById("legendZombieHP"),
    btnScaleStandard: document.getElementById("btnScaleStandard"),
    btnScaleOverkill: document.getElementById("btnScaleOverkill"),
    floorScaleToggleGroup: document.getElementById("floorScaleToggleGroup"),
    hordeControlsGroup: document.getElementById("hordeControlsGroup"),
    sliderHordeSize: document.getElementById("sliderHordeSize"),
    valHordeSizeText: document.getElementById("valHordeSizeText"),
    tacticChips: document.getElementById("tacticChips"),
    mainCanvas: document.getElementById("mainCanvas"),
    chartTooltip: document.getElementById("chartTooltip"),
    denseTable: document.getElementById("denseTable"),
    tableHeadRow: document.getElementById("tableHeadRow"),
    tableBody: document.getElementById("tableBody"),
    panelTableTitle: document.getElementById("panelTableTitle"),
    panelTableSub: document.getElementById("panelTableSub"),
    btnResetVanilla: document.getElementById("btnResetVanilla"),
    panelRightTitle: document.getElementById("panelRightTitle"),
    panelRightSub: document.getElementById("panelRightSub"),
    leverGrid: document.getElementById("leverGrid"),
    sliderFloorMult: document.getElementById("sliderFloorMult"),
    valFloorMult: document.getElementById("valFloorMult"),
    sliderHeadMult: document.getElementById("sliderHeadMult"),
    valHeadMult: document.getElementById("valHeadMult"),
    sliderSkillIncr: document.getElementById("sliderSkillIncr"),
    valSkillIncr: document.getElementById("valSkillIncr"),
    sliderWearScale: document.getElementById("sliderWearScale"),
    valWearScale: document.getElementById("valWearScale"),
    tacCardTitle: document.getElementById("tacCardTitle"),
    tacticalLevelTag: document.getElementById("tacticalLevelTag"),
    lblTacMetric1: document.getElementById("lblTacMetric1"),
    tacStaminaCost: document.getElementById("tacStaminaCost"),
    subTacMetric1: document.getElementById("subTacMetric1"),
    lblTacMetric2: document.getElementById("lblTacMetric2"),
    tacSwingsToExertion: document.getElementById("tacSwingsToExertion"),
    subTacMetric2: document.getElementById("subTacMetric2"),
    lblTacMetric3: document.getElementById("lblTacMetric3"),
    tacTTK: document.getElementById("tacTTK"),
    subTacMetric3: document.getElementById("subTacMetric3"),
    tacSummaryText: document.getElementById("tacSummaryText"),
    sliderStrength: document.getElementById("sliderStrength"),
    valStrengthText: document.getElementById("valStrengthText"),
    sliderMaintenance: document.getElementById("sliderMaintenance"),
    valMaintenanceText: document.getElementById("valMaintenanceText"),
    formulaCard: document.getElementById("formulaCard"),
    formulaSteps: document.getElementById("formulaSteps"),
    formulaResult: document.getElementById("formulaResult"),
    formulaNote: document.getElementById("formulaNote"),
    checkTZonyne: document.getElementById("checkTZonyne"),
    tierChips: document.getElementById("tierChips"),
    checkNight: document.getElementById("checkNight"),
    tzonyneLevers: document.getElementById("tzonyneLevers"),
    heatmapCard: document.getElementById("heatmapCard"),
    heatmapCanvas: document.getElementById("heatmapCanvas"),
    heatmapNote: document.getElementById("heatmapNote"),
    heatmapLegend: document.getElementById("heatmapLegend"),
    sliderTzDmg: document.getElementById("sliderTzDmg"),
    valTzDmg: document.getElementById("valTzDmg"),
    sliderTzCritRate: document.getElementById("sliderTzCritRate"),
    valTzCritRate: document.getElementById("valTzCritRate"),
    sliderTzCritMulti: document.getElementById("sliderTzCritMulti"),
    valTzCritMulti: document.getElementById("valTzCritMulti"),
    sliderTzSprinter: document.getElementById("sliderTzSprinter"),
    valTzSprinter: document.getElementById("valTzSprinter"),
    sliderTzShamblerHP: document.getElementById("sliderTzShamblerHP"),
    sliderTzSprinterHP: document.getElementById("sliderTzSprinterHP"),
    valTzHP: document.getElementById("valTzHP"),
    sliderTzTarget: document.getElementById("sliderTzTarget"),
    valTzTarget: document.getElementById("valTzTarget"),
    btnResetTZonyne: document.getElementById("btnResetTZonyne")
  };

  // Populate Weapon Dropdown
  function populateWeapons() {
    el.weaponSelect.innerHTML = "";
    const filtered = allWeapons.filter(w => {
      if (state.categoryFilter === "ALL") return true;
      if (state.categoryFilter === "Unarmed") return w.category === "Unarmed";
      return w.category === state.categoryFilter;
    });

    filtered.forEach(w => {
      const opt = document.createElement("option");
      opt.value = w.id;
      opt.textContent = `${w.name} [${w.category}]`;
      el.weaponSelect.appendChild(opt);
    });

    if (filtered.some(w => w.id === state.selectedWeaponId)) {
      el.weaponSelect.value = state.selectedWeaponId;
    } else if (filtered.length > 0) {
      state.selectedWeaponId = filtered[0].id;
      el.weaponSelect.value = state.selectedWeaponId;
    }
  }

  function getActiveWeapon() {
    return allWeapons.find(w => w.id === state.selectedWeaponId) || allWeapons[0];
  }

  function liveCharacter() {
    return { ...state.character, skillLevel: state.selectedSkillLevel };
  }

  function currentTier() {
    return CombatEngine.selectedTier(state.tzonyne);
  }

  function liveSandbox() {
    const s = { ...state.sandbox, tzonyne: state.tzonyne };
    if (state.tzonyne.enabled) {
      const mix = CombatEngine.zoneZombieMix(state.tzonyne);
      s.customHP = mix.shamblerHP;
    }
    return s;
  }

  function liveWeapon(weapon) {
    return CombatEngine.applyTZonyneWeapon(weapon || getActiveWeapon(), state.tzonyne, liveCharacter());
  }

  function traceProgression(weapon, config) {
    return CombatEngine.generateMultiTraceProgression(liveWeapon(weapon), liveCharacter(), liveSandbox(), config || state.config);
  }

  function configsDiffer(a, b) {
    const keys = Object.keys(COMBAT_CONFIG_DEFAULTS);
    return keys.some(k => a[k] !== b[k]);
  }

  function restoreTacticalLabels() {
    el.panelRightTitle.textContent = "Leve di Ribilanciamento & Modding";
    el.panelRightSub.textContent = "Regola le leve del motore Java per testare le curve in tempo reale";
    el.tacCardTitle.textContent = "Analisi Tattica & Consumo Fiato (Livello Selezionato)";
    el.lblTacMetric1.textContent = "Consumo Fiato / Swing";
    el.subTacMetric1.textContent = "Su 1.0 stamina max";
    el.lblTacMetric2.textContent = "Swings prima del Fiatone";
    el.subTacMetric2.textContent = "Prima di Exertion Lv 1 (-50%)";
    el.lblTacMetric3.textContent = "Time To Kill (TTK)";
    el.subTacMetric3.textContent = "Ciclo stimato da animazione, non SwingTime script";
    if (el.tacTTK) el.tacTTK.style.color = "var(--col-head)";
  }

  function htkBadgeClass(n) {
    if (n <= 1) return "htk-1";
    if (n <= 2) return "htk-2";
    if (n <= 3) return "htk-3";
    return "htk-high";
  }

  function renderFormulaBreakdown(weapon, lvlData) {
    if (!el.formulaSteps) return;
    const b = lvlData.breakdown || {};
    const floorMult = lvlData.floorMultiplier || 1;
    const steps = [];
    if (b.isStomp) {
      steps.push(["Roll scarpe + Forza×0.2", `${(weapon.minDamage + weapon.maxDamage) / 2} + ${state.character.strength}×0.2`]);
      steps.push(["StompPower calzatura", `×${weapon.stompPower || 2.1}`]);
      steps.push(["Niente 5x a terra", "lo stomp è shove a terra, non colpo arma"]);
    } else {
      if (state.tzonyne.enabled && weapon.tzonyneTier) {
        const tr = currentTier();
        steps.push([`TZonyne T${tr.id} su stats base`, weapon.isRanged ? `aim ×${(weapon.tzonyneRangedAimScale || 1).toFixed(2)} (dmg vanilla)` : `dmg ×${tr.dmg.toFixed(2)} · crit ×${tr.critRate.toFixed(2)} · critDmg ×${tr.critMulti.toFixed(2)}`]);
      }
      steps.push(["Danno grezzo arma (media)", b.rawMean !== undefined ? b.rawMean.toFixed(2) : "—"]);
      steps.push(["Perk bonus (Axe/Blunt/Spear)", `×${(b.perkBonus || 1).toFixed(2)}`]);
      steps.push(["Forza (hittingMod)", `×${(b.strengthMod || 1).toFixed(2)}`]);
      steps.push(["Split 1° bersaglio (/0.5)", `÷${(b.splitDivisor || 0.5).toFixed(2)} → ×${(1 / (b.splitDivisor || 0.5)).toFixed(2)}`]);
      steps.push(["RangeDel a max range", `×${(b.rangeDel || 2).toFixed(2)}`]);
    }
    steps.push(["Zombie received (non-player)", `×${(b.nonPlayer || 1.5).toFixed(2)}`]);
    steps.push([state.config.WEAPON_LEVEL_DAMAGE_CURVE ? "Curva abilità sperimentale" : "Moltiplicatore abilità lineare", `×${(b.wpnLevelMod ?? 0.6).toFixed(3)}`]);
    if (!weapon.isRanged) steps.push(["Global melee reduction", `×${(b.meleeReduction || 0.15).toFixed(2)}`]);
    if (weapon.category !== "Unarmed") steps.push([`A terra max(min, critMult)`, `×${floorMult}`]);
    if (state.sandbox.multiHit && (weapon.maxHitCount || 1) > 1 && !weapon.isRanged) {
      const extra = (lvlData.extraTargets || []).map(t => `#${t.target}: ${t.mean.toFixed(2)} HP`).join(" · ");
      steps.push(["Bersagli extra (multi-hit ON)", extra || "nessuno"]);
    } else if (!weapon.isRanged) {
      steps.push(["Multi-hit", "OFF → 1 bersaglio (SandboxOptions)"]);
    }

    el.formulaSteps.innerHTML = steps.map(([k, v]) => `<li><span>${k}</span><span class="num">${v}</span></li>`).join("");
    el.formulaResult.textContent = `${lvlData.damage.freshBody.toFixed(2)} HP`;
    el.formulaNote.textContent = b.isStomp
      ? "IsoGameCharacter.Hit applica il 5x solo se aimAtFloor && !isDoShove. Lo stomp non lo riceve."
      : `Crit ${lvlData.damage.critChance.toFixed(0)}% ×${CombatEngine.getCritMultiplier(weapon)}. A terra e crit si sommano.`;
  }

  // --- RECALCULATE & RENDER ---
  function update() {
    zonePoints.clear();
    const weapon = getActiveWeapon();
    const floorOption = document.querySelector('#zoneHit option[value="floor"]');
    floorOption.disabled = weapon.isRanged;
    if (weapon.isRanged && state.zoneHit === "floor") {
      state.zoneHit = "body";
      document.getElementById("zoneHit").value = "body";
    }
    const scaledWeapon = liveWeapon(weapon);
    const sandboxLive = liveSandbox();
    const zombieHP = CombatEngine.getZombieHP(sandboxLive.toughness, sandboxLive.customHP);
    if (state.tzonyne.enabled) {
      const mix = CombatEngine.zoneZombieMix(state.tzonyne);
      zombieHP.name = `T${mix.tier.id} Shambler`;
      zombieHP.mean = mix.shamblerHP;
    }

    const progression = traceProgression(weapon);
    const activeLvlData = progression.levels[state.selectedSkillLevel];

    // Sync skill indicators
    el.valSkillLevelText.textContent = `Lv ${state.selectedSkillLevel}`;
    el.sliderSkillLevel.value = state.selectedSkillLevel;
    el.skillChips.querySelectorAll(".chip").forEach(c => {
      c.classList.toggle("active", parseInt(c.getAttribute("data-lvl")) === state.selectedSkillLevel);
    });

    // Update Hero KPIs
    const freshMean = activeLvlData.damage.freshBody;
    const hpPct = Math.round((freshMean / zombieHP.mean) * 100);
    el.kpiDmg.textContent = freshMean.toFixed(2);
    el.kpiDmgRange.textContent = `Range roll: ${activeLvlData.damage.freshBodyMin.toFixed(2)} - ${activeLvlData.damage.freshBodyMax.toFixed(2)} HP`;
    el.tagDmgPct.textContent = `${hpPct}% Zombie HP`;

    el.kpiHTK.textContent = activeLvlData.htk.body;
    el.tagHTK.textContent = `${activeLvlData.htk.head} testa | ${activeLvlData.htk.floorBody} terra`;
    el.kpiHTKSub.textContent = `vs ${zombieHP.name} (${zombieHP.mean.toFixed(2)} HP) | Crit ${activeLvlData.damage.critChance.toFixed(0)}%: ${activeLvlData.htk.crit} | Atteso: ${activeLvlData.htk.expectedBody} colpi`;

    el.kpiHits.textContent = activeLvlData.durability.totalExpectedHits === Infinity ? "∞" : Math.round(activeLvlData.durability.totalExpectedHits);
    el.tagDurability.textContent = activeLvlData.durability.expectedHitsPerCond === Infinity ? "Zero usura" : `1 in ${activeLvlData.durability.expectedHitsPerCond} colpi`;
    el.kpiKills.textContent = activeLvlData.kills.body === Infinity ? "∞" : `~${activeLvlData.kills.body} zombie eliminati (colpi al corpo)`;

    const power = CombatEngine.evaluatePowerLevel(activeLvlData, weapon, zombieHP);
    el.kpiPowerScore.textContent = power.score;
    el.kpiPowerScore.style.color = power.color;
    el.tagPowerLevel.textContent = power.tag;
    el.tagPowerLevel.style = power.tagStyle;
    el.kpiPowerDesc.textContent = power.desc;

    // Tactical Analytics Card
    el.tacticalLevelTag.textContent = `Livello ${state.selectedSkillLevel}`;
    if (state.viewMode !== "radar") restoreTacticalLabels();
    el.valStrengthText.textContent = String(state.character.strength);
    if (el.sliderStrength) el.sliderStrength.value = state.character.strength;
    document.getElementById("valFitnessText").textContent = String(state.character.fitnessLevel);
    document.getElementById("sliderFitness").value = state.character.fitnessLevel;
    el.valMaintenanceText.textContent = String(state.character.maintenanceLevel);
    if (el.sliderMaintenance) el.sliderMaintenance.value = state.character.maintenanceLevel;

    const stamina = activeLvlData.endurance.costPerSwing;
    document.getElementById("fitnessNote").textContent = `Forma fisica ${state.character.fitnessLevel}: ${formatZone(stamina * 100)}% fiato / colpo. ${stamina > 0 ? `~${Math.floor(0.25 / stamina)} colpi prima del fiatone, senza recupero.` : "Nessun consumo di mischia."} Non modifica il danno a fatica costante; confrontala con “Fiato / eliminazione”.`;
    el.tacStaminaCost.textContent = stamina.toFixed(4);
    el.tacSwingsToExertion.textContent = stamina <= 0 ? "∞" : `~${activeLvlData.endurance.swingsToExertion} colpi`;
    el.tacTTK.textContent = `~${activeLvlData.ttkSeconds} sec`;
    renderFormulaBreakdown(scaledWeapon, activeLvlData);
    if (el.formulaCard) el.formulaCard.style.display = (state.viewMode === "radar" || state.viewMode === "zones") ? "none" : "flex";

    let tacticDesc = "";
    if (weapon.category === "Unarmed") {
      tacticDesc = "Lo stomp sostituisce il danno arma (roll 0.7–1.0 + Forza×0.2 × stompPower). Non riceve il 5x dei colpi a terra. Il 15x 'combo testa a terra' non si applica allo stomp.";
    } else if (activeLvlData.htk.floorBody === 1) {
      tacticDesc = `A terra ${weapon.name} fa ×${activeLvlData.floorMultiplier} (max del minimo vanilla 5 e critMult ${weapon.critMultiplier}). In piedi servono ${activeLvlData.htk.body} colpi; con crit l'atteso è ${activeLvlData.htk.expectedBody}.`;
    } else {
      tacticDesc = `In piedi: ${activeLvlData.htk.body} colpi al corpo (atteso ${activeLvlData.htk.expectedBody} con crit ${activeLvlData.damage.critChance.toFixed(0)}%). Testa: ${activeLvlData.htk.head}. Autonomia ~${activeLvlData.endurance.swingsToExertion} swing prima del fiatone.`;
    }
    el.tacSummaryText.textContent = tacticDesc;

    // Synchronize Rebalance Slider Labels
    const isVanillaFloor = Math.abs(state.config.FLOOR_DAMAGE_MIN_MULTIPLIER - COMBAT_CONFIG_DEFAULTS.FLOOR_DAMAGE_MIN_MULTIPLIER) < 0.05 && !state.config.FLOOR_DAMAGE_FLAT;
    const isVanillaHead = Math.abs(state.config.HEAD_HIT_DAMAGE_SPLIT_MODIFIER - COMBAT_CONFIG_DEFAULTS.HEAD_HIT_DAMAGE_SPLIT_MODIFIER) < 0.05;
    const isVanillaIncr = Math.abs(state.config.WEAPON_LEVEL_DAMAGE_MULTIPLIER_INCREMENT - COMBAT_CONFIG_DEFAULTS.WEAPON_LEVEL_DAMAGE_MULTIPLIER_INCREMENT) < 0.005;
    const isVanillaWear = Math.abs(state.config.DURABILITY_WEAR_SCALE - COMBAT_CONFIG_DEFAULTS.DURABILITY_WEAR_SCALE) < 0.05;

    el.sliderFloorMult.value = state.config.FLOOR_DAMAGE_MIN_MULTIPLIER;
    el.valFloorMult.textContent = `${state.config.FLOOR_DAMAGE_MIN_MULTIPLIER.toFixed(1)}x ${state.config.FLOOR_DAMAGE_FLAT ? "(piatto)" : "min"} ${isVanillaFloor ? "(Vanilla)" : "(Mod)"}`;
    el.valFloorMult.classList.toggle("rebalanced", !isVanillaFloor);

    el.sliderHeadMult.value = state.config.HEAD_HIT_DAMAGE_SPLIT_MODIFIER;
    el.valHeadMult.textContent = `${state.config.HEAD_HIT_DAMAGE_SPLIT_MODIFIER.toFixed(1)}x ${isVanillaHead ? "(Vanilla)" : "(Mod)"}`;
    el.valHeadMult.classList.toggle("rebalanced", !isVanillaHead);

    el.sliderSkillIncr.value = state.config.WEAPON_LEVEL_DAMAGE_MULTIPLIER_INCREMENT;
    el.valSkillIncr.textContent = `${state.config.WEAPON_LEVEL_DAMAGE_MULTIPLIER_INCREMENT.toFixed(2)} ${isVanillaIncr ? "(Vanilla)" : "(Mod)"}`;
    el.valSkillIncr.classList.toggle("rebalanced", !isVanillaIncr);
    el.sliderSkillIncr.disabled = !!state.config.WEAPON_LEVEL_DAMAGE_CURVE;
    if (state.config.WEAPON_LEVEL_DAMAGE_CURVE) el.valSkillIncr.textContent = "Curva RPG attiva";

    el.sliderWearScale.value = state.config.DURABILITY_WEAR_SCALE;
    el.valWearScale.textContent = `${state.config.DURABILITY_WEAR_SCALE.toFixed(1)}x ${isVanillaWear ? "(Vanilla)" : "(Mod)"}`;
    el.valWearScale.classList.toggle("rebalanced", !isVanillaWear);

    // Visibility toggles
    el.floorScaleToggleGroup.style.display = state.viewMode === "single" ? "flex" : "none";
    el.hordeControlsGroup.style.display = state.viewMode === "horde" ? "flex" : "none";
    const hideVanillaLevers = state.viewMode === "radar";
    el.leverGrid.style.display = hideVanillaLevers ? "none" : "grid";
    el.btnResetVanilla.style.display = hideVanillaLevers ? "none" : "inline-block";
    if (el.tzonyneLevers) el.tzonyneLevers.style.display = state.viewMode === "zones" ? "flex" : "none";
    if (el.heatmapCard) el.heatmapCard.style.display = state.viewMode === "zones" && state.tzonyne.enabled ? "flex" : "none";
    syncTzonyneRibbon();
    document.getElementById("zoneControls").hidden = state.viewMode !== "zones";
    document.getElementById("zoneChartNote").hidden = state.viewMode !== "zones";
    document.getElementById("zoneSelection").hidden = state.viewMode !== "zones";
    document.body.dataset.view = state.viewMode;
    el.viewBtns.forEach(b => b.setAttribute("aria-pressed", String(b.dataset.view === state.viewMode)));
    if (state.viewMode !== "single") el.chartTooltip.style.display = "none";
    // Update Stage & Table depending on View Mode
    if (state.viewMode === "single") {
      el.stageLegend.innerHTML = `<span class="legend-item">Corpo · azzurro</span><span class="legend-item">Testa · verde</span><span class="legend-item" id="legendFloorText"></span><span class="legend-item">Fatica · giallo tratteggiato</span><span class="legend-item" id="legendZombieHP"></span>`;
      el.legendFloorText = document.getElementById("legendFloorText");
      el.legendZombieHP = document.getElementById("legendZombieHP");
      renderSingleWeaponCanvas(progression);
      renderSingleWeaponTable(progression);
      el.stageTitle.textContent = `Analisi Singola: ${weapon.name} [${weapon.category}]`;
      el.stageSubtitle.textContent = `Corpo, testa ×${state.config.HEAD_HIT_DAMAGE_SPLIT_MODIFIER.toFixed(1)}, a terra ×${activeLvlData.floorMultiplier} (max del minimo e critMult), fatica. Multi-hit ${state.sandbox.multiHit ? "ON" : "OFF"}.`;
      el.panelTableTitle.textContent = `Matrice Dettagliata per Livello: ${weapon.name}`;
      el.panelTableSub.textContent = `Clicca su una riga per analizzare quel livello specifico (Attualmente Lv ${state.selectedSkillLevel})`;
    } else if (state.viewMode === "multi") {
      renderMultiWeaponCanvas();
      renderMultiWeaponTable();
      el.stageTitle.textContent = "Confronto Diretto: Le 7 Armi Principali di Project Zomboid";
      el.stageSubtitle.textContent = "Curve di danno a confronto sullo stesso grafico per valutare differenze di classe e scalabilità";
      el.panelTableTitle.textContent = "Classifica e Matrice Comparativa Armi";
      el.panelTableSub.textContent = "Confronto rapido di efficienza, colpi per uccidere e longevità";
    } else if (state.viewMode === "diff") {
      renderDiffCanvas(weapon);
      renderDiffTable(weapon);
      el.stageTitle.textContent = `Parametri Java originali vs modificati · ${weapon.name}`;
      el.stageSubtitle.textContent = "Continue = Java originale; tratteggiate = leve attive. Stesso personaggio, HP e moltiplicatori TZonyne su entrambi: non è un confronto con un mondo vanilla.";
      el.panelTableTitle.textContent = "Confronto Numerico Delta: Vanilla vs Ribilanciato";
      el.panelTableSub.textContent = "Variazione percentuale esatta calcolata in tempo reale";
    } else if (state.viewMode === "horde") {
      renderHordeCanvas(weapon);
      renderHordeTable(weapon);
      el.stageTitle.textContent = `Simulatore Scontro Orda: ${weapon.name} vs ${state.hordeSize} Zombie`;
      el.stageSubtitle.textContent = `Dinamica della Death Spiral di Stamina: vedi come il danno crolla all'accumularsi della fatica`;
      el.panelTableTitle.textContent = `Log Scontro Round-by-Round (${state.hordeSize} Zombie)`;
      el.panelTableSub.textContent = `Tracciamento di stamina consumata, colpi necessari e stato di fatica`;
    } else if (state.viewMode === "radar") {
      renderRadarCanvas(weapon);
      renderKnockdownCard(weapon);
      el.stageTitle.textContent = `Radar Multidimensionale & Stun-Lock: ${weapon.name}`;
      el.stageSubtitle.textContent = `Confronto a 6 assi (Letalità, Longevità, Fiato, Portata, CC, Velocità) & Probabilità Atterramento Java`;
      el.panelTableTitle.textContent = `Anatomia dello Stun-Lock: La Catena dello Stomp`;
      el.panelTableSub.textContent = "Spinte successive: roll ripetuto, non atterramento garantito. Tempi e punteggi radar sono stime.";
    } else if (state.viewMode === "zones") {
      renderZoneCanvas();
      renderZoneTable();
      renderHeatmap(weapon);
      const cur = zonePoint(state.selectedSkillLevel, currentTier());
      el.stageTitle.textContent = `${weapon.name} · progressione per tier`;
      el.stageSubtitle.textContent = `Curve per abilità · Forza ${state.character.strength} · Forma fisica ${state.character.fitnessLevel}. Seleziona un livello dalla legenda.`;
      el.panelTableTitle.textContent = "Matrice livelli × tier";
      el.panelTableSub.textContent = "Stessa metrica del grafico. Seleziona una cella per fissare livello e tier; le leve modificano solo il tier selezionato.";
      el.panelRightTitle.textContent = `Bilanciamento · T${currentTier().id}`;
      el.panelRightSub.textContent = "Modifica le leve e confronta le curve in tempo reale.";
      document.getElementById("tierLeverHeading").textContent = `Moltiplicatori T${currentTier().id}`;
      el.lblTacMetric1.textContent = "Colpi al bersaglio";
      el.tacStaminaCost.textContent = formatZone(cur.htk);
      el.subTacMetric1.textContent = state.zoneCritical ? "Media con critici, roll medio" : "Senza critici, roll medio";
      el.lblTacMetric2.textContent = "HP per colpo";
      el.tacSwingsToExertion.textContent = formatZone(cur.damage);
      el.subTacMetric2.textContent = `${formatZone(cur.hp)} HP bersaglio`;
      el.lblTacMetric3.textContent = "Margine sul target";
      el.tacTTK.textContent = `${formatZone(cur.power)}%`;
      el.tacTTK.style.color = cur.power >= 100 ? "var(--col-head)" : "var(--col-exerted)";
      el.subTacMetric3.textContent = "100% = budget colpi rispettato";
      el.tacSummaryText.textContent = "Il margine misura solo l’efficienza offensiva: target colpi / colpi calcolati. Non è una probabilità di sopravvivenza. Densità, velocità, precisione, recupero e controllo della folla restano fuori da questo confronto.";
    }
    syncTzonyneLevers();
    renderRpgLab();
    rangeControls.forEach(control => {
      const fraction = (Number(control.value) - Number(control.min)) / (Number(control.max) - Number(control.min));
      control.style.setProperty("--range-fill", `${fraction * 100}%`);
    });
  }

  // --- CANVAS 1: SINGLE WEAPON MULTI-TRACE ---
  function renderSingleWeaponCanvas(progression) {
    const canvas = el.mainCanvas;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = (canvas.width = canvas.parentElement.clientWidth * dpr);
    const h = (canvas.height = canvas.parentElement.clientHeight * dpr);
    ctx.scale(dpr, dpr);
    const width = w / dpr;
    const height = h / dpr;

    ctx.clearRect(0, 0, width, height);

    const pad = { top: 35, right: 60, bottom: 45, left: 60 };
    const chartW = width - pad.left - pad.right;
    const chartH = height - pad.top - pad.bottom;

    const zHP = progression.zombieHP.mean;
    el.legendZombieHP.textContent = `Zombie HP (${zHP.toFixed(2)})`;
    const fl = progression.floorMultiplier || progression.levels[state.selectedSkillLevel].floorMultiplier;
    el.legendFloorText.textContent = state.floorOverkillMode
      ? `Testa a terra (×${fl} × ${state.config.HEAD_HIT_DAMAGE_SPLIT_MODIFIER.toFixed(1)})`
      : `A Terra (×${fl})`;

    const floorSeries = progression.levels.map(l => state.floorOverkillMode ? l.damage.floorHead : l.damage.floorBody);

    const maxDamageVal = Math.max(
      ...progression.levels.map(l => Math.max(l.damage.head, l.damage.freshBody, zHP * 1.1)),
      ...floorSeries
    );
    const maxY = Math.ceil(maxDamageVal * 1.1) || 6;

    const getX = lvl => pad.left + (lvl / 10) * chartW;
    const getY = val => pad.top + chartH - (val / maxY) * chartH;

    // Grid lines & labels
    ctx.strokeStyle = INK.line;
    ctx.lineWidth = 1;
    ctx.fillStyle = INK.dim;
    ctx.font = FONT;
    ctx.textAlign = "right";

    for (let i = 0; i <= 5; i++) {
      const v = (maxY / 5) * i;
      const y = getY(v);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + chartW, y);
      ctx.stroke();
      ctx.fillText(v.toFixed(1) + " HP", pad.left - 10, y + 4);
    }

    ctx.textAlign = "center";
    for (let lvl = 0; lvl <= 10; lvl++) {
      const x = getX(lvl);
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, pad.top + chartH);
      ctx.stroke();
      ctx.fillText("Lv " + lvl, x, pad.top + chartH + 20);
    }

    // Zombie HP Threshold Band
    const zY = getY(zHP);
    ctx.save();
    ctx.fillStyle = "rgba(196, 92, 74, 0.08)";
    ctx.fillRect(pad.left, pad.top, chartW, Math.max(0, zY - pad.top));
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = INK.alarm;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pad.left, zY);
    ctx.lineTo(pad.left + chartW, zY);
    ctx.stroke();
    ctx.fillStyle = INK.alarm;
    ctx.textAlign = "left";
    ctx.font = FONT_BOLD;
    ctx.fillText(`Zombie HP (${zHP.toFixed(2)}) — Zona 1-Hit Kill`, pad.left + 8, zY - 6);
    ctx.restore();

    // Min-Max Area Band for Fresh Body Damage
    ctx.fillStyle = "rgba(228, 210, 168, 0.10)";
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(progression.levels[0].damage.freshBodyMin));
    for (let lvl = 1; lvl <= 10; lvl++) ctx.lineTo(getX(lvl), getY(progression.levels[lvl].damage.freshBodyMin));
    for (let lvl = 10; lvl >= 0; lvl--) ctx.lineTo(getX(lvl), getY(progression.levels[lvl].damage.freshBodyMax));
    ctx.closePath();
    ctx.fill();

    const drawTrace = (vals, color, width = 2.5, dash = [], mark = "circle") => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = width;
      if (dash.length) ctx.setLineDash(dash);
      ctx.beginPath();
      vals.forEach((v, idx) => {
        const x = getX(idx);
        const y = getY(v);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
      vals.forEach((v, idx) => {
        const x = getX(idx);
        const y = getY(v);
        fillMarker(ctx, x, y, mark, idx === state.selectedSkillLevel ? 5 : 3.2);
        if (idx === state.selectedSkillLevel) {
          ctx.strokeStyle = INK.ground;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.strokeStyle = color;
        }
      });
      ctx.restore();
    };

    drawTrace(floorSeries, INK.figureAlarm, 2.4, [], "triangle");
    drawTrace(progression.levels.map(l => l.damage.head), INK.median, 2.2, [5, 3], "square");
    drawTrace(progression.levels.map(l => l.damage.freshBody), INK.figure, 2.6, [], "circle");
    drawTrace(progression.levels.map(l => l.damage.exerted), INK.sage, 1.8, [4, 4], "circle");
    drawTrace(progression.levels.map(l => l.damage.exhausted), INK.ghost, 1.5, [1, 3], "diamond");

    // Crossing Annotations
    const floorCrossLvl = floorSeries.findIndex(v => v >= zHP);
    if (floorCrossLvl !== -1) {
      const cx = getX(floorCrossLvl);
      const cy = getY(floorSeries[floorCrossLvl]);
      ctx.fillStyle = INK.figureAlarm;
      ctx.font = FONT_BOLD;
      ctx.textAlign = "center";
      ctx.fillText(`1-Shot Terra (Lv ${floorCrossLvl})`, cx, cy - 10);
    }

    const headCrossLvl = progression.levels.findIndex(l => l.damage.head >= zHP);
    if (headCrossLvl !== -1 && headCrossLvl !== floorCrossLvl) {
      const cx = getX(headCrossLvl);
      const cy = getY(progression.levels[headCrossLvl].damage.head);
      ctx.fillStyle = INK.median;
      ctx.font = FONT_BOLD;
      ctx.textAlign = "center";
      ctx.fillText(`1-Shot Testa (Lv ${headCrossLvl})`, cx, cy - 10);
    }

    // Interactive Hover Crosshair
    const targetLvl = state.hoverLevel !== null ? state.hoverLevel : state.selectedSkillLevel;
    if (targetLvl !== null) {
      const hx = getX(targetLvl);
      ctx.strokeStyle = INK.ghost;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hx, pad.top);
      ctx.lineTo(hx, pad.top + chartH);
      ctx.stroke();

      const lData = progression.levels[targetLvl];
      el.chartTooltip.style.display = "flex";
      el.chartTooltip.innerHTML = `
        <div class="tooltip-title"><span>Livello Abilità ${targetLvl}</span><span>${CombatEngine.getWeaponLevelDamageModifier(targetLvl, state.config).toFixed(3)}× mult</span></div>
        <div class="tooltip-row"><span class="tooltip-key" style="color:var(--col-fresh)">Corpo Ottimale:</span><span class="tooltip-val">${lData.damage.freshBody.toFixed(2)} HP (${lData.htk.body} colpi)</span></div>
        <div class="tooltip-row"><span class="tooltip-key" style="color:var(--col-head)">Colpo Testa:</span><span class="tooltip-val">${lData.damage.head.toFixed(2)} HP (${lData.htk.head} colpi)</span></div>
        <div class="tooltip-row"><span class="tooltip-key" style="color:var(--col-floor)">A Terra:</span><span class="tooltip-val">${(state.floorOverkillMode ? lData.damage.floorHead : lData.damage.floorBody).toFixed(2)} HP (${state.floorOverkillMode ? lData.htk.floorHead : lData.htk.floorBody} colpi)</span></div>
        <div class="tooltip-row"><span class="tooltip-key">HTK atteso (crit ${lData.damage.critChance.toFixed(0)}%):</span><span class="tooltip-val">${lData.htk.expectedBody} colpi</span></div>
        <div class="tooltip-row"><span class="tooltip-key" style="color:var(--col-exerted)">Fatica Moderata (-50%):</span><span class="tooltip-val">${lData.damage.exerted.toFixed(2)} HP (${lData.htk.exerted} colpi)</span></div>
        <div class="tooltip-row"><span class="tooltip-key" style="color:var(--col-exhausted)">Esausto (-95%):</span><span class="tooltip-val">${lData.damage.exhausted.toFixed(2)} HP (${lData.htk.exhausted} colpi)</span></div>
        <div class="tooltip-row" style="margin-top:4px; border-top:1px solid var(--border-subtle); padding-top:4px;"><span class="tooltip-key">Longevità Arma:</span><span class="tooltip-val" style="color:var(--col-head)">~${lData.kills.body} zombie eliminati</span></div>
      `;
    } else {
      el.chartTooltip.style.display = "none";
    }
  }

  // --- CANVAS 2: MULTI-WEAPON OVERLAY ---
  function comparisonSet() {
    const selected = getActiveWeapon();
    const list = [...comparisonWeapons];
    if (selected && !list.some(w => w.id === selected.id)) list.unshift(selected);
    return list;
  }

  function renderMultiWeaponCanvas() {
    const canvas = el.mainCanvas;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = (canvas.width = canvas.parentElement.clientWidth * dpr);
    const h = (canvas.height = canvas.parentElement.clientHeight * dpr);
    ctx.scale(dpr, dpr);
    const width = w / dpr;
    const height = h / dpr;

    ctx.clearRect(0, 0, width, height);

    const pad = { top: 35, right: 60, bottom: 45, left: 60 };
    const chartW = width - pad.left - pad.right;
    const chartH = height - pad.top - pad.bottom;

    const zHP = CombatEngine.getZombieHP(liveSandbox().toughness, liveSandbox().customHP).mean;
    const curves = comparisonSet().map((wpn, idx) => {
      const prog = traceProgression(wpn);
      return {
        wpn,
        color: TRACE_INKS[idx % TRACE_INKS.length],
        dash: TRACE_DASHES[idx % TRACE_DASHES.length],
        mark: TRACE_MARKS[idx % TRACE_MARKS.length],
        prog
      };
    });

    const maxD = Math.max(...curves.flatMap(c => c.prog.levels.map(l => l.damage.freshBody)), zHP * 1.1);
    const maxY = Math.ceil(maxD * 1.1) || 5;

    const getX = lvl => pad.left + (lvl / 10) * chartW;
    const getY = val => pad.top + chartH - (val / maxY) * chartH;

    // Grid
    ctx.strokeStyle = INK.line;
    ctx.lineWidth = 1;
    ctx.fillStyle = INK.dim;
    ctx.font = FONT;
    ctx.textAlign = "right";

    for (let i = 0; i <= 5; i++) {
      const v = (maxY / 5) * i;
      const y = getY(v);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + chartW, y);
      ctx.stroke();
      ctx.fillText(v.toFixed(1) + " HP", pad.left - 10, y + 4);
    }

    ctx.textAlign = "center";
    for (let lvl = 0; lvl <= 10; lvl++) {
      const x = getX(lvl);
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, pad.top + chartH);
      ctx.stroke();
      ctx.fillText("Lv " + lvl, x, pad.top + chartH + 20);
    }

    // Zombie HP line
    const zY = getY(zHP);
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = INK.alarm;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pad.left, zY);
    ctx.lineTo(pad.left + chartW, zY);
    ctx.stroke();
    ctx.fillStyle = INK.alarm;
    ctx.textAlign = "left";
    ctx.fillText(`Zombie HP (${zHP.toFixed(2)})`, pad.left + 8, zY - 6);
    ctx.restore();

    curves.forEach(c => {
      ctx.save();
      ctx.strokeStyle = c.color;
      ctx.fillStyle = c.color;
      ctx.lineWidth = c.wpn.id === state.selectedWeaponId ? 2.8 : 1.7;
      if (c.dash.length) ctx.setLineDash(c.dash);
      ctx.beginPath();
      c.prog.levels.forEach((l, idx) => {
        const x = getX(idx);
        const y = getY(l.damage.freshBody);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
      c.prog.levels.forEach((l, idx) => {
        fillMarker(ctx, getX(idx), getY(l.damage.freshBody), c.mark, c.wpn.id === state.selectedWeaponId ? 4 : 3);
      });
      ctx.restore();
    });

    el.stageLegend.innerHTML = curves.map(c => `
      <div class="legend-item" style="cursor:pointer;" onclick="selectWeapon('${c.wpn.id}')">
        <div class="legend-swatch" style="background:${c.color};"></div>
        <span style="color:${c.wpn.id === state.selectedWeaponId ? 'var(--figure-ink)' : 'var(--ink-dim)'}; font-weight:${c.wpn.id === state.selectedWeaponId ? '700' : '500'}">${c.wpn.name}</span>
      </div>
    `).join("") + `<div class="legend-item"><div class="legend-swatch pat-zombie"></div><span>Zombie HP</span></div>`;
  }

  // --- CANVAS 3: DIFF VANILLA VS REBALANCED ---
  function renderDiffCanvas(weapon) {
    const canvas = el.mainCanvas;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = (canvas.width = canvas.parentElement.clientWidth * dpr);
    const h = (canvas.height = canvas.parentElement.clientHeight * dpr);
    ctx.scale(dpr, dpr);
    const width = w / dpr;
    const height = h / dpr;

    ctx.clearRect(0, 0, width, height);

    const pad = { top: 35, right: 60, bottom: 45, left: 60 };
    const chartW = width - pad.left - pad.right;
    const chartH = height - pad.top - pad.bottom;

    const zHP = CombatEngine.getZombieHP(liveSandbox().toughness, liveSandbox().customHP).mean;
    const progVanilla = CombatEngine.generateMultiTraceProgression(liveWeapon(weapon), liveCharacter(), liveSandbox(), COMBAT_CONFIG_DEFAULTS);
    const progRebalanced = CombatEngine.generateMultiTraceProgression(liveWeapon(weapon), liveCharacter(), liveSandbox(), state.config);

    const maxD = Math.max(
      ...progVanilla.levels.map(l => Math.max(l.damage.floorBody, l.damage.freshBody)),
      ...progRebalanced.levels.map(l => Math.max(l.damage.floorBody, l.damage.freshBody)),
      zHP * 1.1
    );
    const maxY = Math.ceil(maxD * 1.1) || 5;

    const getX = lvl => pad.left + (lvl / 10) * chartW;
    const getY = val => pad.top + chartH - (val / maxY) * chartH;

    // Grid
    ctx.strokeStyle = INK.line;
    ctx.lineWidth = 1;
    ctx.fillStyle = INK.dim;
    ctx.font = FONT;
    ctx.textAlign = "right";

    for (let i = 0; i <= 5; i++) {
      const v = (maxY / 5) * i;
      const y = getY(v);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + chartW, y);
      ctx.stroke();
      ctx.fillText(v.toFixed(1) + " HP", pad.left - 10, y + 4);
    }

    ctx.textAlign = "center";
    for (let lvl = 0; lvl <= 10; lvl++) {
      const x = getX(lvl);
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, pad.top + chartH);
      ctx.stroke();
      ctx.fillText("Lv " + lvl, x, pad.top + chartH + 20);
    }

    // Zombie HP
    const zY = getY(zHP);
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = INK.alarm;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pad.left, zY);
    ctx.lineTo(pad.left + chartW, zY);
    ctx.stroke();
    ctx.restore();

    // Draw Traces
    const drawTrace = (vals, color, width = 2.5, dashed = false) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      if (dashed) ctx.setLineDash([5, 5]);
      ctx.beginPath();
      vals.forEach((v, idx) => {
        const x = getX(idx);
        const y = getY(v);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.restore();
    };

    drawTrace(progVanilla.levels.map(l => l.damage.floorBody), INK.figureAlarm, 3, false); // Vanilla Floor
    drawTrace(progVanilla.levels.map(l => l.damage.freshBody), INK.figure, 3, false); // Vanilla Body

    drawTrace(progRebalanced.levels.map(l => l.damage.floorBody), INK.amber, 3, true); // Rebalanced Floor
    drawTrace(progRebalanced.levels.map(l => l.damage.freshBody), INK.median, 2.5, true); // Rebalanced Body

    el.stageLegend.innerHTML = `
      <div class="legend-item"><div class="legend-swatch pat-floor"></div><span>Vanilla: A Terra (max 5, crit)</span></div>
      <div class="legend-item"><div class="legend-swatch pat-body"></div><span>Vanilla: Corpo</span></div>
      <div class="legend-item"><div class="legend-swatch pat-ref"></div><span>Attivo: A Terra (${state.config.FLOOR_DAMAGE_FLAT ? "piatto " : "min "}${state.config.FLOOR_DAMAGE_MIN_MULTIPLIER.toFixed(1)}x)</span></div>
      <div class="legend-item"><div class="legend-swatch pat-head"></div><span>Ribilanciato: Corpo</span></div>
      <div class="legend-item"><div class="legend-swatch pat-zombie"></div><span>Zombie HP</span></div>
    `;
  }

  // --- CANVAS 4: HORDE COMBAT & DEATH SPIRAL ---
  function renderHordeCanvas(weapon) {
    const canvas = el.mainCanvas;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = (canvas.width = canvas.parentElement.clientWidth * dpr);
    const h = (canvas.height = canvas.parentElement.clientHeight * dpr);
    ctx.scale(dpr, dpr);
    const width = w / dpr;
    const height = h / dpr;

    ctx.clearRect(0, 0, width, height);

    const pad = { top: 35, right: 60, bottom: 45, left: 60 };
    const chartW = width - pad.left - pad.right;
    const chartH = height - pad.top - pad.bottom;

    const sim = CombatEngine.simulateHordeCombat(liveWeapon(weapon), state.hordeSize, state.hordeTactic, liveCharacter(), liveSandbox(), state.config);
    const totalRounds = sim.rounds.length;

    const getX = zIdx => pad.left + ((zIdx - 1) / Math.max(1, state.hordeSize - 1)) * chartW;
    const getYEndurance = pct => pad.top + chartH - (pct / 100) * chartH;

    // Background Shaded Exertion Bands
    const y100 = getYEndurance(100);
    const y75 = getYEndurance(75);
    const y50 = getYEndurance(50);
    const y25 = getYEndurance(25);
    const y10 = getYEndurance(10);
    const y0 = getYEndurance(0);

    ctx.fillStyle = "rgba(138, 147, 120, 0.08)";
    ctx.fillRect(pad.left, y100, chartW, y75 - y100);
    hatchFill(ctx, pad.left, y75, chartW, y50 - y75, INK.sage, 6);
    hatchFill(ctx, pad.left, y50, chartW, y25 - y50, INK.figureAlarm, 5);
    hatchFill(ctx, pad.left, y25, chartW, y0 - y25, INK.alarm, 3);

    // Grid lines & Exertion Labels
    ctx.strokeStyle = INK.line;
    ctx.lineWidth = 1;
    ctx.fillStyle = INK.dim;
    ctx.font = FONT_SM;
    ctx.textAlign = "right";

    [100, 75, 50, 25, 10, 0].forEach(p => {
      const y = getYEndurance(p);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + chartW, y);
      ctx.stroke();
      ctx.fillText(p + "%", pad.left - 8, y + 3);
    });

    // Exertion Level Tag Labels on right
    ctx.textAlign = "left";
    ctx.fillStyle = INK.median;
    ctx.fillText("Fresco (100%)", pad.left + chartW + 8, y100 + 12);
    ctx.fillStyle = INK.sage;
    ctx.fillText("Fiatone (-50%)", pad.left + chartW + 8, y75 + 12);
    ctx.fillStyle = INK.figureAlarm;
    ctx.fillText("Fatica (-80%)", pad.left + chartW + 8, y50 + 12);
    ctx.fillStyle = INK.alarm;
    ctx.fillText("Sfinimento (-95%)", pad.left + chartW + 8, y25 + 12);

    // X Axis: Zombie count
    ctx.textAlign = "center";
    ctx.fillStyle = INK.dim;
    for (let z = 1; z <= state.hordeSize; z += Math.max(1, Math.floor(state.hordeSize / 10))) {
      const x = getX(z);
      ctx.fillText(`Zombie #${z}`, x, pad.top + chartH + 20);
    }

    // Plot Endurance Line (Cyan to Orange to Red)
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    sim.rounds.forEach((r, idx) => {
      const x = getX(r.zombieIndex);
      const y = getYEndurance(r.endurancePct);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = INK.figure;
    ctx.stroke();

    // Data points
    sim.rounds.forEach(r => {
      const x = getX(r.zombieIndex);
      const y = getYEndurance(r.endurancePct);
      ctx.fillStyle = r.endurancePct <= 25 ? INK.alarm : r.endurancePct <= 50 ? INK.figureAlarm : r.endurancePct <= 75 ? INK.sage : INK.figure;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // Cliff Point Marker (Exertion 1 Trigger)
    if (sim.cliffExertion1 !== null && sim.cliffExertion1 <= state.hordeSize) {
      const cx = getX(sim.cliffExertion1);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = INK.sage;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, pad.top);
      ctx.lineTo(cx, pad.top + chartH);
      ctx.stroke();

      ctx.fillStyle = INK.sage;
      ctx.font = FONT_BOLD;
      ctx.textAlign = "center";
      ctx.fillText(`PUNTO DI ROTTURA (Zombie #${sim.cliffExertion1})`, cx, pad.top - 12);
      ctx.restore();
    }

    el.stageLegend.innerHTML = `
      <div class="legend-item"><div class="legend-swatch pat-body"></div><span>Stamina residua (%)</span></div>
      <div class="legend-item"><div class="legend-swatch pat-exerted"></div><span>Zona fiatone (−50% danno)</span></div>
      <div class="legend-item"><div class="legend-swatch pat-floor"></div><span>Zona collasso (−95% danno)</span></div>
      <div class="legend-item"><div class="legend-swatch pat-exhausted"></div><span>Cliff point inizio spirale</span></div>
    `;
  }

  // --- CANVAS 5: RADAR / SPIDER CHART ---
  function renderRadarCanvas(weapon) {
    const canvas = el.mainCanvas;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = (canvas.width = canvas.parentElement.clientWidth * dpr);
    const h = (canvas.height = canvas.parentElement.clientHeight * dpr);
    ctx.scale(dpr, dpr);
    const width = w / dpr;
    const height = h / dpr;

    ctx.clearRect(0, 0, width, height);

    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(centerX, centerY) - 45;

    const metricsActive = CombatEngine.computeRadarMetrics(liveWeapon(weapon), liveCharacter(), state.config, liveSandbox());
    // Baseline reference: Crowbar
    const refWeapon = allWeapons.find(w => w.id === "Crowbar") || allWeapons[1];
    const metricsRef = CombatEngine.computeRadarMetrics(liveWeapon(refWeapon), liveCharacter(), state.config, liveSandbox());

    const numAxes = 6;
    const angleStep = (Math.PI * 2) / numAxes;

    // Draw Web / Rings
    ctx.strokeStyle = INK.line;
    ctx.lineWidth = 1;
    for (let level = 1; level <= 5; level++) {
      const r = (radius / 5) * level;
      ctx.beginPath();
      for (let i = 0; i < numAxes; i++) {
        const angle = i * angleStep - Math.PI / 2;
        const x = centerX + Math.cos(angle) * r;
        const y = centerY + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }

    // Draw Spoke Lines & Labels
    ctx.font = FONT_BOLD;
    for (let i = 0; i < numAxes; i++) {
      const angle = i * angleStep - Math.PI / 2;
      const spokeX = centerX + Math.cos(angle) * radius;
      const spokeY = centerY + Math.sin(angle) * radius;

      ctx.strokeStyle = INK.line;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(spokeX, spokeY);
      ctx.stroke();

      // Label text
      const labelX = centerX + Math.cos(angle) * (radius + 22);
      const labelY = centerY + Math.sin(angle) * (radius + 18);
      ctx.fillStyle = INK.ink;
      ctx.textAlign = Math.abs(Math.cos(angle)) < 0.2 ? "center" : Math.cos(angle) > 0 ? "left" : "right";
      ctx.fillText(metricsActive.axes[i].label, labelX, labelY);
    }

    // Helper to draw radar polygon
    const drawPolygon = (metrics, strokeColor, fillColor) => {
      ctx.beginPath();
      metrics.axes.forEach((axis, i) => {
        const angle = i * angleStep - Math.PI / 2;
        const r = (axis.value / 100) * radius;
        const x = centerX + Math.cos(angle) * r;
        const y = centerY + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Vertex dots
      metrics.axes.forEach((axis, i) => {
        const angle = i * angleStep - Math.PI / 2;
        const r = (axis.value / 100) * radius;
        const x = centerX + Math.cos(angle) * r;
        const y = centerY + Math.sin(angle) * r;
        ctx.fillStyle = strokeColor;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      });
    };

    // Draw Reference (Crowbar) Polygon
    drawPolygon(metricsRef, INK.amber, "rgba(214, 161, 26, 0.12)");
    drawPolygon(metricsActive, INK.figure, "rgba(228, 210, 168, 0.16)");

    el.stageLegend.innerHTML = `
      <div class="legend-item"><div class="legend-swatch pat-active"></div><span>${weapon.name} (arma attiva)</span></div>
      <div class="legend-item"><div class="legend-swatch pat-ref"></div><span>${refWeapon.name} (benchmark)</span></div>
    `;
  }

  // --- TABLES RENDERING ---
  function renderSingleWeaponTable(progression) {
    el.tableHeadRow.innerHTML = `
      <th>Livello</th>
      <th>Corpo (Roll)</th>
      <th>Headshot</th>
      <th>A Terra</th>
      <th>Fatica (-50%)</th>
      <th>HTK Corpo</th>
      <th>HTK Testa</th>
      <th>HTK Terra</th>
      <th>Longevità Zombie</th>
    `;
    el.tableBody.innerHTML = "";

    progression.levels.forEach(l => {
      const tr = document.createElement("tr");
      if (l.skillLevel === state.selectedSkillLevel) tr.classList.add("selected");
      tr.style.cursor = "pointer";
      tr.onclick = () => {
        state.selectedSkillLevel = l.skillLevel;
        update();
      };

      tr.innerHTML = `
        <td><strong>Livello ${l.skillLevel}</strong> ${l.skillLevel === state.selectedSkillLevel ? "★" : ""}</td>
        <td>${l.damage.freshBody.toFixed(2)} HP <span style="color:var(--text-dim)">(${l.damage.freshBodyMin.toFixed(2)}-${l.damage.freshBodyMax.toFixed(2)})</span></td>
        <td style="color:var(--col-head)">${l.damage.head.toFixed(2)} HP</td>
        <td style="color:var(--col-floor)">${l.damage.floorBody.toFixed(2)} HP</td>
        <td style="color:var(--col-exerted)">${l.damage.exerted.toFixed(2)} HP</td>
        <td><span class="badge-htk ${htkBadgeClass(l.htk.body)}">${l.htk.body} <span style="opacity:.7">(~${l.htk.expectedBody})</span></span></td>
        <td><span class="badge-htk ${htkBadgeClass(l.htk.head)}">${l.htk.head}</span></td>
        <td><span class="badge-htk ${htkBadgeClass(l.htk.floorBody)}">${l.htk.floorBody}</span></td>
        <td><strong>${l.kills.body === Infinity ? "∞" : l.kills.body}</strong></td>
      `;
      el.tableBody.appendChild(tr);
    });
  }

  function renderMultiWeaponTable() {
    el.tableHeadRow.innerHTML = `
      <th>Arma</th>
      <th>Categoria</th>
      <th>Danno Lv ${state.selectedSkillLevel}</th>
      <th>Danno Lv 10</th>
      <th>HTK Lv ${state.selectedSkillLevel}</th>
      <th>HTK Lv 10</th>
      <th>Colpi Totali</th>
      <th>Zombie Kills</th>
      <th>Valutazione</th>
    `;
    el.tableBody.innerHTML = "";

    comparisonSet().forEach(w => {
      const prog = traceProgression(w);
      const lvAct = prog.levels[state.selectedSkillLevel];
      const lv10 = prog.levels[10];

      let evalTag = "Bilanciata";
      let tagClass = "htk-2";
      if (lvAct.kills.body > 180 || lvAct.htk.floorBody === 1 && lvAct.htk.body <= 2) {
        evalTag = "Eccessiva (OP)";
        tagClass = "htk-high";
      } else if (lvAct.kills.body > 100) {
        evalTag = "Forte";
        tagClass = "htk-3";
      }

      const tr = document.createElement("tr");
      if (w.id === state.selectedWeaponId) tr.classList.add("selected");
      tr.style.cursor = "pointer";
      tr.onclick = () => {
        window.selectWeapon(w.id);
      };

      tr.innerHTML = `
        <td><strong>${w.name}</strong></td>
        <td>${w.category}</td>
        <td>${lvAct.damage.freshBody.toFixed(2)} HP</td>
        <td style="color:var(--col-fresh)">${lv10.damage.freshBody.toFixed(2)} HP</td>
        <td><span class="badge-htk ${lvAct.htk.body <= 1 ? "htk-1" : lvAct.htk.body <= 2 ? "htk-2" : "htk-high"}">${lvAct.htk.body} colpi</span></td>
        <td><span class="badge-htk ${lv10.htk.body <= 1 ? "htk-1" : "htk-2"}">${lv10.htk.body} colpi</span></td>
        <td>${lvAct.durability.totalExpectedHits === Infinity ? "∞" : Math.round(lvAct.durability.totalExpectedHits)}</td>
        <td><strong>${lvAct.kills.body === Infinity ? "∞" : lvAct.kills.body}</strong></td>
        <td><span class="badge-htk ${tagClass}">${evalTag}</span></td>
      `;
      el.tableBody.appendChild(tr);
    });
  }

  function renderDiffTable(weapon) {
    el.tableHeadRow.innerHTML = `
      <th>Parametro Metrico (Lv ${state.selectedSkillLevel})</th>
      <th>Vanilla B42</th>
      <th>Ribilanciamento Mod</th>
      <th>Variazione Delta</th>
      <th>Impatto sul Gameplay</th>
    `;
    el.tableBody.innerHTML = "";

    const progV = CombatEngine.generateMultiTraceProgression(liveWeapon(weapon), liveCharacter(), liveSandbox(), COMBAT_CONFIG_DEFAULTS);
    const progR = CombatEngine.generateMultiTraceProgression(liveWeapon(weapon), liveCharacter(), liveSandbox(), state.config);
    const lvActV = progV.levels[state.selectedSkillLevel];
    const lvActR = progR.levels[state.selectedSkillLevel];

    const calcDelta = (v, r) => {
      if (v === r) return "0% (Identico)";
      const pct = Math.round(((r - v) / v) * 100);
      return `${pct > 0 ? "+" : ""}${pct}%`;
    };

    const deltaFloor = calcDelta(lvActV.damage.floorBody, lvActR.damage.floorBody);
    const deltaHead = calcDelta(lvActV.damage.head, lvActR.damage.head);
    const deltaBody = calcDelta(lvActV.damage.freshBody, lvActR.damage.freshBody);
    const deltaHits = calcDelta(lvActV.durability.totalExpectedHits, lvActR.durability.totalExpectedHits);
    const deltaKills = calcDelta(lvActV.kills.body, lvActR.kills.body);

    const rows = [
      {
        metric: "Danno a Terra (max(min, critMult))",
        vanilla: `${lvActV.damage.floorBody.toFixed(2)} HP`,
        rebal: `${lvActR.damage.floorBody.toFixed(2)} HP`,
        delta: deltaFloor,
        impact: lvActR.damage.floorBody < lvActV.damage.floorBody ? "Lo stomp e i colpi a terra non shottano più all'istante" : "Valore identico a Vanilla"
      },
      {
        metric: "Danno Colpo alla Testa",
        vanilla: `${lvActV.damage.head.toFixed(2)} HP`,
        rebal: `${lvActR.damage.head.toFixed(2)} HP`,
        delta: deltaHead,
        impact: lvActR.damage.head < lvActV.damage.head ? "Elimina picchi esagerati su colpi fortuiti" : "Valore identico a Vanilla"
      },
      {
        metric: "Danno Corpo in Piedi",
        vanilla: `${lvActV.damage.freshBody.toFixed(2)} HP`,
        rebal: `${lvActR.damage.freshBody.toFixed(2)} HP`,
        delta: deltaBody,
        impact: lvActR.damage.freshBody < lvActV.damage.freshBody ? "Combattimento prolungato e più rischioso" : "Valore identico a Vanilla"
      },
      {
        metric: "Colpi Totali prima della Rottura",
        vanilla: `${lvActV.durability.totalExpectedHits === Infinity ? "∞" : Math.round(lvActV.durability.totalExpectedHits)} colpi`,
        rebal: `${lvActR.durability.totalExpectedHits === Infinity ? "∞" : Math.round(lvActR.durability.totalExpectedHits)} colpi`,
        delta: deltaHits,
        impact: lvActR.durability.totalExpectedHits < lvActV.durability.totalExpectedHits ? "Ripristina la scarsità delle armi e la necessità di riparare" : "Valore identico a Vanilla"
      },
      {
        metric: "Zombie Totali Eliminati con l'Arma",
        vanilla: `~${lvActV.kills.body} zombie`,
        rebal: `~${lvActR.kills.body} zombie`,
        delta: deltaKills,
        impact: lvActR.kills.body < lvActV.kills.body ? "Un'arma non basta più per ripulire un intero quartiere" : "Valore identico a Vanilla"
      }
    ];

    rows.forEach(r => {
      const tr = document.createElement("tr");
      const isZero = r.delta.startsWith("0%");
      tr.innerHTML = `
        <td><strong>${r.metric}</strong></td>
        <td>${r.vanilla}</td>
        <td style="color:${isZero ? 'var(--text-main)' : 'var(--col-rebalanced)'}; font-weight:700;">${r.rebal}</td>
        <td><span class="badge-htk ${isZero ? 'htk-2' : 'htk-high'}">${r.delta}</span></td>
        <td style="color:var(--text-muted); font-size:11px;">${r.impact}</td>
      `;
      el.tableBody.appendChild(tr);
    });
  }

  function renderHordeTable(weapon) {
    el.tableHeadRow.innerHTML = `
      <th>Zombie #</th>
      <th>Stamina Residua</th>
      <th>Colpi Necessari</th>
      <th>Swings Totali</th>
      <th>Danno Effettivo / Hit</th>
      <th>Stato Fisico</th>
    `;
    el.tableBody.innerHTML = "";

    const sim = CombatEngine.simulateHordeCombat(liveWeapon(weapon), state.hordeSize, state.hordeTactic, liveCharacter(), liveSandbox(), state.config);
    sim.rounds.forEach(r => {
      const tr = document.createElement("tr");
      let statusTag = "Fresco";
      let tagClass = "htk-1";
      if (r.endurancePct <= 10) {
        statusTag = "Sfinimento (-95%)";
        tagClass = "htk-high";
      } else if (r.endurancePct <= 25) {
        statusTag = "Fatica Estrema (-90%)";
        tagClass = "htk-high";
      } else if (r.endurancePct <= 50) {
        statusTag = "Fatica Alta (-80%)";
        tagClass = "htk-3";
      } else if (r.endurancePct <= 75) {
        statusTag = "Fiatone (-50%)";
        tagClass = "htk-2";
      }

      tr.innerHTML = `
        <td><strong>Zombie #${r.zombieIndex}</strong></td>
        <td class="num" style="font-weight:700;">${r.endurancePct}%</td>
        <td>${r.swings} colpi</td>
        <td class="num">${r.totalSwings}</td>
        <td>${r.effectiveDmg.toFixed(2)} HP</td>
        <td><span class="badge-htk ${tagClass}">${statusTag}</span></td>
      `;
      el.tableBody.appendChild(tr);
    });
  }

  function renderKnockdownCard(weapon) {
    const kdData = CombatEngine.computeKnockdownProbabilities(weapon, state.character);
    const radarData = CombatEngine.computeRadarMetrics(liveWeapon(weapon), liveCharacter(), state.config, liveSandbox());

    el.tableHeadRow.innerHTML = `
      <th>Asse Tattico</th>
      <th>Punteggio (0-100)</th>
      <th>Descrizione & Statistiche</th>
      <th>Valutazione</th>
    `;
    el.tableBody.innerHTML = "";

    radarData.axes.forEach(a => {
      const tr = document.createElement("tr");
      const tagClass = a.value >= 75 ? "htk-1" : a.value >= 40 ? "htk-2" : "htk-high";
      tr.innerHTML = `
        <td><strong>${a.label}</strong></td>
        <td class="num" style="font-weight:700; color:var(--col-fresh);">${a.value} / 100</td>
        <td>${a.desc}</td>
        <td><span class="badge-htk ${tagClass}">${a.value >= 75 ? "Eccellente" : a.value >= 40 ? "Medio" : "Scarso"}</span></td>
      `;
      el.tableBody.appendChild(tr);
    });

    // Update Right Panel for Knockdown Chain
    el.panelRightTitle.textContent = "Anatomia dello Stun-Lock (La Catena dello Stomp)";
    el.panelRightSub.textContent = "Regole estratte direttamente dal sorgente IsoPlayer.java:3830";

    el.tacCardTitle.textContent = "Probabilità Atterramento & Finisher";
    el.lblTacMetric1.textContent = "Spinta 1: Knockdown";
    el.tacStaminaCost.textContent = `${kdData.shove1KnockdownPct}%`;
    el.subTacMetric1.textContent = "Se fallisce: 100% Stagger";

    el.lblTacMetric2.textContent = "Spinta successiva";
    el.tacSwingsToExertion.textContent = `${kdData.shove2KnockdownPct}%`;
    el.subTacMetric2.textContent = "Stesso roll: il 100% è dead code";
    el.lblTacMetric3.textContent = weapon.alwaysKnockdown ? "AlwaysKnockdown" : "Stomp finisher";
    el.tacTTK.textContent = weapon.alwaysKnockdown ? "90% crit" : `${kdData.shove1KnockdownPct}% KD`;
    el.subTacMetric3.textContent = "Lo stomp NON ha il 5x a terra";

    el.tacSummaryText.innerHTML = `
      <strong>Cosa fa davvero B42.20:</strong><br>
      La prima spinta ha <strong>${kdData.shove1KnockdownPct}%</strong> di knockdown (35 − endurance×5 − panic×1.3 + forza×2).
      Il ramo <code>else if (isDoShove && StaggerBackState) return 100</code> in IsoPlayer.java:3850 <strong>è irraggiungibile</strong>: il primo <code>if (isDoShove)</code> ha già fatto return.
      Ogni spinta ritira lo stesso roll → attese <strong>${kdData.expectedShovesToGround} spinte</strong> per atterrare, non "2 garantite".
      Lo stomp ricalcola il danno dalle scarpe e <strong>non</strong> moltiplica per 5. Il 15x è solo colpo arma a terra in testa (×floor × testa).
    `;
  }


  function syncTzonyneRibbon() {
    if (!el.checkTZonyne) return;
    el.checkTZonyne.checked = !!state.tzonyne.enabled;
    if (el.checkNight) el.checkNight.checked = !!state.tzonyne.night;
    if (el.tierChips) {
      el.tierChips.querySelectorAll(".chip").forEach(c => {
        c.classList.toggle("active", parseInt(c.getAttribute("data-tier")) === state.tzonyne.selectedTier);
      });
    }
  }

  function syncTzonyneLevers() {
    if (!el.sliderTzDmg) return;
    const tier = currentTier();
    el.sliderTzDmg.min = Math.min(0.000001, tier.dmg);
    el.sliderTzDmg.max = Math.max(1.2, tier.dmg);
    el.sliderTzDmg.step = "0.000001";
    el.sliderTzDmg.value = tier.dmg;
    el.valTzDmg.textContent = `${Number(tier.dmg).toLocaleString("it-IT", { maximumFractionDigits: 6 })}×`;
    el.sliderTzCritRate.value = tier.critRate;
    el.valTzCritRate.textContent = `${Number(tier.critRate).toFixed(2)}x`;
    el.sliderTzCritMulti.value = tier.critMulti;
    el.valTzCritMulti.textContent = `${Number(tier.critMulti).toFixed(2)}x`;
    el.sliderTzSprinter.value = tier.sprinterPct;
    el.valTzSprinter.textContent = `${tier.sprinterPct}%`;
    el.sliderTzShamblerHP.value = state.tzonyne.shamblerHP;
    el.sliderTzSprinterHP.value = state.tzonyne.sprinterHP;
    el.valTzHP.textContent = `${Number(state.tzonyne.shamblerHP).toFixed(1)} / ${Number(state.tzonyne.sprinterHP).toFixed(2)}`;
    el.sliderTzTarget.value = state.tzonyne.survivalHtk;
    el.valTzTarget.textContent = `${state.tzonyne.survivalHtk} colpi`;
  }

  function mutateCurrentTier(patch) {
    const id = state.tzonyne.selectedTier;
    state.tzonyne.tiers = state.tzonyne.tiers.map(t => t.id === id ? { ...t, ...patch } : t);
  }

  function formatZone(value) {
    return Number.isFinite(value) ? value.toLocaleString("it-IT", { maximumFractionDigits: 2 }) : "∞";
  }

  function zonePoint(skill, tier, baseline = false) {
    const source = baseline ? zoneBaseline : state;
    const tz = { ...source.tzonyne, selectedTier: tier.id };
    const key = `${skill}:${tier.id}:${baseline}`;
    if (zonePoints.has(key)) return zonePoints.get(key);
    const character = { ...state.character, skillLevel: skill, moodles: { endurance: state.zoneFatigue } };
    const weapon = CombatEngine.applyTZonyneWeapon(getActiveWeapon(), tz, character);
    const mix = CombatEngine.zoneZombieMix(tz);
    const hp = tz.enabled
      ? (state.zoneTarget === "sprinter" ? mix.sprinterHP : mix.shamblerHP)
      : CombatEngine.getZombieHP(source.sandbox.toughness, source.sandbox.customHP).mean;
    const result = CombatEngine.calculateDamage(weapon, character, {
      hitLocation: state.zoneHit === "head" ? "Head" : "Torso",
      isFloor: state.zoneHit === "floor"
    }, source.sandbox, source.config);
    const normal = state.zoneHit === "floor" ? result.floor : result.normal;
    const crit = state.zoneHit === "floor" ? result.floorCrit : result.crit;
    const damage = state.zoneCritical ? normal.mean * (1 - result.critChance / 100) + crit.mean * result.critChance / 100 : normal.mean;
    const htk = state.zoneCritical
      ? CombatEngine.expectedHitsToKill(hp, normal.mean, crit.mean, result.critChance)
      : CombatEngine.hitsToKill(hp, normal.mean);
    const costPerSwing = CombatEngine.calculateEnduranceCost(weapon, character, {}, source.config);
    const point = { damage, htk, stamina: costPerSwing === 0 ? 0 : htk * costPerSwing * 100, power: 100 * state.tzonyne.survivalHtk / htk, hp,
      min: normal.min, max: normal.max, critChance: result.critChance,
      sprinterPct: tz.enabled ? mix.sprinterPct : 0 };
    zonePoints.set(key, point);
    return point;
  }

  function zoneUnit() {
    return state.zoneMetric === "htk" ? "colpi" : state.zoneMetric === "damage" ? "HP / colpo" : state.zoneMetric === "stamina" ? "% fiato / kill" : "% del target";
  }

  function renderZoneCanvas() {
    const canvas = el.mainCanvas;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.parentElement.clientWidth;
    const height = canvas.parentElement.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pad = { top: 38, right: 22, bottom: 62, left: width < 500 ? 46 : 64 };
    const chartW = width - pad.left - pad.right;
    const chartH = height - pad.top - pad.bottom;
    const tiers = state.tzonyne.tiers;
    const levels = [...new Set([...state.zoneLevels, state.selectedSkillLevel])].sort((a,b) => a-b);
    const series = levels.map(level => ({
      level,
      color: level === state.selectedSkillLevel ? INK.amber : INK.figureDim,
      dash: TRACE_DASHES[level % TRACE_DASHES.length],
      mark: TRACE_MARKS[level % TRACE_MARKS.length],
      points: tiers.map(t => zonePoint(level, t)),
      baseline: state.zoneCompare ? tiers.map(t => zonePoint(level, t, true)) : []
    }));
    const threshold = state.zoneMetric === "stamina" ? 0 : state.zoneMetric === "htk" ? state.tzonyne.survivalHtk : state.zoneMetric === "power" ? 100 : series[0].points[0].hp;
    const values = series.flatMap(s => [...s.points, ...s.baseline].map(p => p[state.zoneMetric])).filter(Number.isFinite);
    const rawMax = Math.max(threshold, ...values, 1) * 1.12;
    const magnitude = 10 ** Math.floor(Math.log10(rawMax / 5));
    const step = Math.max(1, Math.round(rawMax / 5 / magnitude)) * magnitude;
    const ticks = Math.ceil(rawMax / step);
    const maxY = step * ticks;
    const axisTicks = state.zoneLog ? [0] : Array.from({ length: ticks + 1 }, (_, i) => i * step);
    if (state.zoneLog) {
      for (let power = 0; 10 ** power <= maxY; power++) {
        for (const factor of [1, 3]) {
          const value = factor * 10 ** power;
          if (value <= maxY) axisTicks.push(value);
        }
      }
    }
    const x = i => pad.left + i / (tiers.length - 1) * chartW;
    const y = v => pad.top + chartH * (1 - (state.zoneLog ? Math.log1p(v) / Math.log1p(maxY) : v / maxY));
    zonePlot = { pad, chartW, tiers };
    ctx.clearRect(0, 0, width, height);
    ctx.font = FONT;
    ctx.fillStyle = INK.dim;
    ctx.textAlign = "left";
    ctx.fillText(`${zoneUnit()} · ${["htk", "stamina"].includes(state.zoneMetric) ? "meno è meglio" : "più è meglio"}${state.zoneLog ? " · log(1+y)" : ""}`, pad.left, 18);
    for (const value of axisTicks) {
      ctx.strokeStyle = INK.line;
      ctx.beginPath(); ctx.moveTo(pad.left, y(value)); ctx.lineTo(width-pad.right, y(value)); ctx.stroke();
      ctx.textAlign = "right";
      ctx.fillStyle = INK.dim;
      ctx.fillText(formatZone(value), pad.left - 9, y(value) + 4);
    }
    const selectedIndex = tiers.findIndex(t => t.id === state.tzonyne.selectedTier);
    ctx.fillStyle = "rgba(214, 161, 26, 0.10)";
    ctx.fillRect(x(selectedIndex)-12, pad.top, 24, chartH);
    if (state.zoneMetric !== "stamina") {
      ctx.save();
      ctx.setLineDash([6, 5]); ctx.strokeStyle = INK.amber;
      ctx.beginPath(); ctx.moveTo(pad.left,y(threshold)); ctx.lineTo(width-pad.right,y(threshold)); ctx.stroke();
      ctx.restore();
    }
    tiers.forEach((tier,i) => {
      ctx.textAlign = "center"; ctx.fillStyle = INK.ink;
      ctx.fillText(`T${tier.id}`, x(i), height-36);
      ctx.fillStyle = INK.dim;
      const share = series[0].points[i].sprinterPct;
      ctx.fillText(`${formatZone(share)}%`,x(i),height-17);
    });
    series.forEach(s => {
      const selected = s.level === state.selectedSkillLevel;
      const draw = (points, reference) => {
        ctx.save(); ctx.strokeStyle = s.color; ctx.fillStyle = s.color;
        ctx.lineWidth = selected ? 2.6 : 1.5;
        ctx.globalAlpha = reference ? 0.45 : selected ? 1 : 0.8;
        ctx.setLineDash(reference ? [5,5] : (selected ? [] : s.dash));
        ctx.beginPath();
        points.forEach((p,i) => { const py = y(p[state.zoneMetric]); if (i===0) ctx.moveTo(x(i),py); else ctx.lineTo(x(i),py); });
        ctx.stroke();
        ctx.setLineDash([]);
        if (!reference) points.forEach((p,i) => {
          fillMarker(ctx, x(i), y(p[state.zoneMetric]), s.mark, selected ? 4.2 : 3);
        });
        ctx.restore();
      };
      if (s.baseline.length) draw(s.baseline,true);
      draw(s.points,false);
    });
    el.stageLegend.innerHTML = series.map(s => `<button type="button" class="zone-trace" data-zone-level="${s.level}" aria-pressed="${s.level === state.selectedSkillLevel}" style="--trace-angle:${30 + s.level * 12}deg">Lv ${s.level}</button>`).join("");
    el.stageLegend.querySelectorAll("[data-zone-level]").forEach(button => button.onclick = () => {
      state.selectedSkillLevel = Number(button.dataset.zoneLevel); update();
    });
    const current = zonePoint(state.selectedSkillLevel, currentTier());
    const before = zonePoint(state.selectedSkillLevel, currentTier(), true);
    const delta = current[state.zoneMetric] - before[state.zoneMetric];
    document.getElementById("zoneSelection").textContent =
      `T${currentTier().id} · Lv ${state.selectedSkillLevel} · ${formatZone(current[state.zoneMetric])} ${zoneUnit()}` +
      ` · Roll non critico ${formatZone(current.min)}–${formatZone(current.max)} HP · Crit ${formatZone(current.critChance)}%` +
      (state.zoneCompare ? ` · Δ riferimento ${delta > 0 ? "+" : ""}${formatZone(delta)} ${zoneUnit()}` : "");
    if (selectedIndex > 0) {
      const previous = zonePoint(state.selectedSkillLevel, tiers[selectedIndex - 1]);
      const change = 100 * (current.damage / previous.damage - 1);
      document.getElementById("zoneSelection").textContent +=
        ` · Danno vs T${tiers[selectedIndex - 1].id}: ${change > 0 ? "+" : ""}${formatZone(change)}%` +
        ` · Sprinter ${formatZone(previous.sprinterPct)}% → ${formatZone(current.sprinterPct)}%`;
    }
    const note = state.zoneMetric === "stamina"
      ? "Fiato per eliminazione = colpi calcolati × costo base per colpo. Forma fisica riduce il costo, non il danno diretto. Stima senza recupero, sconti sul danno finale o fatica accumulata durante la singola eliminazione."
      : state.zoneMetric === "damage"
      ? "Linea tratteggiata = HP bersaglio. Il danno medio con critici sopra la linea NON garantisce un one-shot."
      : state.zoneMetric === "power"
        ? "100% = target colpi rispettato; 150% = efficienza 1,5× il target. Non misura il rischio della zona."
        : `Linea tratteggiata = budget di ${state.tzonyne.survivalHtk} colpi. Roll medio fisso, critici probabilistici; oltre 1000 colpi non critici si usa la stima HP / danno medio.`;
    document.getElementById("zoneChartNote").textContent = `${note} Percentuali sotto i tier = sprinter effettivi, non difficoltà media. ${state.zoneCompare ? "Curve tratteggiate colorate = riferimento fissato; stessa arma e stesso personaggio." : "Clicca un tier nel grafico o una cella della matrice per ispezionarlo."} ${!state.tzonyne.enabled ? "TZonyne disattivato: tutti i tier usano lo stesso scenario vanilla." : ""} ${getActiveWeapon().isRanged ? "Arma da fuoco: colpi a segno, precisione e ricarica escluse. TZonyne modifica il bonus mira, non il danno base." : ""} ${getActiveWeapon().category === "Unarmed" ? "Stomp: bersaglio già a terra, moltiplicatori arma del tier esclusi." : ""} ${state.zoneTarget === "sprinter" && current.sprinterPct === 0 ? "Nel tier selezionato non sono presenti sprinter: confronto ipotetico." : ""}`;
  }

  function renderZoneTable() {
    el.tableHeadRow.innerHTML = `<th scope="col">Livello / ${zoneUnit()}</th>` +
      state.tzonyne.tiers.map(t => `<th scope="col">T${t.id}</th>`).join("");
    el.tableBody.innerHTML = Array.from({length:11},(_,level) =>
      `<tr><th scope="row">Lv ${level}</th>${state.tzonyne.tiers.map(t => {
        const point = zonePoint(level,t);
        const selected = level === state.selectedSkillLevel && t.id === state.tzonyne.selectedTier;
        return `<td><button class="zone-cell" data-level="${level}" data-tier="${t.id}" aria-pressed="${selected}" aria-label="Livello ${level}, tier ${t.id}: ${formatZone(point[state.zoneMetric])} ${zoneUnit()}">${formatZone(point[state.zoneMetric])}</button></td>`;
      }).join("")}</tr>`
    ).join("");
    el.tableBody.querySelectorAll(".zone-cell").forEach(button => button.onclick = () => {
      state.selectedSkillLevel = Number(button.dataset.level);
      state.tzonyne.selectedTier = Number(button.dataset.tier);
      update();
    });
  }

  let heatmapHit = null;
  function renderHeatmap(weapon) {
    const canvas = el.heatmapCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = (canvas.width = Math.max(220, rect.width) * dpr);
    const h = (canvas.height = Math.max(180, rect.height || 220) * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const width = w / dpr;
    const height = h / dpr;
    ctx.clearRect(0, 0, width, height);

    const data = CombatEngine.buildZoneHeatmap(weapon, state.sandbox, state.config, { ...state.tzonyne, enabled: true });
    const pad = { top: 18, right: 10, bottom: 22, left: 28 };
    const cellW = (width - pad.left - pad.right) / 11;
    const cellH = (height - pad.top - pad.bottom) / 11;
    heatmapHit = { pad, cellW, cellH, width, height };

    const colorFor = (cell) => {
      if (data.mix.sprinterShare > 0 && cell.sprHtk > 1) return INK.alarm;
      if (cell.htk <= 1.05) return INK.amber;
      if (cell.ok && cell.htk <= state.tzonyne.comfortHtk) return INK.sage;
      if (cell.ok) return INK.median;
      if (cell.htk <= state.tzonyne.survivalHtk + 1) return INK.figureAlarm;
      return INK.alarm;
    };

    data.cells.forEach(cell => {
      const x = pad.left + cell.skill * cellW;
      const y = pad.top + (10 - cell.str) * cellH;
      const fail = !cell.ok || (data.mix.sprinterShare > 0 && cell.sprHtk > 1);
      ctx.fillStyle = colorFor(cell);
      ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);
      if (fail) hatchFill(ctx, x + 1, y + 1, cellW - 2, cellH - 2, INK.ground, cell.htk <= 1.05 ? 3 : 5);
      if (cell.skill === state.selectedSkillLevel && cell.str === state.character.strength) {
        ctx.strokeStyle = INK.ink;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, cellW - 2, cellH - 2);
      }
    });

    ctx.fillStyle = INK.dim;
    ctx.font = FONT_SM;
    ctx.textAlign = "center";
    for (let s = 0; s <= 10; s++) {
      ctx.fillText(String(s), pad.left + s * cellW + cellW / 2, height - 6);
      ctx.fillText(String(s), 12, pad.top + (10 - s) * cellH + cellH / 2 + 3);
    }
    ctx.fillText("Skill →", width / 2, 12);
    el.heatmapLegend.textContent = `T${data.tier.id} · target ${data.target} · shambler ${data.mix.shamblerHP} HP`;
    const cur = data.cells.find(c => c.skill === state.selectedSkillLevel && c.str === state.character.strength);
    el.heatmapNote.textContent = cur
      ? `Corpo fresco, shambler, con critici (indipendente dai selettori del grafico). Skill ${cur.skill} × Forza ${cur.str}: ${cur.htk} colpi. ${cur.ok ? "Entro budget" : "Fuori budget o sprinter non chiuso in un colpo medio"}. Tinta + tratteggio: hatch = fuori budget o sprinter non chiuso; ambra piena = circa 1 colpo. Clicca una cella per impostare il personaggio.`
      : "Corpo fresco contro shambler. Clicca una cella per impostare Skill e Forza.";
  }

  function heatmapCellFromEvent(e) {
    if (!heatmapHit || !el.heatmapCanvas) return null;
    const rect = el.heatmapCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const skill = Math.floor((x - heatmapHit.pad.left) / heatmapHit.cellW);
    const str = 10 - Math.floor((y - heatmapHit.pad.top) / heatmapHit.cellH);
    if (skill < 0 || skill > 10 || str < 0 || str > 10) return null;
    return { skill, str };
  }

  // Window global for legend click
  window.selectWeapon = function(wid) {
    state.selectedWeaponId = wid;
    if (!Array.from(el.weaponSelect.options).some(option => option.value === wid)) {
      state.categoryFilter = "ALL";
      el.categoryChips.querySelectorAll(".chip").forEach(chip => chip.classList.toggle("active", chip.dataset.cat === "ALL"));
      populateWeapons();
    }
    el.weaponSelect.value = wid;
    update();
  };

  // Canvas Mouse Move (Interactive Crosshair)
  el.mainCanvas.addEventListener("mousemove", e => {
    if (state.viewMode !== "single") {
      state.hoverLevel = null;
      el.chartTooltip.style.display = "none";
      return;
    }
    const rect = el.mainCanvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const padLeft = 60;
    const padRight = 60;
    const chartW = rect.width - padLeft - padRight;

    if (mouseX >= padLeft && mouseX <= rect.width - padRight) {
      const ratio = (mouseX - padLeft) / chartW;
      const lvl = Math.max(0, Math.min(10, Math.round(ratio * 10)));
      if (state.hoverLevel !== lvl) {
        state.hoverLevel = lvl;
        renderSingleWeaponCanvas(traceProgression(getActiveWeapon()));
      }
    } else {
      state.hoverLevel = null;
      renderSingleWeaponCanvas(traceProgression(getActiveWeapon()));
    }
  });

  el.mainCanvas.addEventListener("mouseleave", () => {
    state.hoverLevel = null;
    if (state.viewMode === "single") {
      renderSingleWeaponCanvas(traceProgression(getActiveWeapon()));
    }
  });

  el.mainCanvas.addEventListener("click", () => {
    if (state.viewMode === "zones") return;
    if (state.hoverLevel !== null) {
      state.selectedSkillLevel = state.hoverLevel;
      update();
    }
  });

  // --- EVENT LISTENERS ---
  // Category Chips
  el.categoryChips.addEventListener("click", e => {
    const chip = e.target.closest(".chip");
    if (chip) {
      el.categoryChips.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      state.categoryFilter = chip.getAttribute("data-cat");
      populateWeapons();
      update();
    }
  });

  // View Mode Switcher
  el.viewBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      el.viewBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.viewMode = btn.getAttribute("data-view");
      if (state.viewMode === "zones" && !state.tzonyne.enabled) {
        state.tzonyne.enabled = true;
      }
      update();
    });
  });

  // Skill Chips & Slider
  el.skillChips.addEventListener("click", e => {
    const chip = e.target.closest(".chip");
    if (chip) {
      state.selectedSkillLevel = parseInt(chip.getAttribute("data-lvl"));
      update();
    }
  });

  el.sliderSkillLevel.addEventListener("input", e => {
    state.selectedSkillLevel = parseInt(e.target.value);
    update();
  });

  // Weapon Select
  el.weaponSelect.addEventListener("change", e => {
    state.selectedWeaponId = e.target.value;
    update();
  });

  // Toughness Select
  el.selectToughness.addEventListener("change", e => {
    if (e.target.value === "custom") {
      state.sandbox.toughness = "custom";
      el.inputCustomHP.style.display = "inline-block";
      state.sandbox.customHP = parseFloat(el.inputCustomHP.value) || 4.0;
    } else {
      state.sandbox.toughness = parseInt(e.target.value);
      el.inputCustomHP.style.display = "none";
      state.sandbox.customHP = null;
    }
    update();
  });

  el.inputCustomHP.addEventListener("input", e => {
    state.sandbox.customHP = parseFloat(e.target.value) || 2.0;
    update();
  });

  // Multi-Hit
  el.checkMultiHit.addEventListener("change", e => {
    state.sandbox.multiHit = e.target.checked;
    update();
  });

  // Floor Scale Toggle
  el.btnScaleStandard.addEventListener("click", () => {
    el.btnScaleStandard.classList.add("active");
    el.btnScaleOverkill.classList.remove("active");
    state.floorOverkillMode = false;
    update();
  });

  el.btnScaleOverkill.addEventListener("click", () => {
    el.btnScaleOverkill.classList.add("active");
    el.btnScaleStandard.classList.remove("active");
    state.floorOverkillMode = true;
    update();
  });

  // Horde Mode Controls
  el.sliderHordeSize.addEventListener("input", e => {
    state.hordeSize = parseInt(e.target.value);
    el.valHordeSizeText.textContent = `${state.hordeSize} zed`;
    update();
  });

  el.tacticChips.addEventListener("click", e => {
    const chip = e.target.closest(".chip");
    if (chip) {
      el.tacticChips.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      state.hordeTactic = chip.getAttribute("data-tactic");
      update();
    }
  });

  // Presets
  el.presetSelect.addEventListener("change", e => {
    const pKey = e.target.value;
    const preset = PRESETS[pKey];
    if (preset) {
      state.sandbox.toughness = preset.sandbox.toughness;
      state.sandbox.multiHit = preset.sandbox.multiHit;
      state.sandbox.customHP = preset.sandbox.customHP;

      state.config = { ...preset.config };
      state.rebalanceConfig = { ...preset.config };
      if (preset.tzonyne && preset.tzonyne.enabled) {
        state.tzonyne = cloneTZonyne(TZONYNE_DEFAULTS);
        state.tzonyne.enabled = true;
        if (preset.tzonyne.selectedTier) state.tzonyne.selectedTier = preset.tzonyne.selectedTier;
        state.viewMode = "zones";
        el.viewBtns.forEach(b => b.classList.toggle("active", b.getAttribute("data-view") === "zones"));
      } else if (pKey !== "la_resistenza") {
        state.tzonyne.enabled = false;
      }

      el.selectToughness.value = preset.sandbox.customHP ? "custom" : preset.sandbox.toughness;
      el.inputCustomHP.style.display = preset.sandbox.customHP ? "inline-block" : "none";
      if (preset.sandbox.customHP) el.inputCustomHP.value = preset.sandbox.customHP;
      el.checkMultiHit.checked = preset.sandbox.multiHit;

      update();
    }
  });

  // Reset Vanilla Button
  el.btnResetVanilla.addEventListener("click", () => {
    state.config = { ...COMBAT_CONFIG_DEFAULTS };
    state.rebalanceConfig = { ...COMBAT_CONFIG_DEFAULTS };
    update();
  });

  // Rebalance Sliders
  el.sliderFloorMult.addEventListener("input", e => {
    state.config.FLOOR_DAMAGE_MIN_MULTIPLIER = parseFloat(e.target.value);
    state.config.FLOOR_DAMAGE_FLAT = true;
    state.rebalanceConfig.FLOOR_DAMAGE_MIN_MULTIPLIER = parseFloat(e.target.value);
    update();
  });

  el.sliderHeadMult.addEventListener("input", e => {
    state.config.HEAD_HIT_DAMAGE_SPLIT_MODIFIER = parseFloat(e.target.value);
    state.rebalanceConfig.HEAD_HIT_DAMAGE_SPLIT_MODIFIER = parseFloat(e.target.value);
    update();
  });

  el.sliderSkillIncr.addEventListener("input", e => {
    state.config.WEAPON_LEVEL_DAMAGE_MULTIPLIER_INCREMENT = parseFloat(e.target.value);
    state.rebalanceConfig.WEAPON_LEVEL_DAMAGE_MULTIPLIER_INCREMENT = parseFloat(e.target.value);
    update();
  });

  el.sliderWearScale.addEventListener("input", e => {
    state.config.DURABILITY_WEAR_SCALE = parseFloat(e.target.value);
    state.rebalanceConfig.DURABILITY_WEAR_SCALE = parseFloat(e.target.value);
    update();
  });

  // Window Resize
  window.addEventListener("resize", () => {
    update();
  });

  if (el.sliderStrength) {
    el.sliderStrength.addEventListener("input", e => {
      state.character.strength = parseInt(e.target.value);
      update();
    });
  }
  document.getElementById("sliderFitness").addEventListener("input", event => {
    state.character.fitnessLevel = Number(event.target.value);
    update();
  });
  if (el.sliderMaintenance) {
    el.sliderMaintenance.addEventListener("input", e => {
      state.character.maintenanceLevel = parseInt(e.target.value);
      update();
    });
  }


  if (el.checkTZonyne) {
    el.checkTZonyne.addEventListener("change", e => {
      state.tzonyne.enabled = e.target.checked;
      update();
    });
  }
  if (el.checkNight) {
    el.checkNight.addEventListener("change", e => {
      state.tzonyne.night = e.target.checked;
      update();
    });
  }
  if (el.tierChips) {
    el.tierChips.addEventListener("click", e => {
      const chip = e.target.closest("[data-tier]");
      if (!chip) return;
      state.tzonyne.selectedTier = parseInt(chip.getAttribute("data-tier"));
      state.tzonyne.enabled = true;
      update();
    });
  }
  if (el.sliderTzDmg) {
    el.sliderTzDmg.addEventListener("input", e => { mutateCurrentTier({ dmg: parseFloat(e.target.value) }); update(); });
    el.sliderTzCritRate.addEventListener("input", e => { mutateCurrentTier({ critRate: parseFloat(e.target.value) }); update(); });
    el.sliderTzCritMulti.addEventListener("input", e => { mutateCurrentTier({ critMulti: parseFloat(e.target.value) }); update(); });
    el.sliderTzSprinter.addEventListener("input", e => { mutateCurrentTier({ sprinterPct: parseInt(e.target.value) }); update(); });
    el.sliderTzShamblerHP.addEventListener("input", e => { state.tzonyne.shamblerHP = parseFloat(e.target.value); update(); });
    el.sliderTzSprinterHP.addEventListener("input", e => { state.tzonyne.sprinterHP = parseFloat(e.target.value); update(); });
    el.sliderTzTarget.addEventListener("input", e => { state.tzonyne.survivalHtk = parseInt(e.target.value); update(); });
  }
  if (el.btnResetTZonyne) {
    el.btnResetTZonyne.addEventListener("click", () => {
      const enabled = state.tzonyne.enabled;
      const selected = state.tzonyne.selectedTier;
      const night = state.tzonyne.night;
      state.tzonyne = cloneTZonyne(TZONYNE_DEFAULTS);
      state.tzonyne.enabled = enabled;
      state.tzonyne.selectedTier = selected;
      state.tzonyne.night = night;
      update();
    });
  }
  if (el.heatmapCanvas) {
    el.heatmapCanvas.addEventListener("click", e => {
      const cell = heatmapCellFromEvent(e);
      if (!cell) return;
      state.selectedSkillLevel = cell.skill;
      state.character.strength = cell.str;
      update();
    });
  }

  function rpgArgs() {
    return [getActiveWeapon(), state.sandbox, state.config, state.tzonyne, rpg.goals, rpg.entryHtk, rpg.blockedHtk];
  }

  function setRpgCurves(enabled) {
    if (enabled) {
      state.config.WEAPON_LEVEL_DAMAGE_CURVE = [...rpg.weaponCurve];
      state.config.STRENGTH_DAMAGE_CURVE = [...rpg.strengthCurve];
    } else {
      delete state.config.WEAPON_LEVEL_DAMAGE_CURVE;
      delete state.config.STRENGTH_DAMAGE_CURVE;
    }
  }

  function renderRpgLab() {
    const enabled = !!state.config.WEAPON_LEVEL_DAMAGE_CURVE;
    document.getElementById("rpgCurveEnabled").checked = enabled;
    document.getElementById("rpgLaunch").textContent = enabled ? "Laboratorio RPG · curva attiva" : "Laboratorio RPG";
    if (document.getElementById("rpgPanel").hidden) return;
    document.getElementById("rpgGlobal").value = state.config.GLOBAL_MELEE_DAMAGE_REDUCTION_MULTIPLIER;
    document.getElementById("rpgBaseDamage").value = state.config.BASE_WEAPON_DAMAGE_MULTIPLIER;
    document.getElementById("rpgBaseDamage").disabled = enabled;
    const curveBody = document.getElementById("rpgCurve");
    if (!curveBody.children.length) curveBody.innerHTML = Array.from({ length: 11 }, (_, level) => {
      const weapon = enabled ? state.config.WEAPON_LEVEL_DAMAGE_CURVE[level] : CombatEngine.getWeaponLevelDamageModifier(level, state.config);
      const strength = enabled ? state.config.STRENGTH_DAMAGE_CURVE[level] : CombatEngine.getStrengthMod(level);
      return `<tr><th scope="row">${level}</th><td><input aria-label="Moltiplicatore arma livello ${level}" data-curve="weaponCurve" data-level="${level}" type="number" min="0.000001" max="10000" step="any" value="${Number(weapon.toPrecision(7))}"></td><td><input aria-label="Moltiplicatore forza livello ${level}" data-curve="strengthCurve" data-level="${level}" type="number" min="0.000001" max="100" step="any" value="${Number(strength.toPrecision(7))}"></td></tr>`;
    }).join("");
    curveBody.querySelectorAll("input").forEach(input => {
      if (input === document.activeElement) return;
      const level = Number(input.dataset.level);
      const value = input.dataset.curve === "weaponCurve"
        ? CombatEngine.getWeaponLevelDamageModifier(level, state.config)
        : CombatEngine.getStrengthMod(level, state.config);
      input.value = Number(value.toPrecision(7));
    });
    const rows = ProgressionLab.analyze(...rpgArgs());
    const weapon = getActiveWeapon();
    const supported = !weapon.isRanged && weapon.category !== "Unarmed";
    document.getElementById("rpgCalibrate").disabled = !supported;
    document.getElementById("rpgAudit").innerHTML = rows.map((row, index) => {
      const goal = rpg.goals[index];
      const tacticalBypass = index > 0 && [row.floorPreviousHtk, row.headPreviousHtk].some(value => value !== null && value < rpg.blockedHtk);
      const partialAccess = index > 0 && [row.strengthBehindHtk, row.skillBehindHtk].some(value => value !== null && value <= rpg.entryHtk);
      const status = !row.entryOk ? "Entrata troppo dura" : !row.wallOk ? "Scalino insufficiente" : partialAccess ? "Accesso con build incompleta" : tacticalBypass ? "Corpo OK · bypass tattico" : "Obiettivi verificati*";
      return `<tr><th scope="row">T${row.tierId}</th><td><button class="chip" data-rpg-inspect="${index}">A${goal.skill} / F${goal.strength}</button></td><td>${formatZone(row.entryHtk)}</td><td>${row.previousHtk === null ? "—" : formatZone(row.previousHtk)}</td><td>${row.firstSkill === null ? "Mai" : row.firstSkill}</td><td>${row.strengthBehindHtk === null ? "—" : formatZone(row.strengthBehindHtk)}</td><td>${row.skillBehindHtk === null ? "—" : formatZone(row.skillBehindHtk)}</td><td>${index === 0 ? "—" : `${formatZone(row.headPreviousHtk)} / ${row.floorPreviousHtk === null ? "—" : formatZone(row.floorPreviousHtk)}`}</td><td class="${row.entryOk && row.wallOk && !tacticalBypass && !partialAccess ? "rpg-pass" : "rpg-fail"}">${status}</td></tr>`;
    }).join("");
    const passed = rows.filter(row => row.entryOk && row.wallOk).length;
    document.getElementById("rpgStatus").textContent = `${enabled ? "SIMULAZIONE CUSTOM — richiede implementazione nella mod." : "Curve originali attive — nessuna nuova legge del danno applicata."} ${weapon.name}: ${passed}/6 tier rispettano ingresso ≤${rpg.entryHtk} e build precedente ≥${rpg.blockedHtk} colpi al corpo. Il laboratorio usa sempre TZonyne, shambler e personaggio fresco con critici; i selettori del grafico non cambiano questo protocollo.`;
    const first = CombatEngine.getWeaponLevelDamageModifier(0, state.config);
    const last = CombatEngine.getWeaponLevelDamageModifier(10, state.config);
    const strengthRatio = CombatEngine.getStrengthMod(10, state.config) / CombatEngine.getStrengthMod(0, state.config);
    const issues = [];
    if (rpg.goals.some((g, i) => i > 0 && g.skill <= rpg.goals[i - 1].skill)) issues.push("Gli obiettivi abilità non crescono strettamente: due tier potrebbero richiedere lo stesso personaggio.");
    if (rpg.entryHtk >= rpg.blockedHtk) issues.push("Il budget del personaggio ammesso deve essere inferiore a quello del personaggio respinto.");
    if (!supported) issues.push("Calibrazione disabilitata: i moltiplicatori danno del tier non agiscono direttamente su armi da fuoco e stomp. Sono vie alternative da bilanciare separatamente.");
    if (state.config.WEAPON_LEVEL_DAMAGE_CURVE?.some((value, i, values) => i > 0 && value < values[i - 1])) issues.push("La curva arma diminuisce a un livello: salire di abilità può peggiorare il danno.");
    if (state.tzonyne.tiers.some((tier, i, tiers) => i > 0 && tier.dmg > tiers[i - 1].dmg)) issues.push("Il danno risale in almeno un tier: verifica che il recupero sia intenzionale.");
    document.getElementById("rpgNotes").textContent = `Crescita 0→10: abilità ${formatZone(last / first)}× · forza ${formatZone(strengthRatio)}× · prodotto ${formatZone(last / first * strengthRatio)}×. La proposta distribuisce la crescita moltiplicativa 60% abilità / 40% forza, non il danno additivo. I valori mostrati riflettono anche le modifiche manuali. Forza indietro = abilità prevista / forza precedente; abilità indietro = abilità precedente / forza prevista. Una build incompleta che centra l’ingresso segnala compensazione fra i due percorsi, non un requisito rigido. *Verificato solo sul benchmark e sulle build dichiarate. ${issues.join(" ")} Forza e forma fisica sono progressioni trasversali; forma fisica agisce sul fiato, non su questo prodotto di danno. I tempi di crescita dipendono dall’XP, non sono stimati qui.`;
  }

  document.getElementById("rpgLaunch").addEventListener("click", () => {
    const panel = document.getElementById("rpgPanel");
    panel.hidden = !panel.hidden;
    document.getElementById("rpgLaunch").setAttribute("aria-expanded", String(!panel.hidden));
    update();
  });
  document.getElementById("rpgGoals").innerHTML = rpg.goals.map((goal, index) =>
    `<tr><th scope="row">T${index + 1}</th><td><input type="number" min="0" max="10" step="1" value="${goal.skill}" data-goal="${index}" data-field="skill" aria-label="Abilità ingresso T${index + 1}"></td><td><input type="number" min="0" max="10" step="1" value="${goal.strength}" data-goal="${index}" data-field="strength" aria-label="Forza ingresso T${index + 1}"></td></tr>`
  ).join("");
  document.getElementById("rpgGoals").addEventListener("change", event => {
    const input = event.target;
    if (!input.matches("input") || !input.checkValidity() || input.value === "") return;
    rpg.goals[Number(input.dataset.goal)][input.dataset.field] = Number(input.value);
    update();
  });
  document.getElementById("rpgCurve").addEventListener("change", event => {
    const input = event.target;
    if (!input.matches("input") || !input.checkValidity() || input.value === "") return;
    if (!state.config.WEAPON_LEVEL_DAMAGE_CURVE) {
      rpg.weaponCurve = Array.from({ length: 11 }, (_, level) => CombatEngine.getWeaponLevelDamageModifier(level, state.config));
      rpg.strengthCurve = Array.from({ length: 11 }, (_, level) => CombatEngine.getStrengthMod(level));
    }
    rpg[input.dataset.curve][Number(input.dataset.level)] = Number(input.value);
    setRpgCurves(true);
    update();
  });
  document.getElementById("rpgCurveEnabled").addEventListener("change", event => { setRpgCurves(event.target.checked); update(); });
  document.getElementById("rpgProposal").addEventListener("click", () => {
    const base = document.getElementById("rpgBase");
    const cap = document.getElementById("rpgCap");
    if (!base.checkValidity() || !cap.checkValidity() || !base.value || !cap.value) return;
    Object.assign(rpg, ProgressionLab.generateCurves(Number(base.value), Number(cap.value)));
    setRpgCurves(true);
    update();
  });
  document.getElementById("rpgLinear").addEventListener("click", () => { setRpgCurves(false); update(); });
  for (const [id, field] of [["rpgEntryHtk", "entryHtk"], ["rpgBlockedHtk", "blockedHtk"]]) {
    document.getElementById(id).addEventListener("change", event => {
      if (!event.target.checkValidity() || !event.target.value) return;
      rpg[field] = Number(event.target.value); update();
    });
  }
  for (const [id, field] of [["rpgGlobal", "GLOBAL_MELEE_DAMAGE_REDUCTION_MULTIPLIER"], ["rpgBaseDamage", "BASE_WEAPON_DAMAGE_MULTIPLIER"]]) {
    document.getElementById(id).addEventListener("change", event => {
      if (!event.target.checkValidity() || !event.target.value) return;
      state.config[field] = Number(event.target.value); update();
    });
  }
  document.getElementById("rpgCalibrate").addEventListener("click", () => {
    const weapon = getActiveWeapon();
    if (weapon.isRanged || weapon.category === "Unarmed") return;
    state.tzonyne.tiers = ProgressionLab.calibrate(...rpgArgs()).tiers;
    state.tzonyne.enabled = true;
    state.zoneCompare = true;
    state.zoneLog = true;
    document.getElementById("zoneLog").checked = true;
    state.viewMode = "zones";
    document.getElementById("zoneCompare").checked = true;
    el.viewBtns.forEach(button => button.classList.toggle("active", button.dataset.view === "zones"));
    update();
  });
  document.getElementById("rpgAudit").addEventListener("click", event => {
    const button = event.target.closest("[data-rpg-inspect]");
    if (!button) return;
    const index = Number(button.dataset.rpgInspect);
    state.selectedSkillLevel = rpg.goals[index].skill;
    state.character.strength = rpg.goals[index].strength;
    state.tzonyne.selectedTier = state.tzonyne.tiers[index].id;
    state.tzonyne.enabled = true;
    state.viewMode = "zones";
    el.viewBtns.forEach(b => b.classList.toggle("active", b.dataset.view === "zones"));
    update();
    el.mainCanvas.scrollIntoView({ block: "center" });
  });
  document.getElementById("rpgExport").addEventListener("click", () => {
    const project = {
      schemaVersion: 1, kind: "simulation-only", weaponId: state.selectedWeaponId,
      config: state.config, tzonyne: state.tzonyne, sandbox: state.sandbox,
      character: state.character, goals: rpg.goals,
      entryHtk: rpg.entryHtk, blockedHtk: rpg.blockedHtk,
      assumptions: "Fresh shambler, body, mean damage rolls plus stochastic crits. Custom curves require mod implementation. XP/death persistence excluded."
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = "pz-progression-project.json";
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  // Initial Load
  for (const key of ["zoneMetric", "zoneTarget", "zoneHit", "zoneCritical", "zoneFatigue", "zoneCompare", "zoneLog"]) {
    const control = document.getElementById(key);
    control.addEventListener("change", () => {
      state[key] = control.type === "checkbox" ? control.checked : key === "zoneFatigue" ? Number(control.value) : control.value;
      update();
    });
  }
  document.getElementById("btnCaptureBaseline").addEventListener("click", () => {
    zoneBaseline = { config: { ...state.config }, tzonyne: cloneTZonyne(state.tzonyne), sandbox: { ...state.sandbox } };
    state.zoneCompare = true;
    document.getElementById("zoneCompare").checked = true;
    update();
  });
  el.mainCanvas.addEventListener("click", event => {
    if (state.viewMode !== "zones" || !zonePlot) return;
    const px = event.clientX - el.mainCanvas.getBoundingClientRect().left;
    if (px < zonePlot.pad.left || px > zonePlot.pad.left + zonePlot.chartW) return;
    const index = Math.round((px - zonePlot.pad.left) / zonePlot.chartW * (zonePlot.tiers.length - 1));
    state.tzonyne.selectedTier = zonePlot.tiers[index].id;
    update();
  });
  populateWeapons();
  update();
});
