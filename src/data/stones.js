// The six stones. `socket` names the slot on the gauntlet (see gauntlet sockets),
// laid out like the reference art: knuckles left→right Soul, Reality, Space, Power;
// Time on the thumb; Mind on the back of the hand.
export const STONES = [
  {
    id: 'space',
    name: 'Space Stone',
    color: '#2f7dff',
    key: '1',
    tagline: 'Every place is a single step away.',
    effect: 'Space folds — the stars stretch into light.',
  },
  {
    id: 'mind',
    name: 'Mind Stone',
    color: '#ffc61a',
    key: '2',
    tagline: 'Thought itself bends to the bearer.',
    effect: 'A psychic wave ripples through everything.',
  },
  {
    id: 'reality',
    name: 'Reality Stone',
    color: '#ff1a2e',
    key: '3',
    tagline: 'What is real is only a suggestion.',
    effect: 'Reality glitches and rewrites itself.',
  },
  {
    id: 'power',
    name: 'Power Stone',
    color: '#a23bff',
    key: '4',
    tagline: 'Raw energy, enough to break worlds.',
    effect: 'A shockwave of pure force.',
  },
  {
    id: 'time',
    name: 'Time Stone',
    color: '#22ff6b',
    key: '5',
    tagline: 'Past, present and future, paused at will.',
    effect: 'Time stops — then runs backwards.',
  },
  {
    id: 'soul',
    name: 'Soul Stone',
    color: '#ff8a1a',
    key: '6',
    tagline: 'It knows what you love. It asks for it.',
    effect: 'You stand in the Soul World.',
  },
];

export const STONE_BY_ID = Object.fromEntries(STONES.map((s) => [s.id, s]));
