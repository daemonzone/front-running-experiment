// Word material for the name generator. Real words and roots only: names must read like brands
// ("kleoshq", "harborlane", "luminova"), not like random letters. Famous brand names are left out.

/** Roots: evocative single words (nature, sky, myth, craft, ideas), 4-8 letters. */
export const roots = [
  // nature & landscape
  'cedar', 'harbor', 'ember', 'meadow', 'glacier', 'willow', 'aspen', 'birch', 'maple', 'juniper', 'cypress', 'laurel',
  'fern', 'moss', 'clover', 'thistle', 'heather', 'sage', 'basil', 'ivy', 'lotus', 'orchid', 'poppy', 'iris', 'lily',
  'jasmine', 'saffron', 'cinder', 'tundra', 'canyon', 'mesa', 'ridge', 'summit', 'valley', 'lagoon', 'marsh', 'fjord',
  'reef', 'coral', 'tide', 'breeze', 'gale', 'zephyr', 'mistral', 'monsoon', 'aurora', 'comet', 'nebula', 'orbit',
  'lunar', 'solar', 'stellar', 'cosmos', 'quartz', 'granite', 'basalt', 'onyx', 'opal', 'jade', 'amber', 'ivory',
  'cobalt', 'copper', 'silver', 'bronze', 'driftwood', 'timber', 'prairie', 'savanna', 'glade', 'hollow', 'thicket',
  // greek / latin / myth / stars
  'kleos', 'atlas', 'lumen', 'aether', 'nexus', 'vertex', 'zenith', 'apex', 'helix', 'cipher', 'axiom', 'vector',
  'matrix', 'prism', 'spectra', 'aegis', 'helios', 'selene', 'kairos', 'chronos', 'logos', 'ethos', 'sophia', 'orion',
  'titan', 'phoenix', 'halcyon', 'arcadia', 'elysian', 'lyra', 'vega', 'altair', 'sirius', 'rigel', 'castor', 'perseus',
  'draco', 'aquila', 'corvus', 'lynx', 'falcon', 'osprey', 'heron', 'raven', 'wren', 'finch', 'swift', 'kestrel',
  'merlin', 'condor', 'verity', 'virtus', 'aurum', 'argent', 'terra', 'ventus', 'umbra', 'lucent', 'solace', 'novum',
  // objects, craft, ideas
  'beacon', 'anchor', 'compass', 'lantern', 'bridge', 'tower', 'gate', 'arch', 'pillar', 'vault', 'forge', 'anvil',
  'quill', 'ledger', 'signal', 'pulse', 'echo', 'cadence', 'rhythm', 'tempo', 'harmony', 'chorus', 'spark', 'flint',
  'torch', 'blaze', 'summit', 'pioneer', 'voyage', 'journey', 'quest', 'mosaic', 'tapestry', 'loom', 'atelier',
  'cobble', 'keystone', 'trellis', 'meridian', 'horizon', 'frontier', 'vantage', 'lattice', 'kindle', 'harvest',
];

/** Short words (3-6 letters) for two-word compounds. */
export const shorts = [
  'spark', 'drift', 'bloom', 'crest', 'glow', 'ridge', 'stone', 'field', 'brook', 'grove', 'haven', 'path', 'trail',
  'bright', 'swift', 'clear', 'true', 'bold', 'keen', 'calm', 'wild', 'open', 'north', 'south', 'east', 'west', 'river',
  'lake', 'peak', 'cliff', 'cove', 'bay', 'dune', 'frost', 'snow', 'rain', 'sun', 'moon', 'star', 'sky', 'cloud', 'wind',
  'wave', 'flame', 'ash', 'oak', 'pine', 'elm', 'fox', 'hawk', 'wolf', 'bear', 'deer', 'crow', 'dove', 'lark', 'owl',
  'jay', 'pearl', 'gold', 'iron', 'steel', 'salt', 'sand', 'clay', 'glass', 'thread', 'loom', 'craft', 'maker', 'smith',
  'mill', 'yard', 'works', 'dock', 'port', 'lane', 'mark', 'line', 'core', 'root', 'leaf', 'seed', 'bud', 'vine',
  'harbor', 'ember', 'cedar', 'amber', 'coral', 'ivory', 'quartz', 'lumen', 'atlas', 'echo', 'pulse', 'tide', 'north',
];

/** Brand-style endings attached to a root. */
export const suffixes = [
  'hq', 'labs', 'works', 'hub', 'base', 'kit', 'nest', 'path', 'forge', 'wave', 'loop', 'scope', 'sphere', 'mind',
  'stack', 'yard', 'dock', 'desk', 'lane', 'ware', 'ly', 'io', 'ify', 'ix', 'ex', 'ora', 'era', 'ova',
];

export const prefixes = [
  'neo', 'ever', 'true', 'open', 'bright', 'north', 'blue', 'green', 'first', 'one', 'pure', 'clear', 'swift', 'bold',
  'wise', 'meta', 'omni', 'uni', 'pan', 'prime', 'alto', 'nova', 'terra', 'sol',
];

/** Small twists that turn a root into a coined name (kleos -> kleosa, lumen -> lumenly). */
export const endings = ['ly', 'io', 'ify', 'ora', 'ia', 'ex', 'era', 'ix', 'ova', 'is', 'on', 'ara', 'ino'];

/** Substrings a generated name must never contain. */
export const blocklist = [
  'porn', 'nazi', 'rape', 'fuck', 'shit', 'cunt', 'nigg', 'fag', 'xxx', 'sexy', 'hitler', 'kill', 'dick', 'cock',
  'whore', 'slut', 'terror', 'bomb', 'murder',
];
