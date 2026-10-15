<script setup>
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { createBattleState } from '@battle/battle-core'
import { MOVES } from '../moveCatalog.js'
import { createPresenter } from '../presentation/presenter.js'
import { createPreviewState, createPreviewTransaction } from '../previewState.js'
import { createPreviewAudio } from '../presentation/audio.js'

import PokemonInfo from './PokemonInfo.vue'
import RosterPicker from './RosterPicker.vue'
import { ROSTER } from '../roster/index.js'
import { previewSceneActors, previewBattleActors } from '../scene/previewActors.js'
import { translateType, translateBattleText } from '../../../shared/battle/i18n.js'

function translateStatus(text) {
  if (!text) return text
  const readyMatch = /^(.+?) is ready\. Choose a move\.$/.exec(text)
  if (readyMatch) return `¡${readyMatch[1]} está listo! Elige un movimiento.`
  const hitMatch = /^(.+?) took (\d+) damage\. Hit (\d+) of (\d+)\.$/.exec(text)
  if (hitMatch) return `¡${hitMatch[1]} recibió ${hitMatch[2]} de daño! Golpe ${hitMatch[3]} de ${hitMatch[4]}.`
  return translateBattleText(text)
}

const activeActorId = ref('source'), nearProfile = ref('charizard'), farProfile = ref('venusaur')
const selectedActor = computed(() => displayed.value.actors[activeActorId.value])
const previewActors = () => previewBattleActors(nearProfile.value, farProfile.value)
const fixtureOptions = () => ({ sourceId: activeActorId.value, actors: previewActors() })
const stage = ref(null), busy = ref(false), error = ref(''), hasPlayed = ref(false), continuingWeather = ref(false)
const sceneReady = ref(false), reducedMotion = ref(false)
const selectedId = ref('flamethrower'), phase = ref('attack')
const selectedMove = computed(() => MOVES.find(move => move.id === selectedId.value))
const preparing = computed(() => Boolean(selectedMove.value.preparation) && phase.value === 'prepare')
const committed = shallowRef(createBattleState()), displayed = shallowRef(committed.value)
const weatherLabels = { rain: 'Lluvia', sun: 'Sol radiante', sandstorm: 'Tormenta de arena', hail: 'Granizo' }
const fieldSummary = computed(() => [weatherLabels[displayed.value.weather], displayed.value.mudSport && 'Chapoteolodo', displayed.value.waterSport && 'Hidrochorro'].filter(Boolean).join(' · '))
const conditionLabels = { paralysis: 'PARALIZADO', poison: 'ENVENENADO', sleep: 'DORMIDO', 'bad-poison': 'GRAV. ENVENENADO', burn: 'QUEMADO' }
const statPreview = computed(() => [
  ['attackChange', 'Ataque'], ['defenseChange', 'Defensa'], ['specialAttackChange', 'Ataque Especial'],
  ['specialDefenseChange', 'Defensa Especial'], ['speedChange', 'Velocidad'], ['evasionChange', 'Evasión'],
].filter(([key]) => selectedMove.value[key]).map(([key, label]) => `${label} ${selectedMove.value[key] > 0 ? '+' : '−'}${Math.abs(selectedMove.value[key])}`).join(' y '))
const previewResult = computed(() => preparing.value ? 'solo preparación, sin daño de PS'
  : selectedMove.value.previewCaption ? selectedMove.value.previewCaption
  : selectedMove.value.ghostCurse ? 'Maldición estilo Fantasma · consume la mitad de los PS máximos; sin daño inmediato al objetivo'
  : selectedMove.value.requiresTargetSleep && selectedMove.value.drain ? `${selectedMove.value.damage} de daño de demostración al objetivo dormido · recupera la mitad del daño infligido`
  : selectedMove.value.ohko ? 'golpe fulminante KO de un golpe · elimina todos los PS restantes del objetivo'
  : selectedMove.value.substitute ? 'consume ¼ de los PS máximos para crear un sustituto'
  : selectedMove.value.recycle ? 'recupera la Baya Aranja consumida de muestra'
  : selectedMove.value.copyStages ? 'copia los cambios de características y foco del objetivo'
  : selectedMove.value.spikes ? 'añade una capa de Púas; sin daño inmediato de PS'
  : selectedMove.value.sportPreview ? `vista previa de campo de ${selectedMove.value.name}, sin daño de PS`
  : selectedMove.value.previewOnly ? 'vista previa de ejecución, sin daño de PS'
  : selectedMove.value.selfDestruct && statPreview.value ? `${statPreview.value} · el usuario se debilita; PS del objetivo sin cambios`
  : selectedMove.value.sourceDefenseChange ? `${selectedMove.value.damage} de daño de demostración · Defensa del usuario ${selectedMove.value.sourceDefenseChange > 0 ? '+' : '−'}${Math.abs(selectedMove.value.sourceDefenseChange)}`
  : selectedMove.value.knockOff ? '69 de daño de demostración · elimina el objeto equipado del objetivo'
  : selectedMove.value.statusDamageBoost ? `${selectedMove.value.damage * 2} de daño de demostración · el usuario de muestra está quemado`
  : selectedMove.value.paralysisDamageBoost ? `${selectedMove.value.damage * 2} de daño de demostración · cura la parálisis del objetivo`
  : selectedMove.value.healFraction ? 'restaura la mitad de los PS máximos del usuario'
  : selectedMove.value.weatherHeal ? 'restaura PS; la cantidad depende del clima'
  : selectedMove.value.bellyDrum ? 'consume la mitad de los PS máximos para maximizar el Ataque'
  : selectedMove.value.swapItems ? 'intercambia los objetos equipados de muestra'
  : selectedMove.value.supportPreview === 'destinyBond' ? 'distintivo de Mismo Destino en el usuario; sin daño inmediato'
  : selectedMove.value.supportPreview === 'nightmare' ? 'distintivo de Pesadilla en el objetivo dormido; sin daño inmediato'
  : selectedMove.value.supportPreview === 'grudge' ? 'distintivo de Rabia en el usuario; sin daño inmediato'
  : selectedMove.value.supportPreview === 'seeded' ? 'drena al objetivo con Drenadoras; sin daño o curación inmediata'
  : selectedMove.value.supportPreview === 'ingrained' ? 'arraiga al usuario con Arraigo; sin curación inmediata'
  : selectedMove.value.supportPreview ? selectedMove.value.id === 'wish' ? 'Deseo pedido; la curación posterior no está simulada' : `vista previa de ${selectedMove.value.name}, sin daño de PS`
  : selectedMove.value.perishSong ? 'marca a todos los Pokémon activos; sin cuenta atrás ni daño de PS'
  : selectedMove.value.weather ? `${weatherLabels[selectedMove.value.weather].toLowerCase()}, sin daño inmediato de PS`
  : selectedMove.value.rest ? 'recuperación total de PS y sueño'
  : selectedMove.value.cure ? 'cura el estado del usuario, sin daño de PS'
  : selectedMove.value.focusEnergy ? 'ratio de golpe crítico +2, sin daño de PS'
  : selectedMove.value.restrictionPreview ? `distintivo de ${selectedMove.value.name}, sin daño de PS`
  : statPreview.value ? selectedMove.value.damage > 0 ? `${selectedMove.value.damage} de daño de demostración · ${statPreview.value}` : `${statPreview.value}${selectedMove.value.confuses ? ' y confusión' : ''}, sin daño de PS`
  : selectedMove.value.target === 'self'
  ? `${selectedMove.value.defenseChange ? 'Defensa +2' : 'vista previa de protección'}, sin daño de PS`
  : selectedMove.value.trapPreview ? 'vista previa de atrape, sin daño de PS'
  : selectedMove.value.switchPreview ? 'vista previa de cambio, sin daño de PS'
  : selectedMove.value.condition
  ? `${conditionLabels[selectedMove.value.condition].toLowerCase()}, sin daño inmediato de PS`
  : selectedMove.value.accuracyChange ? 'precisión −1, sin daño de PS'
  : selectedMove.value.levelDamage ? `${selectedActor.value.level} de daño según el nivel`
  : selectedMove.value.retaliates ? `muestra: ${selectedMove.value.retaliates === 'physical' ? '32 de daño físico recibido → 64 devueltos' : '36 de daño especial recibido → 72 devueltos'}`
  : selectedMove.value.splitsHp ? 'promedia los PS actuales de ambos, limitados a su máximo'
  : selectedMove.value.endeavor ? 'reduce los PS del objetivo a los PS actuales del usuario'
  : selectedMove.value.drain ? `${selectedMove.value.damage} de daño de demostración · recupera la mitad del daño infligido`
  : selectedMove.value.selfDestruct ? `${selectedMove.value.damage} de daño de demostración · el usuario se debilita`
  : selectedMove.value.recoilDamage ? `${selectedMove.value.damage} de daño de demostración · retroceso: ${Math.round(selectedMove.value.recoilDamage * 100)}% del daño infligido`
  : selectedMove.value.recoilMaxHp ? `${selectedMove.value.damage} de daño de demostración · retroceso: ¼ de los PS máximos`
  : selectedMove.value.confuses ? selectedMove.value.damage > 0 ? `${selectedMove.value.damage} de daño de demostración · vista previa de confusión` : 'vista previa de confusión, sin daño de PS'
  : `${selectedMove.value.damage} de daño de demostración`)
