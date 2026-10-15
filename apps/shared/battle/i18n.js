// Spanish translation helpers for battle logs, announcements, and UI labels.
// Preserves proper names (Pokemon names, Move names, Trainer names).

const STAT_NAMES = {
  attack: 'el Ataque',
  defense: 'la Defensa',
  specialAttack: 'el Ataque Especial',
  specialDefense: 'la Defensa Especial',
  speed: 'la Velocidad',
  evasion: 'la Evasión',
  accuracy: 'la Precisión',
  'Attack': 'el Ataque',
  'Defense': 'la Defensa',
  'Special Attack': 'el Ataque Especial',
  'Special Defense': 'la Defensa Especial',
  'Speed': 'la Velocidad',
  'Evasion': 'la Evasión',
  'Accuracy': 'la Precisión',
}

const CONDITION_NAMES = {
  paralysis: 'paralizado',
  poison: 'envenenado',
  'bad poison': 'gravemente envenenado',
  burn: 'quemado',
  sleep: 'dormido',
  freeze: 'congelado',
}

export const POKEMON_TYPES = {
  Normal: 'Normal',
  Fire: 'Fuego',
  Water: 'Agua',
  Electric: 'Eléctrico',
  Grass: 'Planta',
  Ice: 'Hielo',
  Fighting: 'Lucha',
  Poison: 'Veneno',
  Ground: 'Tierra',
  Flying: 'Volador',
  Psychic: 'Psíquico',
  Bug: 'Bicho',
  Rock: 'Roca',
  Ghost: 'Fantasma',
  Dragon: 'Dragón',
  Dark: 'Siniestro',
  Steel: 'Acero',
}

export function translateType(type) {
  if (!type) return type
  return POKEMON_TYPES[type] || type
}

export function translateCondition(code) {
  return {
    brn: 'Quemado',
    par: 'Paralizado',
    slp: 'Dormido',
    tox: 'Gravemente envenenado',
    psn: 'Envenenado',
    frz: 'Congelado',
  }[code] || code
}

export function translateCategory(cat) {
  if (!cat) return cat
  return {
    Physical: 'Físico',
    Special: 'Especial',
    Status: 'Estado',
  }[cat] || cat
}

