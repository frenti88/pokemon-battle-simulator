<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import BattleView from '../../shared/battle/BattleView.vue'
import { createSimulationAudio } from './audio.js'
import { createExperienceAudio } from '../../shared/music/audio.js'
import RandomTeamBuilder from '../../shared/teams/RandomTeamBuilder.vue'
import KantoRosterSelector from '../../shared/teams/KantoRosterSelector.vue'
import { getKantoStarterSet } from '../../shared/teams/kantoStarterSets.js'
import { createCommandId, simulationRequest } from './api.js'
import { activeMembers, spriteUrl, buildBattleLog, viewerResultTitle } from '../../shared/battle/index.js'
import { createTeamDraft, toTeamPayload, draftIssues, readTeamDraft, saveTeamDraft } from './teamDraft.js'
import { survivalStartCommand, survivalAdvanceCommand, readSurvivalStart, saveSurvivalStart, displayedSurvivors, survivalEndingText } from './survival.js'
import { translateBattleText, translateType, translateCondition } from '../../shared/battle/i18n.js'

const config = shallowRef(null), latest = shallowRef(null), displayed = shallowRef(null)
const battleAudio = createExperienceAudio({ createBattle: createSimulationAudio })
const run = shallowRef(null), regionId = ref('kanto'), pendingAdvance = shallowRef(null)
const survivalPage = /^\/survival(?:\/|\.html)?$/.test(globalThis.location?.pathname ?? '')
const pendingStart = shallowRef(null), nextLeadMemberId = ref('')
const survival = computed(() => latest.value ? run.value?.kind === 'survival' : survivalPage)
const preparationLocked = computed(() => busy.value || Boolean(pendingStart.value))
const runRoster = computed(() => displayedSurvivors(run.value, displayed.value, playing.value))
const canContinue = computed(() => ['between-battles', 'between-rounds', 'starting-next'].includes(run.value?.status))
const survivalInactivityMinutes = computed(() => Math.max(1, Math.floor((config.value?.survivalProfile?.inactivityMs ?? 30 * 60_000) / 60_000)))
const presetId = ref('kanto'), leadIndex = ref(0), busy = ref(true), playing = ref(false)
const teamMode = ref('custom')
const initialKantoTeam = ['charizard', 'blastoise', 'venusaur', 'raichu', 'alakazam', 'machamp'].map(id => getKantoStarterSet(id))
const customTeam = shallowRef(createTeamDraft(initialKantoTeam))
const teamCatalog = shallowRef(null)
const customChosenCount = computed(() => customTeam.value.filter(m => m.species).length)
const catalogLoading = ref(false), catalogError = ref(''), teamErrors = shallowRef([]), teamValidation = shallowRef(null)
const draftSaved = ref(false), generatingTeam = ref(false)
const error = ref(''), reducedMotion = ref(false)
const battleView = ref(null), arena = ref(null), logHost = ref(null), setupTitle = ref(null)
const setupMessage = () => survivalPage ? 'Elige seis Pokémon y un líder para comenzar tu partida de Supervivencia.' : 'Elige una región, tu equipo y un Pokémon inicial para comenzar.'
const message = ref(setupMessage()), log = ref([])
const confirmingForfeit = ref(false), pendingChoice = shallowRef(null), pendingQuit = shallowRef(null)
let generation = 0, controller = null, catalogController = null, disposed = false

