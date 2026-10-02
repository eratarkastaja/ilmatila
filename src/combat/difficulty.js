function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export const DIFFICULTY_PRESETS = deepFreeze({
  easy: {
    id: 'easy',
    player: {
      hull: 135,
      countermeasures: 20,
      chaff: {
        count: 20,
        cooldown: 1.4,
        radarTrackBreakChance: 0.62,
        radarMissileBreakChance: 0.68,
        radarTrackDisruptionDuration: 3.4,
        radarMissileDisruptionDuration: 3.8,
        radarMissileEffectRange: 5500,
        radarTrackReevaluationCooldown: 4.5,
      },
      incomingDamage: 0.72
    },
    fighter: {
      health: 0.82,
      aimSpread: 1.35,
      openingDelayScale: 0.62,
      passRangeScale: 0.88,
      detection: {
        range: 4500,
        reactionDelay: 6.5
      },
      gun: {
        maxRange: 2300,
        boresight: 0.84,
        leadTime: 3.5,
        cooldown: 1.7,
        cooldownJitter: 0.9,
        burstMin: 5,
        burstMax: 8,
        burstInterval: 0.11
      },
      handling: {
        attackTurnRate: 0.32,
        defensiveTurnRate: 0.54,
        defensivePitchRate: 0.25
      },
      evasion: {
        lockChance: 0.18,
        countermeasureChance: 0.48,
        lockDuration: 2.5,
        missileDuration: 3.2,
        countermeasureFollowupChance: 0,
        countermeasureCapacity: 2,
        countermeasureCooldown: 5.8,
        tacticalManeuver: {
          cooldown: 17,
          jitter: 9,
          chance: 0.24,
          range: 5200
        },
        evasiveClimb: {
          min: 120,
          max: 320
        }
      },
      targeting: {
        airPriorityRange: 8000,
        groundStrafe: {
          range: 5200,
          chance: 0.05,
          cooldown: 20
        }
      },
      missile: {
        capacity: 2,
        initialDelay: 9,
        cooldown: 19,
        cooldownJitter: 5,
        minRange: 3400,
        maxRange: 5000,
        boresight: 0.95,
        leadTime: 12,
        projectile: {
          speed: 335,
          turnRate: 0.72,
          burnTime: 10,
          life: 16,
          coastDrag: 0.1,
          damage: 44,
          proximityRadius: 16
        }
      }
    },
    wingman: {
      damage: 1.15,
      aimSpread: 0.9,
      airMissile: {
        capacity: 4,
        cooldown: 6.5,
        minRange: 2600,
        maxRange: 6900
      }
    },
    groundAA: {
      initialDelay: 4.2,
      initialJitter: 3.2,
      maxRange: 2000,
      cooldown: 8.2,
      cooldownJitter: 3,
      burstRounds: 2,
      burstInterval: 0.15,
      burstScale: 0.4,
      dispersionScale: 2.2,
      altitudeScale: 0.72,
      damageMultiplier: 0.55,
      stopToFireChance: 0.2,
      t72StopToFireChance: 0.48,
      shilka: {
        rangeScale: 0.72,
        altitudeScale: 0.72,
        burstScale: 0.65,
        cooldownScale: 1.35,
        damageScale: 0.62,
        dispersionScale: 1.65
      }
    }
  },
  standard: {
    id: 'standard',
    player: {
      hull: 100,
      countermeasures: 20,
      chaff: {
        count: 20,
        cooldown: 1.7,
        radarTrackBreakChance: 0.5,
        radarMissileBreakChance: 0.56,
        radarTrackDisruptionDuration: 2.8,
        radarMissileDisruptionDuration: 3.3,
        radarMissileEffectRange: 5000,
        radarTrackReevaluationCooldown: 5,
      },
      incomingDamage: 1
    },
    fighter: {
      health: 1,
      aimSpread: 1,
      openingDelayScale: 0.44,
      passRangeScale: 1.12,
      detection: {
        range: 5000,
        reactionDelay: 4
      },
      gun: {
        maxRange: 3000,
        boresight: 0.72,
        leadTime: 4.5,
        cooldown: 0.82,
        cooldownJitter: 0.55,
        burstMin: 8,
        burstMax: 12,
        burstInterval: 0.075
      },
      handling: {
        attackTurnRate: 0.42,
        defensiveTurnRate: 0.61,
        defensivePitchRate: 0.29
      },
      evasion: {
        lockChance: 0.38,
        countermeasureChance: 0.68,
        lockDuration: 3,
        missileDuration: 3.6,
        countermeasureFollowupChance: 0.18,
        countermeasureCapacity: 4,
        countermeasureCooldown: 3.8,
        tacticalManeuver: {
          cooldown: 10,
          jitter: 5,
          chance: 0.58,
          range: 7200
        },
        evasiveClimb: {
          min: 420,
          max: 820
        }
      },
      targeting: {
        airPriorityRange: 9000,
        groundStrafe: {
          range: 6600,
          chance: 0.16,
          cooldown: 14
        }
      },
      missile: {
        capacity: 4,
        initialDelay: 5.5,
        cooldown: 10.5,
        cooldownJitter: 2.8,
        minRange: 2200,
        maxRange: 5700,
        boresight: 0.88,
        leadTime: 12,
        projectile: {
          speed: 395,
          turnRate: 1.02,
          burnTime: 10,
          life: 18,
          coastDrag: 0.075,
          damage: 58,
          proximityRadius: 27
        }
      }
    },
    wingman: {
      damage: 1,
      aimSpread: 1,
      airMissile: {
        capacity: 6,
        cooldown: 5.2,
        minRange: 2300,
        maxRange: 7800
      }
    },
    groundAA: {
      initialDelay: 3.8,
      initialJitter: 3,
      maxRange: 2200,
      cooldown: 8.6,
      cooldownJitter: 2.8,
      burstRounds: 2,
      burstInterval: 0.13,
      burstScale: 0.52,
      dispersionScale: 2.35,
      altitudeScale: 0.88,
      damageMultiplier: 0.56,
      stopToFireChance: 0.3,
      t72StopToFireChance: 0.55,
      shilka: {
        rangeScale: 0.74,
        altitudeScale: 0.82,
        burstScale: 0.65,
        cooldownScale: 1.3,
        damageScale: 0.66,
        dispersionScale: 1.55
      }
    }
  },
  hard: {
    id: 'hard',
    player: {
      hull: 88,
      countermeasures: 20,
      chaff: {
        count: 20,
        cooldown: 2,
        radarTrackBreakChance: 0.4,
        radarMissileBreakChance: 0.46,
        radarTrackDisruptionDuration: 2.4,
        radarMissileDisruptionDuration: 2.8,
        radarMissileEffectRange: 4600,
        radarTrackReevaluationCooldown: 5.5,
      },
      incomingDamage: 1.25
    },
    fighter: {
      health: 1.16,
      aimSpread: 0.68,
      openingDelayScale: 0.22,
      passRangeScale: 1.32,
      detection: {
        range: 5500,
        reactionDelay: 1.8
      },
      gun: {
        maxRange: 3500,
        boresight: 0.58,
        leadTime: 6.2,
        cooldown: 0.42,
        cooldownJitter: 0.28,
        burstMin: 14,
        burstMax: 18,
        burstInterval: 0.055
      },
      handling: {
        attackTurnRate: 0.54,
        defensiveTurnRate: 0.82,
        defensivePitchRate: 0.4
      },
      evasion: {
        lockChance: 0.72,
        countermeasureChance: 0.92,
        lockDuration: 3.5,
        missileDuration: 4.1,
        countermeasureFollowupChance: 0.68,
        countermeasureCapacity: 6,
        countermeasureCooldown: 2.3,
        tacticalManeuver: {
          cooldown: 5.2,
          jitter: 2.8,
          chance: 0.9,
          range: 8600
        },
        evasiveClimb: {
          min: 850,
          max: 1550
        }
      },
      targeting: {
        airPriorityRange: 10500,
        groundStrafe: {
          range: 7600,
          chance: 0.3,
          cooldown: 10
        }
      },
      missile: {
        capacity: 6,
        initialDelay: 1.6,
        cooldown: 4.4,
        cooldownJitter: 1.1,
        minRange: 1500,
        maxRange: 6100,
        boresight: 0.68,
        leadTime: 12,
        projectile: {
          speed: 475,
          turnRate: 1.32,
          burnTime: 11,
          life: 19,
          coastDrag: 0.045,
          damage: 67,
          proximityRadius: 36
        }
      }
    },
    wingman: {
      damage: 0.9,
      aimSpread: 1.1,
      airMissile: {
        capacity: 8,
        cooldown: 4.1,
        minRange: 1900,
        maxRange: 8500
      }
    },
    groundAA: {
      initialDelay: 3.6,
      initialJitter: 2.8,
      maxRange: 2200,
      cooldown: 8.2,
      cooldownJitter: 2.5,
      burstRounds: 1,
      burstInterval: 0.12,
      burstScale: 0.52,
      dispersionScale: 2.5,
      altitudeScale: 0.9,
      damageMultiplier: 0.59,
      stopToFireChance: 0.32,
      t72StopToFireChance: 0.55,
      shilka: {
        rangeScale: 0.58,
        altitudeScale: 0.78,
        burstScale: 0.42,
        cooldownScale: 1.7,
        damageScale: 0.48,
        dispersionScale: 2.5
      }
    }
  }
});

export function getDifficultyPreset(id = 'standard') {
  return DIFFICULTY_PRESETS[id] ?? DIFFICULTY_PRESETS.standard;
}