export function translateBattleText(text) {
  if (!text || typeof text !== 'string') return text

  // Turn X
  const turnMatch = /^Turn (\d+)$/.exec(text)
  if (turnMatch) return `Turno ${turnMatch[1]}`

  // X used Y!
  const usedMatch = /^(.+?) used (.+?)!$/.exec(text)
  if (usedMatch) return `¡${translateActor(usedMatch[1])} usó ${usedMatch[2]}!`

  // Go, X!
  const goMatch = /^Go, (.+?)!$/.exec(text)
  if (goMatch) return `¡Adelante, ${goMatch[1]}!`

  // The opponent sent out X!
  const opponentSendMatch = /^The opponent sent out (.+?)!$/.exec(text)
  if (opponentSendMatch) return `¡El oponente envió a ${opponentSendMatch[1]}!`

  // X fainted.
  const faintMatch = /^(.+?) fainted\.$/.exec(text)
  if (faintMatch) return `¡${translateActor(faintMatch[1])} se debilitó!`

  // X flinched!
  const flinchMatch = /^(.+?) flinched!$/.exec(text)
  if (flinchMatch) return `¡${translateActor(flinchMatch[1])} retrocedió!`

  // X could not move
  if (text.includes('could not move')) {
    let res = text.replace('could not move', 'no pudo moverse')
    res = res.replace('(paralysis)', '(paralizado)')
    res = res.replace('(frozen)', '(congelado)')
    res = res.replace('(sleep)', '(dormido)')
    res = res.replace('(recharging)', '(recargando)')
    return translateActor(res)
  }

  // Damage & HP
  if (text.includes('lost HP.')) return text.replace('lost HP.', 'perdió PS.')
  if (text.includes('recovered HP.')) return text.replace('recovered HP.', 'recuperó PS.')
  if (text.includes('was hurt by')) {
    return text
      .replace('was hurt by its burn!', 'sufrió daño por sus quemaduras!')
      .replace('was hurt by poison!', 'sufrió daño por el veneno!')
      .replace('was hurt by', 'sufrió daño por')
  }

  // Stat boosts / unboosts
  const boostMatch = /^(.+?)’s (.+?) rose( sharply)?\.$/.exec(text)
  if (boostMatch) {
    const actor = translateActor(boostMatch[1])
    const stat = STAT_NAMES[boostMatch[2]] || boostMatch[2]
    return `¡${stat} de ${actor} subió${boostMatch[3] ? ' mucho' : ''}!`
  }
  const unboostMatch = /^(.+?)’s (.+?) fell( sharply)?\.$/.exec(text)
  if (unboostMatch) {
    const actor = translateActor(unboostMatch[1])
    const stat = STAT_NAMES[unboostMatch[2]] || unboostMatch[2]
    return `¡${stat} de ${actor} bajó${unboostMatch[3] ? ' mucho' : ''}!`
  }
  if (text.includes('stat changes were removed')) return text.replace('stat changes were removed.', 'recuperó sus estadísticas iniciales.')

  // Status conditions
  if (text.includes('is paralyzed.')) return text.replace('is paralyzed.', 'está paralizado.')
  if (text.includes('is poisoned.')) return text.replace('is poisoned.', 'está envenenado.')
  if (text.includes('is badly poisoned.')) return text.replace('is badly poisoned.', 'está gravemente envenenado.')
  if (text.includes('is burned.')) return text.replace('is burned.', 'está quemado.')
  if (text.includes('fell asleep!')) return text.replace('fell asleep!', 'se quedó dormido!')
  if (text.includes('is fast asleep.')) return text.replace('is fast asleep.', 'está profundamente dormido.')
  if (text.includes('woke up!')) return text.replace('woke up!', 'se despertó!')
  if (text.includes('is frozen solid!')) return text.replace('is frozen solid!', 'está congelado!')
  if (text.includes('thawed out!')) return text.replace('thawed out!', 'se descongeló!')
  if (text.includes('recovered from its status condition.')) return text.replace('recovered from its status condition.', 'se curó de su estado.')
  if (text.includes('The team recovered from its status conditions.')) return 'El equipo se curó de sus problemas de estado.'

  // Effectiveness & Combat outcomes
  if (text === 'It’s super effective!') return '¡Es muy eficaz!'
  if (text === 'It’s not very effective.') return 'No es muy eficaz…'
  if (text === 'A critical hit!') return '¡Un golpe crítico!'
  if (text === 'The attack missed!') return '¡El ataque falló!'
  if (text === 'The move did not succeed.') return 'El movimiento falló.'
  if (text.endsWith('was unaffected.')) return text.replace('was unaffected.', 'no se vio afectado.')
  const hitCountMatch = /^Hit (\d+) times?!$/.exec(text)
  if (hitCountMatch) return `¡Golpeó ${hitCountMatch[1]} ${hitCountMatch[1] === '1' ? 'vez' : 'veces'}!`

  // Weather
  if (text === 'The weather returned to normal.') return 'El clima volvió a la normalidad.'
  if (text === 'Rain began.') return 'Empezó a llover.'
  if (text === 'Harsh sunlight began.') return 'El sol brilla con fuerza.'
  if (text === 'A sandstorm brewed.') return 'Se desató una tormenta de arena.'
  if (text === 'It started to hail.') return 'Empezó a granizar.'
  if (text.includes('continues.')) return text.replace('continues.', 'continúa.')

  // Results
  if (text === 'You won the battle!' || text === 'You won the battle.') return '¡Ganaste la batalla!'
  if (text === 'The opponent won the battle.' || text === 'Your opponent won.') return '¡El oponente ganó la batalla!'
  if (text === 'The battle ended in a draw.' || text === 'The battle is a draw.') return 'La batalla terminó en empate.'
  if (text === 'The battle ended without a result.' || text === 'Battle ended.') return 'La batalla terminó sin resultado.'

  // Turn announcements
  if (text === 'The battle is about to begin.') return 'La batalla está a punto de comenzar.'
  if (text === 'Waiting for the next decision.') return 'Esperando la siguiente decisión.'
  if (text === 'Choose a Pokémon to send out.') return 'Elige un Pokémon para enviar al combate.'
  if (text === 'Choose your next move, or switch to a teammate.') return 'Elige tu próximo movimiento o cambia a un compañero.'
  if (text === 'Your Pokémon needs a replacement. Choose a teammate below.') return 'Tu Pokémon necesita un reemplazo. Elige un compañero abajo.'

  return translateActor(text)
}

export function translateSideCondition(text) {
  if (!text) return text
  return text
    .replace(/^Your side:/, 'Tu bando:')
    .replace(/^Opponent:/, 'Oponente:')
    .replace(/\((\d+) layers?\)/, (_, n) => `(${n} ${n === '1' ? 'capa' : 'capas'})`)
}

function translateActor(text) {
  return text
    .replace(/^The opposing (.+?)$/, 'El $1 oponente')
    .replace(/^The opposing side/, 'El bando oponente')
    .replace(/^Your side/, 'Tu bando')
    .replace(/^Your Pokémon/, 'Tu Pokémon')
}
