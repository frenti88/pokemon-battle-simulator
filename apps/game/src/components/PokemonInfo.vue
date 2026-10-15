<script setup>
import { computed } from 'vue'
import { translateType } from '../../../shared/battle/i18n.js'
const props = defineProps({ actor: Object, types: { type: Array, default: () => [] }, active: Boolean, animate: Boolean, hitStep: Boolean, reducedMotion: Boolean })
const conditions = { paralysis: 'PARALIZADO', poison: 'ENVENENADO', sleep: 'DORMIDO', 'bad-poison': 'GRAV. ENVENENADO', burn: 'QUEMADO' }
const badges = computed(() => {
  const a = props.actor
  const stages = [['attackStage', 'ATAQUE'], ['defenseStage', 'DEFENSA'], ['specialAttackStage', 'AT. ESP.'], ['specialDefenseStage', 'DEF. ESP.'], ['speedStage', 'VELOCIDAD'], ['evasionStage', 'EVASIÓN'], ['accuracyStage', 'PRECISIÓN']]
  return [...stages.filter(([key]) => a[key]).map(([key, label]) => `${label} ${a[key] > 0 ? '+' : '−'}${Math.abs(a[key])}`),
    a.attention && 'SEÑUELO · VISTA PREVIA', a.drowsy && 'SOMNOLIENTO · VISTA PREVIA', a.cursed && 'MALDITO · VISTA PREVIA', a.destinyBond && 'MISMO DESTINO · VISTA PREVIA', a.nightmare && 'PESADILLA · VISTA PREVIA', a.grudge && 'RABIA · VISTA PREVIA', a.seeded && 'DRENADORAS · VISTA PREVIA', a.ingrained && 'ARRAIGO · VISTA PREVIA', a.focusEnergy && 'CONCENTRADO', a.trapped && 'ATRAPADO · VISTA PREVIA', a.confused && 'CONFUSO · VISTA PREVIA',
    a.disabled && 'ANULACIÓN · VISTA PREVIA', a.encored && 'OTRA VEZ · VISTA PREVIA', a.tormented && 'TORMENTO · VISTA PREVIA', a.imprisoning && 'CERROJO · VISTA PREVIA', a.taunted && 'MOFA · VISTA PREVIA',
    a.infatuated && 'ATRACCIÓN · VISTA PREVIA', a.wishPending && 'DESEO PENDIENTE', a.perishSong && 'CANTO MORTAL · VISTA PREVIA',
    a.safeguard && 'VELO SAGRADO', a.magicCoat && 'CAPA MÁGICA', a.enduring && 'AGUANTE', a.heldItem && `OBJETO: ${a.heldItem}`,
    a.aimed && 'APUNTADO · VISTA PREVIA', a.identified && 'IDENTIFICADO · VISTA PREVIA', a.substituteHp > 0 && `SUSTITUTO: ${a.substituteHp} PS`, a.spikesLayers > 0 && `PÚAS: ${a.spikesLayers} · VISTA PREVIA`,
    a.protected && 'PROTECCIÓN', a.lightScreen && 'PANTALLA DE LUZ', a.reflect && 'REFLEJO', a.hp === 0 && 'DEBILITADO'].filter(Boolean)
})
</script>
<template>
  <div class="pokemon-info" :class="{ 'active-actor-info': active }">
    <div class="name-line"><h2>{{ actor.name }}</h2><span>Nv. {{ actor.level }}</span></div>
    <div class="hp-line"><span>PS</span><div class="hp-track" role="progressbar" :aria-label="`${actor.name} PS`" :aria-valuenow="actor.hp" :aria-valuemax="actor.maxHp" :aria-valuemin="0"><div class="hp-fill" :class="{ animated: animate && !reducedMotion, 'hit-step': hitStep }" :style="{ width: `${actor.hp / actor.maxHp * 100}%` }"></div></div></div>
    <div class="info-bottom"><span class="pokemon-types"><span v-for="type in types" :key="type" class="type-label" :class="type.toLowerCase()">{{ translateType(type).toUpperCase() }}</span></span><span>{{ actor.hp }} / {{ actor.maxHp }}</span></div>
    <p v-if="conditions[actor.condition]" class="condition-badge" :class="`condition-${actor.condition}`">{{ conditions[actor.condition] }}</p>
    <div v-if="badges.length" class="guard-badges"><span v-for="badge in badges" :key="badge" class="condition-badge guard-badge">{{ badge }}</span></div>
  </div>
</template>

<style scoped>
.pokemon-types { display: flex; flex-wrap: wrap; gap: 7px; }
.info-bottom { gap: 8px; }
.info-bottom > span:last-child { white-space: nowrap; }
.hp-fill.animated.hit-step { transition-duration: .08s; transition-timing-function: linear; }
</style>