const availablePresets = computed(() => (config.value?.presets ?? []).filter(preset => preset.id === 'kanto'))
const availableLeagues = computed(() => (config.value?.leagues ?? []).filter(league => league.id === 'kanto'))
const selectedPreset = computed(() => availablePresets.value.find(preset => preset.id === presetId.value) ?? availablePresets.value[0])
const selectedTeam = computed(() => teamMode.value === 'custom' ? customTeam.value : selectedPreset.value?.team ?? [])
const selectedTeamLabel = computed(() => teamMode.value === 'custom' ? 'Equipo personalizado' : selectedPreset.value?.name ?? 'Tu equipo')
const customIssues = computed(() => teamCatalog.value ? draftIssues(customTeam.value, teamCatalog.value) : [])
const customReady = computed(() => customChosenCount.value === 6 && (!teamCatalog.value || !customIssues.value.length))
const selectedLeague = computed(() => availableLeagues.value.find(league => league.id === regionId.value) ?? availableLeagues.value[0])
const lead = computed(() => selectedTeam.value[leadIndex.value])
const members = computed(() => activeMembers(displayed.value))
const decision = computed(() => latest.value?.decision)
const locked = computed(() => busy.value || playing.value || Boolean(pendingChoice.value) || Boolean(pendingQuit.value) || !latest.value?.complete || Boolean(latest.value?.result))
const switchIds = computed(() => new Set(decision.value?.switches?.map(member => member.memberId) ?? []))
const remaining = computed(() => displayed.value?.own.team.filter(member => !member.fainted).length ?? 0)
const translateSurvivalEnding = reason => ({
  forfeit: 'Te rendiste en esta partida.',
  loss: 'Tu equipo fue derrotado.',
  defeat: 'Tu equipo fue derrotado.',
  draw: 'Esta ronda terminó en empate.',
  'turn-limit': 'Esta ronda alcanzó el límite de turnos.',
  'no-survivors': 'No quedan Pokémon para continuar.',
  interrupted: 'Tu progreso está guardado. Sincroniza o reintenta para continuar.',
}[reason] ?? 'Tu partida de Supervivencia ha terminado.')
const resultTitle = computed(() => {
  if (survival.value) return canContinue.value ? `Ronda ${run.value.roundNumber} superada.` : 'Tu partida de Supervivencia ha terminado.'
  if (run.value?.status === 'won') return `¡Eres el Campeón de ${run.value.regionName}!`
  if (run.value?.status === 'between-battles') return `${run.value.opponent.name} derrotado.`
  if (run.value?.status === 'lost') return 'Tu desafío de la liga ha terminado.'
  return viewerResultTitle(latest.value)
})
const resultEyebrow = computed(() => survival.value ? canContinue.value ? 'RECUPÉRATE. REAGRÚPATE. CONTINÚA.' : 'RESULTADOS DE SUPERVIVENCIA' : ({ won: 'CAMPEÓN REGIONAL', 'between-battles': 'UN PASO MÁS CERCA', lost: 'DESAFÍO TERMINADO' }[run.value?.status] ?? 'COMBATE COMPLETADO'))
const resultDetail = computed(() => {
  const challenge = run.value
  if (challenge?.kind === 'survival') return canContinue.value
    ? 'Los supervivientes recuperaron hasta el 25% de sus PS máximos. Los Pokémon debilitados revivieron con el 50% de sus PS máximos. Problemas de estado y cambios de características eliminados. PP y objetos iniciales restaurados.'
    : `${challenge.wins} ${challenge.wins === 1 ? 'ronda superada' : 'rondas superadas'}. ${translateSurvivalEnding(challenge.endingReason)}`
  if (challenge?.status === 'between-battles') {
    const oppTitle = challenge.nextOpponent?.title === 'Elite Four' ? 'del Alto Mando' : challenge.nextOpponent?.title === 'Champion' ? 'Campeón' : (challenge.nextOpponent?.title || 'Entrenador')
    return `Siguiente: ${challenge.nextOpponent?.name} ${oppTitle}. Tu equipo comienza el siguiente combate con PS y PP al máximo, estados curados y objetos equipados restaurados.`
  }
  if (challenge?.status === 'won') return `Todos los ${challenge.totalStages} entrenadores derrotados, incluido el Campeón ${challenge.opponent.name}. ¡Completaste la liga de ${challenge.regionName} en Nivel 100!`
  if (challenge?.status === 'lost') return `${challenge.wins} de ${challenge.totalStages} entrenadores derrotados. ${latest.value?.result?.reason === 'forfeit' ? 'Te rendiste en este combate.' : 'Elige una región y equipo para intentarlo de nuevo desde el primer miembro del Alto Mando.'}`
  return latest.value?.result?.reason === 'forfeit' ? 'El combate terminó por rendición.' : `Terminado en el turno ${latest.value?.turn}. El registro del combate está disponible al lado del campo.`
})
function trainerState(index) {
  if (index < (run.value?.wins ?? 0)) return 'cleared'
  if (index !== run.value?.stageIndex) return 'upcoming'
  return run.value.status === 'lost' ? 'lost' : 'current'
}
const trainerStateLabel = index => ({ cleared: 'Derrotado', current: 'En combate', lost: 'Desafío terminado', upcoming: 'Siguiente' }[trainerState(index)])
const decisionPrompt = computed(() => {
  if (pendingQuit.value) return busy.value ? 'Saliendo del combate…' : 'Reintenta salir o sincroniza para confirmar que el combate terminó.'
  if (playing.value) return 'Reproduciendo el turno…'
  if (busy.value) return 'Esperando al servidor de combate…'
  if (pendingChoice.value) return 'Sincroniza o reintenta para confirmar tu última acción.'
  if (decision.value?.kind === 'switch') return 'Elige un Pokémon para enviar al combate.'
  if (decision.value?.kind === 'wait') return 'Esperando la siguiente decisión.'
  return `¿Qué hará ${members.value[0]?.species || 'tu Pokémon'}?`
})
const normalize = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const moveInfo = move => config.value?.moves[normalize(move.id ?? move)] ?? {}
const pretty = value => String(value ?? '').replace(/([a-z])([A-Z])/g, '$1 $2')
const readyText = () => decision.value?.kind === 'switch' ? 'Tu Pokémon necesita un reemplazo. Elige un compañero abajo.' : 'Elige tu próximo movimiento o cambia a un compañero.'
watch(teamMode, mode => { if (mode === 'custom') void loadTeamCatalog() }, { immediate: true })
watch(customTeam, () => {
  teamErrors.value = []; teamValidation.value = null
  if (!latest.value) error.value = ''
  try { draftSaved.value = saveTeamDraft(globalThis.localStorage, customTeam.value) }
  catch { draftSaved.value = false }
}, { flush: 'sync' })

async function loadTeamCatalog() {
  if (teamCatalog.value || catalogLoading.value) return
  catalogLoading.value = true; catalogError.value = ''
  const request = new AbortController()
  catalogController = request
  try {
    const catalog = await simulationRequest('team-builder', { signal: request.signal })
    if (!disposed && catalogController === request) teamCatalog.value = catalog
  } catch (cause) {
    if (!disposed && catalogController === request) catalogError.value = cause.message
  } finally { if (!disposed && catalogController === request) catalogLoading.value = false }
}
async function validateCustomTeam() {
  if (busy.value || generatingTeam.value || latest.value || !teamCatalog.value || teamMode.value !== 'custom') return
  teamValidation.value = null
  teamErrors.value = customIssues.value
  if (teamErrors.value.length) return
  const { token, signal } = beginRequest()
  try {
    const checked = await simulationRequest('team/validate', { method: 'POST', body: { team: toTeamPayload(customTeam.value) }, signal })
    if (!isCurrent(token)) return
    if (checked.valid) {
      customTeam.value = createTeamDraft(checked.team)
      teamValidation.value = { valid: true, changes: checked.changes.filter(change => change.kind !== 'added') }
    } else teamErrors.value = checked.errors
  } catch (cause) { if (isCurrent(token)) error.value = cause.message }
  finally { if (isCurrent(token)) busy.value = false }
}
function generateTeam(body, { signal } = {}) {
  return simulationRequest('team/random', { method: 'POST', body, signal })
}
function holdStart(command) {
  if (!command) return
  pendingStart.value = command
  leadIndex.value = command.leadIndex
  if (Array.isArray(command.team)) { customTeam.value = createTeamDraft(command.team); teamMode.value = 'custom' }
  else { presetId.value = command.presetId; teamMode.value = 'preset' }
  saveSurvivalStart(globalThis.sessionStorage, command)
}
function showBattle() {
  battleView.value?.showBattle()
}

