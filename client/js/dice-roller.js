/** Simulador de dados para D&D 5e */

export function roll(sides, count = 1, modifier = 0) {
  const rolls = [];
  for (let i = 0; i < count; i++) {
    rolls.push(Math.floor(Math.random() * sides) + 1);
  }
  const sum = rolls.reduce((a, b) => a + b, 0);
  return {
    rolls,
    sum,
    total: sum + modifier,
    modifier,
    notation: `${count}d${sides}${modifier >= 0 ? '+' : ''}${modifier || ''}`,
    isCritical: sides === 20 && count === 1 && rolls[0] === 20,
    isFumble: sides === 20 && count === 1 && rolls[0] === 1,
  };
}

export function d20(modifier = 0) { return roll(20, 1, modifier); }
export function d12(modifier = 0) { return roll(12, 1, modifier); }
export function d10(modifier = 0) { return roll(10, 1, modifier); }
export function d8(modifier = 0) { return roll(8, 1, modifier); }
export function d6(count = 1, modifier = 0) { return roll(6, count, modifier); }
export function d4(count = 1, modifier = 0) { return roll(4, count, modifier); }

export function rollInitiative(modifier = 0) {
  return d20(modifier);
}

export function rollAttack(attackBonus = 0) {
  const result = d20(attackBonus);
  return { ...result, hit: !result.isFumble, crit: result.isCritical };
}

export function rollSavingThrow(modifier = 0, dc = 10) {
  const result = d20(modifier);
  return { ...result, success: result.total >= dc, dc };
}

/** Parsea notación de dados como "2d6+3" y tira */
export function parseAndRoll(notation) {
  const match = notation.match(/^(\d+)?d(\d+)([+-]\d+)?$/i);
  if (!match) return null;
  const count = parseInt(match[1] || '1');
  const sides = parseInt(match[2]);
  const modifier = parseInt(match[3] || '0');
  return roll(sides, count, modifier);
}
