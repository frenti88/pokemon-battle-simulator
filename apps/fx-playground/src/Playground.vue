<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { FX_CATALOG } from '@battle/battle-fx/catalog'
import { previewSpriteHeight } from '../../game/src/scene/previewActors.js'
import { createScene } from '../../game/src/scene/index.js'
import { MOVE_DETAILS } from '../../game/src/moveDetails.js'
import { ROSTER } from '../../game/src/roster/index.js'
import RosterPicker from '../../game/src/components/RosterPicker.vue'
import { createPlaygroundAudio, getPlaygroundSoundInfo } from './audio.js'
import { createPlaygroundPlayback } from './playback.js'
import './playground.css'

const details = new Map(MOVE_DETAILS.map(item => [item.id, item]))
const moves = FX_CATALOG.map(item => ({ ...item, ...details.get(item.id), sound: getPlaygroundSoundInfo(item.id) }))
  .sort((a, b) => a.name.localeCompare(b.name))
const host = ref(null), move = ref('hydro-pump'), source = ref('charizard'), target = ref('venusaur')
const search = ref(''), filter = ref('all'), activeActorId = ref('source'), phase = ref('attack')
const sourceSize = ref(1), targetSize = ref(1), layout = ref('wide'), reversed = ref(false)
const reducedMotion = ref(false), repeat = ref(false), repeatGap = ref(1000), seed = ref(42), effectiveness = ref('')
const loading = ref(true), sceneReady = ref(false), sceneError = ref(''), cryMessage = ref('')
const dimensions = { wide: [1000, 450], square: [720, 600], portrait: [560, 700] }
const selected = computed(() => moves.find(item => item.id === move.value))
const phased = computed(() => selected.value.phases?.includes('prepare'))
const normalize = value => String(value).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '')
const filteredMoves = computed(() => moves.filter(item =>
  normalize(`${item.name} ${item.id} ${item.number}`).includes(normalize(search.value))
  && (filter.value !== 'sound' || item.sound.available)
  && (filter.value !== 'phased' || item.phases?.includes('prepare'))))
const sourceName = computed(() => ROSTER[source.value]?.name ?? (source.value === 'tall' ? 'Figura alta de prueba' : 'Figura ancha de prueba'))
const targetName = computed(() => ROSTER[target.value]?.name ?? (target.value === 'tall' ? 'Figura alta de prueba' : 'Figura ancha de prueba'))
const soundLabel = computed(() => !selected.value.sound.available ? 'Sin sonido de movimiento compatible'
  : selected.value.sound.kind === 'accepted' ? 'Sonido de movimiento sincronizado' : 'Sonido de movimiento disponible')
const stageStyle = computed(() => ({ aspectRatio: dimensions[layout.value].join(' / ') }))
const audio = createPlaygroundAudio()
const audioState = shallowRef(audio.getState())
const unsubscribeAudio = audio.subscribe(value => { audioState.value = value })
const playbackState = shallowRef({ status: 'idle', busy: false, cue: null, iteration: 0 })
let scene = null, disposed = false, generation = 0, cryGeneration = 0, motionPreference
const player = createPlaygroundPlayback({ getScene: () => scene, audio, onState: value => { playbackState.value = value } })
const busy = computed(() => playbackState.value.busy)
const status = computed(() => loading.value ? 'Cargando escenario' : sceneError.value ? 'Escenario no disponible'
  : ({ idle: 'Listo', loading: 'Preparando sonido', playing: 'Reproduciendo', waiting: 'En bucle', error: 'Reproducción no disponible' }[playbackState.value.status] ?? 'Listo'))
const message = computed(() => sceneError.value || (loading.value ? 'Preparando tu Pokémon…' : playbackState.value.message || 'Elige un movimiento y pulsa Reproducir efecto.'))
const cueLabel = computed(() => ({ prepared: 'Preparación', impact: 'Contacto', recovery: 'Recuperación' }[playbackState.value.cue] ?? 'Listo para el contacto'))
const audioNote = computed(() => !audioState.value.enabled ? 'El sonido está silenciado.'
  : audioState.value.status === 'unavailable' ? 'El audio no está disponible en este navegador.'
  : audioState.value.loadError ? 'No se pudo cargar una grabación. Reproduce de nuevo para reintentar.'
  : !audioState.value.sfxEnabled ? 'Sonidos de movimiento desactivados. Las muestras de gritos siguen disponibles.'
  : reducedMotion.value ? 'Movimiento reducido usa un efecto visual más corto; el sonido está en pausa.'
  : phase.value === 'prepare' ? 'Las vistas previas de preparación no tienen sonido.'
  : !selected.value.sound.available ? 'Este movimiento solo tiene vista previa visual; no hay grabación compatible disponible.'
  : 'El sonido sigue al efecto. Las grabaciones se reproducen a su velocidad original.')