const status = ref('Charizard está listo. Elige un movimiento.'), animateHealth = ref(false), hitStep = ref(false)
const battleAudio = createPreviewAudio()
let scene, disposed = false, media, sceneGeneration = 0, playGeneration = 0
const presenter = createPresenter({
  loadFx: async () => (await import('../../../shared/battle/reviewedFx.js')).createReviewedBattleFx(),
  loadWeather: () => import('@battle/battle-fx/weather'),
  onMove: request => battleAudio.previewMove({ ...request,
    effectiveness: MOVES.find(move => move.id === request.moveId)?.effective === true ? 'super-effective' : null }),
  getScene: () => scene,
  onDisplay: value => { displayed.value = value.state; status.value = translateStatus(value.message); animateHealth.value = value.animate; hitStep.value = Boolean(value.hitStep) },
  onBusy: value => { busy.value = value },
  onError: error => console.warn('Effect skipped:', error),
})
const changeMotion = () => { reducedMotion.value = media.matches; battleAudio.stop(); presenter.skip() }
async function refreshScene() {
  const token = ++sceneGeneration
  playGeneration++; presenter.reset(); scene?.dispose(); scene = null; sceneReady.value = false; error.value = ''
  reset()
  try {
    const { createScene } = await import('../scene/index.js')
    if (disposed || token !== sceneGeneration) return
    const next = await createScene(stage.value, { actors: previewSceneActors(nearProfile.value, farProfile.value) })
    if (disposed || token !== sceneGeneration) { next.dispose(); return }
    scene = next; sceneReady.value = true
  } catch {
    if (!disposed && token === sceneGeneration) error.value = 'Campo de batalla no disponible. Los resultados del movimiento siguen estando disponibles.'
  }
}
onMounted(() => {
  media = window.matchMedia('(prefers-reduced-motion: reduce)'); changeMotion(); media.addEventListener('change', changeMotion)
  void refreshScene()
})