function beginRequest() {
  controller?.abort()
  controller = new AbortController()
  busy.value = true; error.value = ''
  return { token: ++generation, signal: controller.signal }
}
function isCurrent(token) { return !disposed && token === generation }
function addLog(events, before, after) {
  const additions = buildBattleLog(events ?? [], before, after)
  const seen = new Set(log.value.map(entry => entry.cursor))
  log.value = [...log.value, ...additions.filter(entry => !seen.has(entry.cursor))].slice(-150)
  nextTick(() => { if (logHost.value) logHost.value.scrollTop = logHost.value.scrollHeight })
}
async function acceptResponse(response, token, animate = true) {
  if (!isCurrent(token)) return
  if (!response.view?.complete) throw new Error('The server could not provide a complete battle view. Sync before continuing.')
  const changedMatch = displayed.value?.matchId !== response.matchId
  const before = changedMatch ? null : displayed.value
  if (changedMatch) { log.value = []; message.value = 'The battle is about to begin.' }
  latest.value = response.view
  run.value = response.run ?? null
  if (run.value?.regionId) regionId.value = run.value.regionId
  const selection = response.teamSelection
  if (selection?.kind === 'custom') {
    teamMode.value = 'custom'
    if (changedMatch) { customTeam.value = createTeamDraft(selection.team); leadIndex.value = selection.leadIndex }
  } else if (selection?.kind === 'preset' || run.value?.presetId && run.value.presetId !== 'custom') {
    teamMode.value = 'preset'; presetId.value = selection?.presetId ?? run.value.presetId
    if (selection) leadIndex.value = selection.leadIndex
  }
  pendingChoice.value = null
  pendingAdvance.value = run.value?.kind === 'survival' && run.value.pending ? survivalAdvanceCommand(run.value, response.matchId) : null
  pendingStart.value = null
  saveSurvivalStart(globalThis.sessionStorage, null)
  if (run.value?.kind === 'survival') {
    if (run.value.pending) nextLeadMemberId.value = run.value.pending.leadMemberId
    else if (!run.value.roster.some(member => member.id === nextLeadMemberId.value && !member.eliminated)) nextLeadMemberId.value = run.value.roster.find(member => !member.eliminated)?.id ?? ''
  }
  pendingQuit.value = null
  busy.value = false
  confirmingForfeit.value = false
  // Results and the interval before the next trainer still belong to this match.
  battleAudio.setMusicContext({ kind: run.value && !survival.value ? 'league' : 'private', matchId: response.matchId, opponentTitle: run.value?.opponent?.title })
  if (!animate) {
    displayed.value = response.view
    await nextTick()
    if (!isCurrent(token)) return
    // Base rendering can load separately while all battle controls remain usable.
    void battleView.value?.sync(response.view, { run: response.run })
    message.value = response.view.result ? resultTitle.value : readyText()
  } else {
    playing.value = true
    if (!before) displayed.value = response.view
    await nextTick()
    if (!isCurrent(token)) return
    showBattle()
    try {
      const presentation = await battleView.value.present({ before, after: response.view, events: response.events ?? [], run: response.run, playerLabel: selectedTeamLabel.value })
      if (isCurrent(token) && (!before || presentation.status !== 'completed')) message.value = readyText()
    } finally { if (isCurrent(token)) playing.value = false }
  }
  if (!isCurrent(token)) return
  addLog(response.events, before, response.view)
  if (response.ack?.accepted === false) error.value = `That choice was rejected (${response.ack.code}). The controls now show the latest legal options.`
  if (response.view.result) message.value = resultTitle.value
}
async function initialize() {
  const { token, signal } = beginRequest()
  try {
    const [settings, battle, owner] = await Promise.all([
      simulationRequest('config', { signal }),
      simulationRequest('match', { signal }).catch(cause => { if (cause.code === 'NO_MATCH') return null; throw cause }),
      survivalPage ? simulationRequest('owner', { signal }) : Promise.resolve(null),
    ])
    if (!isCurrent(token)) return
    config.value = settings
    if (battle) await acceptResponse(battle, token, false)
    else if (owner?.pendingStart) holdStart(owner.pendingStart)
  } catch (cause) { if (isCurrent(token)) error.value = cause.message }
  finally { if (isCurrent(token)) busy.value = false }
}
async function startBattle() {
  if (busy.value || generatingTeam.value || latest.value || (!pendingStart.value && !lead.value?.species)) return
  if (!pendingStart.value && teamMode.value === 'custom' && !customReady.value) { teamErrors.value = customIssues.value; return }
  void battleAudio.unlock()
  battleAudio.preload(selectedTeam.value.map(member => member.species))
  const selection = teamMode.value === 'custom' ? { team: toTeamPayload(customTeam.value) } : { presetId: selectedPreset.value.id }
  const { token, signal } = beginRequest()
  try {
    let command = pendingStart.value
    if (survival.value && !command) {
      const owner = await simulationRequest('owner', { signal })
      if (!isCurrent(token)) return
      if (!owner.ready) throw new Error('Your Survival session could not be prepared. Reconnect before starting.')
      command = survivalStartCommand({ selection, leadIndex: leadIndex.value, ownerId: owner.id, ownerRevision: owner.revision, operationId: createCommandId() })
      pendingStart.value = command
      saveSurvivalStart(globalThis.sessionStorage, command)
    }
    command ??= { ...selection, leadIndex: leadIndex.value, expectedMatchId: latest.value?.matchId ?? null, ...(selectedLeague.value ? { regionId: selectedLeague.value.id } : {}) }
    const response = await simulationRequest('match', { method: 'POST', body: command, signal })
    if (!isCurrent(token)) return
    log.value = []; battleView.value?.clear()
    await acceptResponse(response, token)
    if (isCurrent(token)) showBattle()
  } catch (cause) { if (isCurrent(token)) {
    error.value = cause.message
    if (['INVALID_TEAM', 'INVALID_SURVIVAL', 'INVALID_LEAD'].includes(cause.code)) { pendingStart.value = null; saveSurvivalStart(globalThis.sessionStorage, null) }
    if (cause.code === 'INVALID_TEAM') { teamErrors.value = cause.issues; teamValidation.value = null }
  } }
  finally { if (isCurrent(token)) busy.value = false }
}
async function advanceBattle() {
  if (busy.value || playing.value || pendingQuit.value || !canContinue.value) return
  void battleAudio.unlock()
  // Preserve the original IDs after a lost response so retries cannot skip a trainer.
  const command = pendingAdvance.value ?? (survival.value
    ? survivalAdvanceCommand(run.value, latest.value.matchId, nextLeadMemberId.value, createCommandId())
    : { matchId: latest.value.matchId, runId: run.value.id })
  pendingAdvance.value = command
  const { token, signal } = beginRequest()
  try {
    const response = await simulationRequest('advance', { method: 'POST', body: command, signal })
    if (!isCurrent(token)) return
    if (!response.view?.complete) throw new Error('The next battle is not ready. Sync or retry to recover your challenge.')
    battleView.value?.clear()
    await acceptResponse(response, token)
    if (isCurrent(token)) showBattle()
  } catch (cause) { if (isCurrent(token)) error.value = cause.message }
  finally { if (isCurrent(token)) busy.value = false }
}
async function cancelPendingStart() {
  if (busy.value || !pendingStart.value || latest.value) return
  const { token, signal } = beginRequest()
  try {
    const battle = await simulationRequest('match', { signal }).catch(cause => { if (cause.code === 'NO_MATCH') return null; throw cause })
    if (!isCurrent(token)) return
    if (battle) { await acceptResponse(battle, token, false); return }
    const owner = await simulationRequest('owner', { signal })
    if (!isCurrent(token)) return
    if (owner.pendingStart && owner.pendingStart.operationId !== pendingStart.value.operationId) throw new Error('Another tab changed the pending run. Reconnect to review it.')
    const response = await simulationRequest('owner', { method: 'DELETE', body: { revision: owner.revision }, signal })
    if (!isCurrent(token)) return
    if (!response.cleared) throw new Error('The server could not clear your pending run. Reconnect to check it.')
    pendingStart.value = null; saveSurvivalStart(globalThis.sessionStorage, null)
  } catch (cause) { if (isCurrent(token)) error.value = cause.message }
  finally { if (isCurrent(token)) busy.value = false }
}
async function sendChoice(action, retry = false) {
  if (busy.value || playing.value || pendingQuit.value || (!retry && locked.value)) return
  void battleAudio.unlock()
  const command = retry ? pendingChoice.value : {
    commandId: createCommandId(), matchId: latest.value.matchId, decisionId: decision.value.id, action, afterCursor: latest.value.cursor,
  }
  if (!command) return
  pendingChoice.value = command
  const { token, signal } = beginRequest()
  try { await acceptResponse(await simulationRequest('choice', { method: 'POST', body: command, signal }), token) }
  catch (cause) { if (isCurrent(token)) error.value = cause.message }
  finally { if (isCurrent(token)) busy.value = false }
}
async function syncBattle() {
  if (busy.value) return
  battleView.value?.skip()
  const { token, signal } = beginRequest()
  playing.value = false
  // Full snapshots recover even if another tab replaced the browser's match.
  try { await acceptResponse(await simulationRequest('match', { signal }), token, false) }
  catch (cause) {
    if (!isCurrent(token)) return
    error.value = cause.message
    if (cause.code === 'NO_MATCH' || cause.code === 'PROJECTION_UNAVAILABLE' && !survival.value) {
      clearBattleState()
    }
  } finally { if (isCurrent(token)) busy.value = false }
}
async function forfeit() {
  if (locked.value) return
  const { token, signal } = beginRequest()
  try { await acceptResponse(await simulationRequest('forfeit', { method: 'POST', body: { matchId: latest.value.matchId, afterCursor: latest.value.cursor }, signal }), token) }
  catch (cause) { if (isCurrent(token)) error.value = cause.message }
  finally { if (isCurrent(token)) busy.value = false }
}
function clearBattleState() {
  // Invalidate presentation before removing its actors. Late imports, impact
  // cues and result timers cannot repopulate a battle that has been cleared.
  battleView.value?.clear()
  battleAudio.setMusicContext({ kind: 'menu' })
  latest.value = null; displayed.value = null; run.value = null; log.value = []
  pendingChoice.value = null; pendingAdvance.value = null; pendingQuit.value = null; pendingStart.value = null
  saveSurvivalStart(globalThis.sessionStorage, null)
  confirmingForfeit.value = false; playing.value = false
  message.value = setupMessage()
}
async function quitBattle() {
  if (busy.value || !latest.value) return
  // Keep the original identity after an uncertain response. Retrying must not
  // delete a different match created or advanced in another browser tab.
  const command = pendingQuit.value ?? { matchId: latest.value.matchId, ...(survival.value ? { runId: run.value.id, revision: run.value.revision } : {}) }
  pendingQuit.value = command
  const { token, signal } = beginRequest()
  void battleView.value?.sync(latest.value, { run: run.value })
  displayed.value = latest.value
  playing.value = false
  try {
    let response
    try { response = await simulationRequest('match', { method: 'DELETE', body: command, signal }) }
    catch (cause) {
      // An expired session or a previously successful DELETE is already clear.
      if (cause.code !== 'NO_MATCH') throw cause
      response = { cleared: true }
    }
    if (response?.cleared !== true) throw new Error('The server did not confirm that the battle was cleared. Retry quit or sync the battle.')
    if (!isCurrent(token)) return
    clearBattleState()
    await nextTick()
    if (!isCurrent(token)) return
    setupTitle.value?.focus({ preventScroll: true })
    setupTitle.value?.scrollIntoView({ behavior: reducedMotion.value ? 'instant' : 'smooth', block: 'start' })
  } catch (cause) { if (isCurrent(token)) error.value = cause.message }
  finally { if (isCurrent(token)) busy.value = false }
}

