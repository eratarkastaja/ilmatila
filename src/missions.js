export const MISSIONS = {
  intercept: {
    id: 'intercept',
    hostiles: 4,
    wingmen: 2,
    groundBattle: true,
    groundPairs: 6,
    groundTrucks: 12,
  },
  patrol: {
    id: 'patrol',
    hostiles: 2,
    wingmen: 2,
    groundBattle: false,
    groundPairs: 0,
    groundTrucks: 0,
  },
  support: {
    id: 'support',
    hostiles: 1,
    wingmen: 2,
    groundBattle: true,
    groundPairs: 6,
    groundTrucks: 12,
  },
  training: {
    id: 'training',
    hostiles: 0,
    wingmen: 2,
    groundBattle: false,
    groundPairs: 0,
    groundTrucks: 0,
  },
};