async function attack(weatherContinuation = false) {
  if (busy.value) return
  if (weatherContinuation && !selectedMove.value.weather) return
  continuingWeather.value = weatherContinuation
  battleAudio.stop()
  if (!weatherContinuation) {
    void battleAudio.unlock()
    battleAudio.warmMoves([selectedId.value], { fxIds: true })
  }
  // Replay intentionally starts a new preview; presentation never applies this result again.
  const token = ++playGeneration
  const transaction = createPreviewTransaction(selectedMove.value, { ...fixtureOptions(), targetId: activeActorId.value === 'source' ? 'target' : 'source', phase: phase.value })
  committed.value = transaction.after
  await presenter.enqueue(transaction, { effectsEnabled: true, reducedMotion: reducedMotion.value, visualSeed: 42, weatherContinuation })
  if (!disposed && token === playGeneration) hasPlayed.value = true
}
function reset() {
  playGeneration++
  battleAudio.stop(); battleAudio.warmMoves([selectedId.value], { fxIds: true })
  committed.value = createPreviewState(selectedMove.value, fixtureOptions()); presenter.reset(committed.value, `${committed.value.actors[activeActorId.value].name} está listo. Elige un movimiento.`); hasPlayed.value = false; continuingWeather.value = false
}
function selectMove(id) {
  if (busy.value || id === selectedId.value) return
  selectedId.value = id; phase.value = selectedMove.value.preparation ? 'prepare' : 'attack'; reset()
}
function selectPhase(value) { if (busy.value || phase.value === value) return; phase.value = value; reset() }
function selectAttacker(id) {
  if (id === activeActorId.value) return
  activeActorId.value = id; reset()
}
onBeforeUnmount(() => { disposed = true; sceneGeneration++; playGeneration++; presenter.destroy(); scene?.dispose(); media?.removeEventListener('change', changeMotion); battleAudio.dispose() })
</script>