onMounted(() => {
  try {
    const saved = readTeamDraft(globalThis.localStorage)
    if (saved) { customTeam.value = saved; teamMode.value = 'custom' }
    if (survivalPage) holdStart(readSurvivalStart(globalThis.sessionStorage))
  } catch {}
  reducedMotion.value = matchMedia('(prefers-reduced-motion: reduce)').matches
  void initialize()
})
onBeforeUnmount(() => {
  battleAudio.dispose()
  disposed = true; generation++; controller?.abort(); catalogController?.abort()
})
</script>

<template>
  <div class="sim-shell">
    <a class="sim-skip-link" href="#simulation">Saltar al combate</a>
    <header class="sim-header">
      <a class="sim-brand" href="/"><span class="ball-mark" aria-hidden="true"></span>Battle Lab<span class="sim-brand-dot">.</span></a>
      <nav class="sim-nav" aria-label="Navegación principal"><a href="/">Inicio</a><a href="/multiplayer">Batallas privadas</a><a href="/simulation" aria-current="page">Simulación</a><a href="/preview">Vista de movimientos</a><a href="/playground">Laboratorio FX</a></nav>
    </header>
    <main id="simulation">
      <div class="sim-heading">
        <div><p class="sim-eyebrow">{{ survival ? 'SEIS POKÉMON. ¿HASTA DÓNDE PUEDES LLEGAR?' : 'PLANEA TU PRÓXIMO MOVIMIENTO' }}</p><h1>Simulación de batalla<span>.</span></h1><p class="sim-intro">{{ survival ? 'Nuevos rivales. Recupérate tras cada victoria. Mantén a tu equipo en combate.' : 'Mecánicas de Generación 3. Cuatro miembros del Alto Mando. Un Campeón.' }}</p></div>
        <div class="sim-format"><span class="sim-dot"></span> {{ survival ? 'DESAFÍO INFINITO EN SOLITARIO' : 'DESAFÍO DE LIGA REGIONAL' }} <small>Nivel 100 · Individual · Oponentes automáticos</small></div>
      </div>
      <nav v-if="!latest" class="sim-mode-links" aria-label="Modo de simulación">
        <a href="/simulation" :aria-current="!survival ? 'page' : undefined"><strong>Liga Regional</strong><span>Cuatro miembros del Alto Mando. Un Campeón. Recuperación total entre combates.</span></a>
        <a href="/survival" :aria-current="survival ? 'page' : undefined"><strong>Supervivencia</strong><span>Rivales aleatorios infinitos. Los supervivientes recuperan 25% PS; compañeros debilitados reviven con 50% tras cada victoria.</span></a>
      </nav>

      <div v-if="error" class="sim-error" role="alert">
        <p>{{ error }}</p><div class="sim-error-actions">
          <button v-if="latest" :disabled="busy" @click="syncBattle">Sincronizar combate</button>
          <button v-if="pendingQuit" :disabled="busy" @click="quitBattle">Reintentar salir</button>
          <button v-if="pendingChoice && !pendingQuit" :disabled="busy" @click="sendChoice(null, true)">Reintentar acción</button>
          <button v-if="pendingAdvance && !pendingQuit" :disabled="busy || playing" @click="advanceBattle">Reintentar siguiente combate</button>
          <button v-if="pendingStart && !latest" :disabled="busy" @click="startBattle">Reintentar iniciar partida</button>
          <button v-if="!latest" :disabled="busy" @click="initialize">Reconectar</button>
        </div>
      </div>
      <div v-if="!config && busy" class="sim-loading" role="status">Conectando al servidor de combate…</div>
      <div v-if="pendingStart && !latest && !busy" class="sim-survival-notice" role="status">Tu solicitud de inicio está esperando confirmación. Reconéctate para recuperar la partida o reintenta la misma solicitud. La elección de tu equipo se mantiene hasta que se confirme.<div><button @click="startBattle">Reintentar iniciar partida</button><button @click="cancelPendingStart">Cancelar inicio pendiente</button></div></div>
      <p v-if="run?.interruption" class="sim-error" role="alert">{{ run.interruption.message }} Tus rondas completadas están guardadas. Sincroniza o reintenta la acción interrumpida.</p>

      <section v-if="config && !latest" class="sim-setup" aria-labelledby="setup-title">
        <div class="sim-setup-heading"><div><p class="sim-eyebrow">{{ survival ? 'CREA UN EQUIPO RESISTENTE' : 'TU CAMINO A CAMPEÓN' }}</p><h2 id="setup-title" ref="setupTitle" tabindex="-1">{{ survival ? 'Prepara tu equipo de Supervivencia.' : 'Elige tu desafío de liga.' }}</h2></div><span class="sim-soft-badge">Nivel 100 · {{ survival ? 'Sin ronda final' : 'Cinco combates' }}</span></div>
        <section v-if="survival" class="sim-survival-rules" aria-label="Reglas de Supervivencia">
          <div><strong>25% de recuperación</strong><span>Cada victoria restaura el 25% de los PS máx. a los supervivientes, hasta el máximo.</span></div><div><strong>Revivir al 50% de PS</strong><span>Los compañeros debilitados vuelven con la mitad de sus PS máx. tras ganar. No están disponibles durante el combate actual.</span></div><div><strong>Nuevo comienzo entre rondas</strong><span>Los problemas de estado y cambios de características se eliminan. Los PP y objetos originales se restauran.</span></div><div><strong>Rivales aleatorios</strong><span>Enfréntate a un nuevo equipo de seis de entre las 386 especies de Gen 1–3.</span></div>
          <p>Tu equipo permanece fijo. Elige cualquier compañero como tu próximo líder, incluso uno revivido. Una derrota, empate o rendición termina la partida sin recuperación. Este es un desafío casual con oponentes de diversa fuerza.</p>
          <p class="sim-survival-retention">Partida temporal: reconéctate en este navegador en menos de {{ survivalInactivityMinutes }} minutos de inactividad. Un reinicio del servidor borra el progreso. No hay guardado permanente.</p>
        </section>
        <template v-else-if="availableLeagues.length">
          <div class="sim-league-heading"><p class="sim-eyebrow">01 / ELIGE UNA REGIÓN</p><span>La elección de tu equipo es independiente de la región.</span></div>
          <div class="sim-regions" role="group" aria-label="Liga regional">
            <button v-for="league in availableLeagues" :key="league.id" class="sim-region" :class="{ selected: selectedLeague?.id === league.id }" :aria-pressed="selectedLeague?.id === league.id" :disabled="busy" @click="regionId = league.id">
              <span class="sim-region-top"><strong>{{ league.name }}</strong><span aria-hidden="true">{{ selectedLeague?.id === league.id ? '●' : '○' }}</span></span>
              <span class="sim-region-edition">{{ league.edition }}</span>
              <span class="sim-region-trainers">{{ league.trainers.map(trainer => trainer.name).join(' → ') }}</span>
              <span class="sim-region-note">{{ league.description }}</span>
            </button>
          </div>
          <p class="sim-league-rules">Todos los Pokémon combaten en Nivel 100 con mecánicas de Gen 3. Tu equipo original se restaura por completo antes de cada entrenador: PS, PP, estados y objetos equipados se restablecen.</p>
        </template>
        <div class="sim-lead-heading"><p class="sim-eyebrow">{{ !survival && availableLeagues.length ? '02' : '01' }} / ELIGE TUS 6 POKÉMON</p><span>{{ survival ? 'Elige tus 6 Pokémon entre los 151 de Kanto para tu partida de Supervivencia.' : 'Elige tus 6 Pokémon entre los 151 de Kanto para desafiar la Liga.' }}</span></div>

        <!-- Selector con los 151 Pokémon de Kanto y selección directa de los 6 para luchar -->
        <KantoRosterSelector
          :team="customTeam"
          :lead-index="leadIndex"
          :disabled="preparationLocked"
          @update:team="customTeam = $event; draftSaved = false"
          @update:lead-index="leadIndex = $event"
        />

        <details class="sim-advanced-editor">
          <summary style="cursor:pointer; color:#a9b99f; font-size:12px; margin: 15px 0 10px;">Opciones avanzadas (ajustar movimientos y estadísticas manualmente)...</summary>
          <div class="sim-custom-team">
            <p v-if="catalogLoading" class="sim-builder-note" role="status">Cargando el catálogo de equipos de Kanto…</p>
            <div v-else-if="catalogError" class="sim-error" role="alert"><p>{{ catalogError }}</p><div class="sim-error-actions"><button @click="loadTeamCatalog">Reintentar catálogo de equipos</button></div></div>
            <template v-if="teamCatalog">
              <RandomTeamBuilder :team="customTeam" :catalog="teamCatalog" :presets="availablePresets" :disabled="preparationLocked" :generate-team="generateTeam" :reset-key="`${teamMode}:${leadIndex}`" @update:team="customTeam = $event; draftSaved = false" @busy-change="generatingTeam = $event"/>
              <div class="sim-team-validation">
                <div class="sim-team-validation-actions"><button :disabled="preparationLocked || generatingTeam" @click="validateCustomTeam">{{ busy || generatingTeam ? 'Espera, por favor…' : 'Comprobar equipo' }}</button><span>{{ draftSaved ? 'Borrador guardado en este navegador.' : 'El borrador está disponible para esta visita.' }}</span></div>
                <p class="sim-builder-note">Seis Pokémon distintos, nivel 100, con uno a cuatro movimientos cada uno. El servidor verifica las combinaciones de movimientos y restricciones de evento antes de iniciar un combate.</p>
                <p v-if="teamValidation?.valid" class="sim-team-valid" role="status">Tu equipo pasó la validación de Gen 3.</p>
                <details v-if="teamValidation?.changes.length" class="sim-team-adjustments"><summary>Ajustes de la validación</summary><ul><li v-for="(change, index) in teamValidation.changes" :key="index">Ranura {{ change.setIndex + 1 }} · {{ change.field }}: {{ change.before }} → {{ change.after ?? 'eliminado' }}</li></ul></details>
                <div v-if="teamErrors.length" class="sim-team-errors" role="alert"><strong>Revisa tu equipo</strong><ul><li v-for="(issue, index) in teamErrors" :key="index"><span v-if="Number.isInteger(issue.setIndex)">Ranura {{ issue.setIndex + 1 }}: </span>{{ issue.message }}</li></ul></div>
                <p v-else-if="customIssues.length" class="sim-builder-note">{{ customIssues[0].message }}</p>
              </div>
            </template>
          </div>
        </details>

        <div v-if="lead?.species" class="sim-team-summary">
          <div><h3>{{ lead.species }} <span>Nv. {{ lead.level }} · Líder inicial</span></h3><p>{{ pretty(lead.ability) }} <span aria-hidden="true">·</span> {{ pretty(lead.item) || 'Sin objeto' }}</p><div class="sim-lead-moves"><span v-for="move in lead.moves.filter(Boolean)" :key="move">{{ moveInfo(move).name || pretty(move) }}</span></div></div>
          <button class="sim-primary" :disabled="busy || generatingTeam || customChosenCount < 6" @click="startBattle">{{ busy || generatingTeam ? 'Espera, por favor…' : pendingStart ? 'Reintentar iniciar partida' : survival ? 'Iniciar Supervivencia' : selectedLeague ? `Desafiar a la Liga de ${selectedLeague.name}` : 'Iniciar combate' }} <span aria-hidden="true">↗</span></button>
        </div>
        <p class="sim-setup-note">{{ survival ? 'Rondas superadas cuenta las victorias logradas. Llegar a la ronda 8 significa siete rondas ganadas. No hay clasificación pública.' : 'Equipos de entrenadores inspirados en los cartuchos originales, adaptados a Nivel 100 y mecánicas de Gen 3. Juega contra un oponente automático con un equipo predefinido o creado por ti.' }}</p>
      </section>

      <section v-if="latest && run && !survival" class="sim-league-progress" aria-labelledby="league-title">
        <div class="sim-league-progress-heading"><div><p class="sim-eyebrow">{{ run.edition }} · NIVEL 100</p><h2 id="league-title">Liga de {{ run.regionName }}</h2></div><span>{{ run.wins }} / {{ run.totalStages }} derrotados</span></div>
        <ol class="sim-trainer-path" aria-label="Progreso de la liga">
          <li v-for="(trainer, index) in run.trainers" :key="trainer.id" :class="`sim-trainer-${trainerState(index)}`" :aria-current="trainerState(index) === 'current' ? 'step' : undefined">
            <span class="sim-trainer-number" aria-hidden="true">{{ trainerState(index) === 'cleared' ? '✓' : String(index + 1).padStart(2, '0') }}</span>
            <div><span class="sim-trainer-title">{{ trainer.title === 'Elite Four' ? 'Alto Mando' : trainer.title === 'Champion' ? 'Campeón' : trainer.title === 'Gym Leader' ? 'Líder de Gimnasio' : trainer.title }}</span><strong>{{ trainer.name }}</strong><span class="sim-trainer-specialty">{{ trainer.specialty }}</span><span class="sim-trainer-state">{{ trainerStateLabel(index) }}</span></div>
          </li>
        </ol>
        <p class="sim-league-progress-note">{{ run.status === 'active' ? `En combate contra ${run.opponent.name} (${run.opponent.title === 'Elite Four' ? 'Alto Mando' : run.opponent.title === 'Champion' ? 'Campeón' : run.opponent.title}).` : run.status === 'won' ? '¡Liga completada!' : run.status === 'lost' ? 'Un nuevo desafío comienza con el primer entrenador.' : `Siguiente oponente: ${run.nextOpponent?.name}.` }} Tu equipo se restaura por completo entre combates.</p>
      </section>

      <section v-if="latest && survival" class="sim-survival-progress" aria-labelledby="survival-title">
        <div class="sim-league-progress-heading"><div><p class="sim-eyebrow">TUS SEIS ORIGINALES · NIVEL 100</p><h2 id="survival-title">Ronda {{ run.roundNumber }}</h2></div><div class="sim-survival-score"><strong>{{ playing ? Math.max(0, run.roundNumber - 1) : run.wins }} rondas superadas</strong><span>{{ runRoster.filter(member => !member.eliminated).length }} listos para combatir</span></div></div>
        <ol class="sim-survivors" aria-label="Equipo de Supervivencia">
          <li v-for="member in runRoster" :key="member.id" :class="{ 'sim-survivor-out': member.eliminated }">
            <img :src="spriteUrl(member.species)" alt="" width="68" height="68"><strong>{{ member.species }}</strong><span>{{ member.eliminated ? 'Debilitado' : `${member.hp} / ${member.maxHp} PS` }}</span><meter v-if="!member.eliminated" :value="member.hp" min="0" :max="member.maxHp" :aria-label="`Salud de ${member.species}`"></meter><small v-else>{{ run.status === 'ended' ? 'Partida terminada' : 'Revive tras ganar' }}</small>
          </li>
        </ol>
        <p class="sim-league-progress-note">{{ run.status === 'active' || playing ? 'Gana esta ronda para recuperar el 25% de los PS máx. de los supervivientes y revivir a los debilitados con el 50% de PS máx.' : canContinue ? 'Los PS recuperados y revividos se muestran aquí. El campo de batalla inferior conserva el resultado final.' : 'Tu equipo final. Inicia una nueva partida para restaurar tu equipo.' }}</p>
      </section>

      <div v-if="latest" class="sim-layout">
        <section ref="arena" class="sim-arena" aria-label="Batalla y controles">
          <div class="sim-arena-bar"><span class="sim-round">TURNO {{ displayed?.turn || 1 }}</span><span>{{ displayed?.result ? 'COMBATE COMPLETADO' : `QUEDAN ${remaining} DE ${displayed?.own.team.length ?? 6} COMPAÑEROS` }}</span><button :disabled="busy || playing" @click="syncBattle" title="Recargar el estado actual del combate">Sincronizar combate ↻</button></div>
          <BattleView ref="battleView" :audio="battleAudio" :player-label="selectedTeamLabel" @display="displayed = $event" @playback="playing = $event" @message="message = $event"/>

          <section v-if="latest.result && !playing" class="sim-result" :class="{ 'sim-result-champion': run?.status === 'won' }" aria-labelledby="result-title">
            <p class="sim-eyebrow">{{ resultEyebrow }}</p><h2 id="result-title">{{ resultTitle }}</h2><p>{{ resultDetail }}</p>
            <template v-if="survival && canContinue">
              <ul class="sim-recovery-list" aria-label="Recuperación de ronda"><li v-for="recovery in run.recovery" :key="recovery.id"><strong>{{ run.roster.find(member => member.id === recovery.id)?.species }}</strong><span>{{ recovery.eliminated ? 'Debilitado' : recovery.revived ? `Revivido · ${recovery.before} → ${recovery.after} PS` : `${recovery.before} → ${recovery.after} PS (+${recovery.healed})` }}</span></li></ul>
              <fieldset class="sim-next-lead" :disabled="busy || !!pendingAdvance || !!pendingQuit || run.status === 'starting-next'"><legend>Elige tu próximo Pokémon inicial</legend><div><label v-for="member in run.roster" :key="member.id" :class="{ selected: nextLeadMemberId === member.id, eliminated: member.eliminated }"><input v-model="nextLeadMemberId" type="radio" name="next-survival-lead" :value="member.id" :disabled="member.eliminated"><img :src="spriteUrl(member.species)" alt="" width="54" height="54"><strong>{{ member.species }}</strong><span>{{ member.eliminated ? 'Debilitado' : `${member.hp} / ${member.maxHp} PS` }}</span></label></div></fieldset>
            </template>
            <div class="sim-result-actions">
              <button v-if="canContinue" class="sim-primary" :disabled="busy || !!pendingQuit || (survival && !nextLeadMemberId)" @click="advanceBattle">{{ busy && !pendingQuit ? 'Preparando siguiente combate…' : pendingAdvance ? 'Reintentar siguiente combate' : survival ? `Continuar a la ronda ${run.roundNumber + 1}` : `Enfrentar a ${run.nextOpponent?.name}` }} <span aria-hidden="true">↗</span></button>
              <button :class="canContinue ? 'sim-result-restart' : 'sim-primary'" :disabled="busy" @click="quitBattle">{{ busy && pendingQuit ? 'Saliendo…' : survival ? 'Elegir nueva partida' : run ? 'Elegir nuevo desafío' : 'Elegir nuevo equipo' }} <span v-if="!canContinue" aria-hidden="true">↗</span></button>
            </div>
          </section>
          <div v-else class="sim-decisions">
            <div class="sim-decision-heading"><h2>{{ decisionPrompt }}</h2><span v-if="!locked && decision?.kind === 'move'">Elige una acción</span></div>
            <div v-if="decision?.kind !== 'switch'" class="sim-move-grid">
              <button v-for="move in decision?.moves" :key="move.slot" class="sim-move" :class="`sim-type-${moveInfo(move).type?.toLowerCase()}`" :disabled="locked || decision?.kind !== 'move' || move.disabled" :title="moveInfo(move).shortDesc || move.name" @click="sendChoice({ kind: 'move', slot: move.slot })">
                <div><span class="sim-move-type">{{ translateType(moveInfo(move).type) || 'Movimiento' }}</span><span>{{ move.pp === null ? '—' : move.pp }} / {{ move.maxpp === null ? '—' : move.maxpp }} PP</span></div><strong>{{ moveInfo(move).name || move.name }}</strong><small v-if="move.disabled">No disponible este turno</small>
              </button>
            </div>
            <div class="sim-party-heading"><h3>{{ decision?.kind === 'switch' ? 'Enviar un compañero' : 'O cambiar de Pokémon' }}</h3><span v-if="!decision?.canSwitch && decision?.kind === 'move'">Cambio no disponible este turno</span></div>
            <div class="sim-party">
              <button v-for="member in displayed?.own.team" :key="member.memberId" :class="{ active: member.active, fainted: member.fainted }" :disabled="locked || !switchIds.has(member.memberId)" :aria-label="`${member.species}, ${member.fainted ? 'debilitado' : member.active ? 'activo' : `${member.hp?.current} de ${member.hp?.max} PS`}${member.condition ? `, ${member.condition}` : ''}`" @click="sendChoice({ kind: 'switch', memberId: member.memberId })">
                <img :src="spriteUrl(member.species)" alt="" width="62" height="62"><strong>{{ member.species }}</strong><span>{{ member.fainted ? 'Debilitado' : member.active ? 'En el campo' : `${member.hp?.current ?? '—'} / ${member.hp?.max ?? '—'}` }}</span><small v-if="member.condition">{{ translateCondition(member.condition)?.toUpperCase() }}</small>
              </button>
            </div>
            <div class="sim-battle-actions">
              <span>{{ survival ? `Salir borra esta partida. Reconéctate en menos de ${survivalInactivityMinutes} minutos de inactividad; un reinicio del servidor borra el progreso.` : 'Salir borra este combate y el progreso de la liga. Salir de la página lo conserva durante 30 minutos.' }}</span>
              <template v-if="confirmingForfeit"><span>{{ survival ? '¿Terminar esta partida de Supervivencia?' : '¿Terminar este combate?' }}</span><button :disabled="locked" @click="forfeit">Sí, rendirse</button><button @click="confirmingForfeit = false">Cancelar</button></template>
              <button v-else :disabled="locked" @click="confirmingForfeit = true">{{ survival ? 'Rendirse en la partida' : 'Rendirse' }}</button>
              <button class="sim-quit-battle" :disabled="busy" @click="quitBattle">{{ busy && pendingQuit ? 'Saliendo…' : survival ? 'Salir de la partida' : 'Salir del combate' }}</button>
            </div>
          </div>
        </section>
        <aside class="sim-log-panel" aria-labelledby="log-title"><div class="sim-log-heading"><div><p class="sim-eyebrow">HISTORIAL DEL COMBATE</p><h2 id="log-title">Registro de combate</h2></div><span class="sim-dot" aria-hidden="true"></span></div><ol ref="logHost" class="sim-log" aria-label="Historial de combate"><li v-for="entry in log" :key="entry.cursor" :class="{ 'sim-log-turn': /^Turn \d/.test(entry.text) }">{{ translateBattleText(entry.text) }}</li><li v-if="!log.length">Tu batalla comienza aquí.</li></ol><div class="sim-log-note">Tus PS son exactos. Los PS del oponente usan la barra pública de combate. Solo los detalles revelados del oponente aparecen aquí.</div></aside>
      </div>
    </main>
    <footer class="sim-footer"><span>Battle Lab · Generación 3</span><p>Simulación de batalla · {{ survival ? 'Supervivencia' : 'Liga Regional' }} · Reconexión en el mismo navegador</p><a href="/">Volver al inicio ↗</a></footer>
  </div>
</template>