function stop() { cryGeneration++; cryMessage.value = ''; player.stop() }
async function refresh() {
  const token = ++generation
  stop(); scene?.dispose(); scene = null; sceneReady.value = false; loading.value = true; sceneError.value = ''
  await nextTick()
  if (disposed || token !== generation || !host.value) return
  const [width, height] = dimensions[layout.value]
  const left = reversed.value ? .75 : .25, right = 1 - left
  try {
    const next = await createScene(host.value, { width, height, actors: [
      { id: 'source', profile: source.value, view: 'back', x: left, y: .82, height: previewSpriteHeight(source.value, { scale: Number(sourceSize.value), width, height }), facing: reversed.value ? -1 : 1 },
      { id: 'target', profile: target.value, view: 'front', x: right, y: .63, height: previewSpriteHeight(target.value, { scale: Number(targetSize.value), far: true, width, height }), facing: reversed.value ? 1 : -1 },
    ] })
    if (disposed || token !== generation) { next.dispose(); return }
    scene = next; sceneReady.value = true; loading.value = false
    player.stop('Listo para reproducir.')
  } catch {
    if (!disposed && token === generation) { loading.value = false; sceneError.value = 'No se pudo cargar el escenario. Reintenta para preparar el laboratorio.' }
  }
}
function changeProfile(side) {
  if (side === 'source') sourceSize.value = 1
  else targetSize.value = 1
  void refresh()
}
function selectMove(id) {
  if (id === move.value) return
  stop(); move.value = id; phase.value = selected.value.phases?.includes('prepare') ? 'prepare' : 'attack'
  audio.warmMoves([id])
}
function changePhase(value) { if (phase.value !== value) { stop(); phase.value = value } }
function play() {
  if (!sceneReady.value || loading.value) return
  cryGeneration++; cryMessage.value = ''
  seed.value = Math.max(0, Math.min(999999, Math.trunc(Number(seed.value) || 0)))
  void player.play({ moveId: move.value, phase: phased.value ? phase.value : 'attack',
    sourceId: activeActorId.value, targetIds: [activeActorId.value === 'source' ? 'target' : 'source'],
    visualSeed: seed.value, effectiveness: effectiveness.value || null,
  }, { reducedMotion: reducedMotion.value, loop: repeat.value, loopDelayMs: Number(repeatGap.value) })
}
function newVariation() { stop(); seed.value = Math.floor(Math.random() * 1_000_000) }
function resetScene() {
  source.value = 'charizard'; target.value = 'venusaur'; sourceSize.value = 1; targetSize.value = 1
  layout.value = 'wide'; reversed.value = false; activeActorId.value = 'source'; seed.value = 42
  void refresh()
}
async function playCry(profile, name) {
  stop()
  const token = ++cryGeneration
  cryMessage.value = `Preparando el grito de ${name}…`
  const played = await audio.previewCry(profile)
  if (!disposed && token === cryGeneration) cryMessage.value = played ? `Grito de ${name}` : 'Este grito no está disponible.'
}
function keydown(event) {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
    || event.target?.closest?.('input, select, textarea, button, summary, a, [contenteditable="true"]')) return
  if (event.code === 'Space') { event.preventDefault(); if (busy.value) stop(); else play() }
}
const syncMotion = () => { reducedMotion.value = motionPreference.matches }
watch([reducedMotion, activeActorId, repeat, repeatGap, effectiveness], stop)
onMounted(() => {
  motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
  syncMotion(); motionPreference.addEventListener('change', syncMotion)
  document.addEventListener('keydown', keydown)
  audio.warmMoves([move.value]); void refresh()
})
onBeforeUnmount(() => {
  disposed = true; generation++; cryGeneration++
  document.removeEventListener('keydown', keydown); motionPreference?.removeEventListener('change', syncMotion)
  player.dispose(); unsubscribeAudio(); audio.dispose(); scene?.dispose()
})
</script>