<template>
  <main class="app-shell">
    <header class="page-header preview-page-header">
      <div class="brand"><span class="ball-mark" aria-hidden="true"></span> Demostración de combate</div>
      <nav class="preview-project-nav" aria-label="Navegación principal"><a href="/">Inicio</a><a href="/simulation">Simulación</a><a href="/preview" aria-current="page">Vista previa de movimientos</a><a href="/playground">Laboratorio FX</a></nav>
    </header>

    <section class="battle-panel" aria-labelledby="battle-title">
      <div class="battle-heading">
        <div><p class="eyebrow">VISTA PREVIA DE ANIMACIÓN</p><h1 id="battle-title">Elige un bando. Prueba un movimiento.</h1></div>
        <span class="battle-format">01 <span>/</span> MOVIMIENTO INDIVIDUAL</span>
      </div>

      <div class="battlefield">
        <div class="field-lines" aria-hidden="true"></div>
        <div ref="stage" class="canvas-mount" role="img" :aria-label="`${displayed.actors.source.name} en tu bando se enfrenta a ${displayed.actors.target.name} en el bando oponente. ${selectedActor.name} ha sido elegido para usar el movimiento.`"></div>

        <PokemonInfo class="attacker-info" :actor="displayed.actors.source" :types="ROSTER[nearProfile].types" :active="activeActorId === 'source'" :animate="animateHealth" :hit-step="hitStep" :reduced-motion="reducedMotion" />
        <PokemonInfo class="defender-info" :actor="displayed.actors.target" :types="ROSTER[farProfile].types" :active="activeActorId === 'target'" :animate="animateHealth" :hit-step="hitStep" :reduced-motion="reducedMotion" />

        <div v-if="!sceneReady" class="load-message" role="status">{{ error || 'Preparando el campo de batalla…' }}</div>
        <div v-if="fieldSummary" class="weather-badge">{{ fieldSummary }}</div>
        <div class="field-caption"><span class="small-ball" aria-hidden="true">✦</span> {{ displayed.actors.source.name.toUpperCase() }} <span class="versus">VS</span> {{ displayed.actors.target.name.toUpperCase() }}</div>
      </div>

      <div class="battle-message" role="status" aria-live="polite"><span class="message-caret" aria-hidden="true">›</span>{{ status }}</div>

      <div class="preview-controls">
        <div class="attacker-switch" role="group" aria-label="Pokémon que usa el movimiento">
          <button :aria-pressed="activeActorId === 'source'" :class="{ selected: activeActorId === 'source' }" @click="selectAttacker('source')">Tu bando</button>
          <button :aria-pressed="activeActorId === 'target'" :class="{ selected: activeActorId === 'target' }" @click="selectAttacker('target')">Bando oponente</button>
        </div>
        <RosterPicker v-model="nearProfile" label="Tu Pokémon" @change="refreshScene" />
        <RosterPicker v-model="farProfile" label="Pokémon oponente" @change="refreshScene" />
      </div>

      <div class="move-panel" :style="{ '--move-accent': selectedMove.color }">
        <div class="move-details">
          <div class="move-topline"><span class="move-number">MOVIMIENTO {{ selectedMove.number }}</span><span class="move-type">{{ translateType(selectedMove.type).toUpperCase() }}</span></div>
          <h2>{{ selectedMove.name }}</h2>
          <p>{{ preparing ? selectedMove.preparation.description : selectedMove.description }}</p>
          <div class="move-stats"><span>{{ selectedMove.powerLabel ? (selectedMove.powerLabel === 'POWER' ? 'POTENCIA' : selectedMove.powerLabel) : 'POTENCIA' }} <strong>{{ selectedMove.power ?? '—' }}</strong></span><span>PRECISIÓN <strong>{{ selectedMove.accuracyText || (selectedMove.accuracy == null ? '—' : `${selectedMove.accuracy}%`) }}</strong></span></div>
          <p class="demo-note">Vista previa de animación · {{ preparing ? 'Ronda 1' : selectedMove.preparation ? 'Ronda 2 · golpe garantizado' : selectedMove.target === 'field' ? 'afecta al campo de batalla' : selectedMove.target === 'self' ? 'afecta al bando del usuario' : 'golpe garantizado' }} · {{ previewResult }}</p>
          <p v-if="selectedMove.mechanicNote" class="demo-note">{{ selectedMove.mechanicNote }}</p>
          <p v-if="selectedMove.weather" class="demo-note">Previsualiza el clima continuo para ver su efecto al final del turno. Esta vista previa independiente no avanza turnos ni aplica daño por clima.</p>
          <p class="demo-note">Muestra de todos los movimientos · sin filtro por conjunto de movimientos.</p>
        </div>
        <div class="move-actions">
          <p class="active-user">{{ selectedActor.name }} · {{ activeActorId === 'source' ? 'Tu bando' : 'Bando oponente' }}</p>
          <div v-if="selectedMove.preparation" class="phase-switch" role="group" aria-label="Ronda del movimiento">
            <button :aria-pressed="phase === 'prepare'" :disabled="busy" @click="selectPhase('prepare')">Ronda 1 · Preparar</button>
            <button :aria-pressed="phase === 'attack'" :disabled="busy" @click="selectPhase('attack')">Ronda 2 · Atacar</button>
          </div>
          <button class="attack-button" :disabled="busy || (!sceneReady && !error)" @click="attack()">
            <span v-if="!busy" aria-hidden="true">▶</span>
            <span v-else class="button-spinner" aria-hidden="true"></span>
            {{ busy ? continuingWeather ? 'Continuando clima…' : preparing ? 'Preparando…' : 'Atacando…' : preparing ? `${hasPlayed ? 'Repetir' : 'Iniciar'} preparación` : `${hasPlayed ? 'Repetir' : 'Usar'} ${selectedMove.name}` }}
          </button>
          <button v-if="selectedMove.weather" class="reset-button" :disabled="busy || (!sceneReady && !error)" @click="attack(true)">Previsualizar clima continuo</button>
          <button class="reset-button" :disabled="busy || !hasPlayed" @click="reset">↺ <span>Reiniciar vista previa</span></button>
        </div>
      </div>

      <div class="move-selector" role="group" aria-label="Elige un movimiento">
        <button v-for="move in MOVES" :key="move.id" type="button" class="move-choice"
          :class="{ selected: selectedId === move.id }" :style="{ '--move-accent': move.color }"
          :aria-pressed="selectedId === move.id" :disabled="busy" @click="selectMove(move.id)">
          <span class="choice-top"><span>{{ translateType(move.type) }}</span><span aria-hidden="true">{{ selectedId === move.id ? '●' : '○' }}</span></span>
          <strong>{{ move.name }}</strong>
        </button>
      </div>
    </section>
    <footer class="page-footer"><span>Pokémon © Nintendo / Game Freak</span><span>Animación no oficial · Sprites de <a href="https://pokemondb.net/sprites" target="_blank" rel="noopener noreferrer">Pokémon Database ↗</a> / <a href="https://github.com/PokeAPI/sprites" target="_blank" rel="noopener noreferrer">PokéAPI ↗</a></span><span>Arte de rocas: <a href="https://game-icons.net/1x1/lorc/rock.html" target="_blank" rel="noopener noreferrer">Lorc</a> · <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener noreferrer">CC BY 3.0</a></span></footer>
  </main>
</template>

<style scoped>
.preview-project-nav{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.preview-project-nav a{padding:10px 12px;border-radius:6px;color:#a7b3a6;font-size:12px;font-weight:500;text-decoration:none;white-space:nowrap}.preview-project-nav a:hover{color:#edf0e4;background:#ffffff05}.preview-project-nav a[aria-current]{background:#27342c;color:#e0eacb}
@media(max-width:700px){.preview-page-header{height:auto;min-height:112px;justify-content:center;flex-wrap:wrap;gap:12px;padding:20px 0 17px}.preview-project-nav{width:100%;justify-content:center;gap:0}.preview-project-nav a{padding:9px 8px;font-size:11px}}
</style>