<template>
  <main class="fx-shell">
    <header class="fx-header">
      <a class="fx-brand" href="/"><span class="ball-mark" aria-hidden="true"></span>Battle Lab<span class="fx-brand-section">/ Laboratorio</span></a>
      <nav aria-label="Navegación principal"><a href="/">Inicio</a><a href="/simulation">Simulación</a><a href="/preview">Vista previa de movimientos</a><a href="/playground" aria-current="page">Laboratorio FX</a></nav>
    </header>
    <div class="fx-page-heading">
      <div><p class="fx-eyebrow">EL ESTUDIO DE EFECTOS</p><h1>Cada movimiento. Cada detalle<span>.</span></h1><p>Explora el movimiento, escucha el impacto y hazlo tuyo.</p></div>
      <span class="fx-catalog-count"><strong>{{ moves.length }}</strong> efectos de movimiento</span>
    </div>

    <div class="fx-workspace">
      <aside class="fx-library" aria-labelledby="fx-library-title">
        <div class="fx-library-heading"><h2 id="fx-library-title">Biblioteca de movimientos</h2><span>{{ filteredMoves.length }} / {{ moves.length }}</span></div>
        <label class="fx-search"><span class="fx-sr-only">Buscar movimientos</span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input v-model="search" type="search" placeholder="Buscar nombre o número de movimiento" autocomplete="off" aria-controls="fx-moves"></label>
        <div class="fx-filter-row" role="group" aria-label="Filtrar movimientos"><button :aria-pressed="filter === 'all'" @click="filter = 'all'">Todos</button><button :aria-pressed="filter === 'sound'" @click="filter = 'sound'">Con sonido</button><button :aria-pressed="filter === 'phased'" @click="filter = 'phased'">En dos fases</button></div>
        <div id="fx-moves" class="fx-move-list" aria-label="Movimientos">
          <button v-for="item in filteredMoves" :key="item.id" class="fx-move-option" :class="{ selected: move === item.id }" :aria-pressed="move === item.id" @click="selectMove(item.id)">
            <span class="fx-move-dot" :style="{ background: item.color }" aria-hidden="true"></span><span class="fx-move-name">{{ item.name }}<small>{{ item.phases?.includes('prepare') ? 'Efecto en 2 fases' : item.sound.available ? 'Sonido disponible' : 'Efecto visual' }}</small></span><span class="fx-move-number">{{ item.number }}</span>
          </button>
          <div v-if="!filteredMoves.length" class="fx-empty"><strong>No hay movimientos coincidentes</strong><p>Prueba con otro nombre o número.</p><button @click="search = ''; filter = 'all'">Limpiar búsqueda</button></div>
        </div>
        <p class="fx-library-note">Todos los movimientos, en cualquier bando. Tu movimiento seleccionado se mantiene mientras buscas.</p>
      </aside>

      <div class="fx-main">
        <section class="fx-preview" aria-labelledby="fx-selected-title" :style="{ '--move-color': selected.color }">
          <div class="fx-preview-heading"><div><p class="fx-eyebrow">MOVIMIENTO {{ selected.number }} <span> / {{ phased && phase === 'prepare' ? 'PREPARACIÓN' : 'VISTA PREVIA DE EFECTO' }}</span></p><h2 id="fx-selected-title">{{ selected.name }}</h2><p>{{ selected.description }}</p></div><span class="fx-status" :class="{ active: busy }"><i></i>{{ status }}</span></div>
          <div class="fx-playback-bar"><button class="fx-primary" :disabled="!sceneReady || loading" @click="play"><span aria-hidden="true">▶</span>{{ busy ? 'Repetir efecto' : 'Reproducir efecto' }}</button><button class="fx-secondary" :disabled="!sceneReady && !cryMessage" @click="stop">Detener</button><label class="fx-check"><input v-model="repeat" type="checkbox">Bucle</label><label v-if="repeat" class="fx-gap"><span class="fx-sr-only">Intervalo de bucle</span><select v-model.number="repeatGap" aria-label="Intervalo de bucle"><option :value="500">Pausa 0.5s</option><option :value="1000">Pausa 1s</option><option :value="2000">Pausa 2s</option></select></label><span class="fx-key-hint"><kbd>espacio</kbd> reproducir / parar</span></div>
          <div class="fx-stage-frame"><div ref="host" class="fx-stage" :class="`fx-stage-${layout}`" :style="stageStyle" role="img" :aria-label="`${sourceName} y ${targetName}: vista previa de efecto de ${selected.name}`"></div><div v-if="loading || sceneError" class="fx-scene-message" role="status"><p>{{ message }}</p><button v-if="sceneError" class="fx-secondary" @click="refresh">Reintentar escena</button></div><div class="fx-stage-caption" :class="{ 'is-reversed': reversed }" aria-hidden="true"><span>{{ sourceName }} <b v-if="activeActorId === 'source'">USUARIO</b></span><span>{{ targetName }} <b v-if="activeActorId === 'target'">USUARIO</b></span></div></div>
          <div class="fx-feedback"><p role="status" aria-live="polite">{{ message }}</p><span class="fx-cue" :class="{ reached: playbackState.cue }">{{ cueLabel }}</span><span v-if="repeat && playbackState.iteration > 0" class="fx-loop-count">Ronda {{ playbackState.iteration }}</span></div>
        </section>

        <div class="fx-settings-grid">
          <section class="fx-control-card" aria-labelledby="fx-playback-title">
            <div class="fx-card-heading"><span class="fx-card-index">01</span><h2 id="fx-playback-title">Reproducción</h2></div>
            <label class="fx-field">Usuario del movimiento<select v-model="activeActorId"><option value="source">Tu Pokémon · {{ sourceName }}</option><option value="target">Oponente · {{ targetName }}</option></select></label>
            <div v-if="phased" class="fx-phase" role="group" aria-label="Fase del movimiento"><button :aria-pressed="phase === 'prepare'" @click="changePhase('prepare')">01 · Preparar</button><button :aria-pressed="phase === 'attack'" @click="changePhase('attack')">02 · Atacar</button></div>
            <label class="fx-check fx-motion"><input v-model="reducedMotion" type="checkbox">Movimiento reducido<span>Efectos más breves y suaves</span></label>
            <div class="fx-variation"><label class="fx-field">Semilla visual<input v-model.number="seed" type="number" min="0" max="999999" step="1" @change="stop"></label><button class="fx-secondary" @click="newVariation">Nueva variación</button></div>
            <p class="fx-help">Mantén la misma semilla para comparar repeticiones. Cámbiala para un nuevo patrón de partículas.</p>
          </section>

          <section class="fx-control-card" aria-labelledby="fx-sound-title">
            <div class="fx-card-heading"><span class="fx-card-index">02</span><h2 id="fx-sound-title">Sonido</h2><label class="fx-check fx-sound-toggle"><input type="checkbox" aria-label="Sonido" :checked="audioState.enabled" @change="audio.setEnabled($event.target.checked)">{{ audioState.enabled ? 'Activado' : 'Desactivado' }}</label></div>
            <div class="fx-sound-summary"><span class="fx-sound-indicator" :class="{ available: selected.sound.available }"></span>{{ soundLabel }}</div>
            <label class="fx-volume">Volumen <output>{{ Math.round(audioState.volume * 100) }}%</output><input type="range" aria-label="Volumen del sonido" min="0" max="100" step="5" :value="Math.round(audioState.volume * 100)" :disabled="!audioState.enabled" @input="audio.setVolume(Number($event.target.value) / 100)"></label>
            <div class="fx-sound-options"><label class="fx-check"><input type="checkbox" :checked="audioState.sfxEnabled" :disabled="!audioState.enabled" @change="audio.setSfxEnabled($event.target.checked)">Sonidos de movimientos</label><label class="fx-field">Reacción de impacto<select v-model="effectiveness" :disabled="!audioState.enabled || !audioState.sfxEnabled"><option value="">Ninguna</option><option value="super-effective">Muy eficaz</option><option value="resisted">No muy eficaz</option></select></label></div>
            <p class="fx-help" role="status">{{ audioNote }}</p>
          </section>
        </div>

        <details class="fx-actors" open>
          <summary><span class="fx-card-index">03</span><span>Pokémon y escenario<small>Cambia los participantes. Prueba el encuadre.</small></span><span class="fx-disclosure" aria-hidden="true">⌄</span></summary>
          <div class="fx-actor-grid">
            <div class="fx-actor"><RosterPicker v-model="source" label="Tu Pokémon" include-shapes @change="changeProfile('source')"/><label class="fx-scale">Escala del sprite <output>{{ Number(sourceSize).toFixed(1) }}×</output><input v-model.number="sourceSize" type="range" aria-label="Escala de tu Pokémon" min="0.8" max="1.2" step="0.1" @change="refresh"></label><button class="fx-secondary fx-cry" :disabled="!audioState.enabled || !ROSTER[source]" @click="playCry(source, sourceName)">Escuchar grito de {{ sourceName }}</button></div>
            <div class="fx-actor"><RosterPicker v-model="target" label="Pokémon oponente" include-shapes @change="changeProfile('target')"/><label class="fx-scale">Escala del sprite <output>{{ Number(targetSize).toFixed(1) }}×</output><input v-model.number="targetSize" type="range" aria-label="Escala del Pokémon oponente" min="0.8" max="1.2" step="0.1" @change="refresh"></label><button class="fx-secondary fx-cry" :disabled="!audioState.enabled || !ROSTER[target]" @click="playCry(target, targetName)">Escuchar grito de {{ targetName }}</button></div>
          </div>
          <div class="fx-stage-controls"><label class="fx-field">Campo de batalla<select v-model="layout" @change="refresh"><option value="wide">Panorámico · 1000 × 450</option><option value="square">Cuadrado · 720 × 600</option><option value="portrait">Vertical · 560 × 700</option></select></label><label class="fx-check"><input v-model="reversed" type="checkbox" @change="refresh">Invertir perspectiva</label><button class="fx-secondary" @click="resetScene">Reiniciar escenario</button></div>
          <p v-if="cryMessage" class="fx-cry-feedback" role="status">{{ cryMessage }}</p>
        </details>
        <p class="fx-footer-note">Un espacio para el movimiento y el sonido. Las vistas previas no alteran los resultados del combate.</p>
      </div>
    </div>
  </main>
</template>
