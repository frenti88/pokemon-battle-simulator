<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import BattleView from '../../shared/battle/BattleView.vue'
import { createBattleAudio, BATTLE_AUDIO_MIX, BATTLE_IMPACT_VOLUME } from '../../shared/battle/audio.js'
import { createExperienceAudio } from '../../shared/music/audio.js'
import { activeMembers, spriteUrl, buildBattleLog } from '../../shared/battle/index.js'
import { multiplayerRequest, createOperationId } from './api.js'
import { createRoomSession } from './roomSession.js'
import RandomTeamBuilder from '../../shared/teams/RandomTeamBuilder.vue'
import KantoRosterSelector from '../../shared/teams/KantoRosterSelector.vue'
import { getKantoStarterSet } from '../../shared/teams/kantoStarterSets.js'
import { createTeamDraft, toTeamPayload, readTeamDraft, saveTeamDraft } from '../../shared/teams/teamDraft.js'
import { translateBattleText, translateType, translateCondition } from '../../shared/battle/i18n.js'

const config = shallowRef(null), guest = shallowRef(null), state = shallowRef({ envelope: null, playing: false, pending: null })
const battleAudio = createExperienceAudio({ createBattle: options => createBattleAudio({ ...options, categoryVolumes: BATTLE_AUDIO_MIX, impactVolume: BATTLE_IMPACT_VOLUME }) })
const battle = ref(null), displayed = shallowRef(null), log = ref([]), logHost = ref(null)
const name = ref(''), invitation = ref(''), busy = ref(false), connecting = ref(true), error = ref(''), notice = ref('')
const pendingOperation = shallowRef(null), networkOkay = ref(true), confirming = ref(false), now = ref(Date.now())
const pollInFlight = ref(false), unavailable = ref(false)
const teamCatalog = shallowRef(null), editorOpen = ref(false), draft = ref(createTeamDraft()), draftLead = ref(0), generating = ref(false)
const selectionIssues = ref([]), selectionChanges = ref([])
const draftSelectionRevision = ref(0)
const initialKantoTeam = ['charizard', 'blastoise', 'venusaur', 'raichu', 'alakazam', 'machamp'].map(id => getKantoStarterSet(id))
let savedDraft
try { savedDraft = readTeamDraft(localStorage) } catch {}
const lobbyTeam = ref(savedDraft ?? createTeamDraft(initialKantoTeam))
const lobbyLead = ref(0)
const chosenLobbyCount = computed(() => lobbyTeam.value.filter(m => m.species).length)
let lifetime = 0, disposed = false, pollTimer, clockTimer, pollController, commandController, failures = 0, serverOffset = 0, lastServerNow = -1, syncRequested = false
const room = computed(() => state.value.envelope?.room)
const latest = computed(() => state.value.envelope?.view)
const active = computed(() => room.value?.status === 'active')
const terminal = computed(() => ['ended', 'interrupted', 'closed', 'expired'].includes(room.value?.status))
const availablePresets = computed(() => (config.value?.presets ?? []).filter(preset => preset.id === 'kanto'))
const selected = computed(() => room.value?.own.team ? { id: null, name: 'Tu equipo personalizado', team: room.value.own.team }
  : availablePresets.value.find(p => p.id === room.value?.own.presetId) ?? availablePresets.value[0])
const lead = computed(() => lobbyTeam.value?.[lobbyLead.value] ?? selected.value?.team?.[room.value?.own.leadIndex ?? 0])
const decision = computed(() => latest.value?.decision)
const locked = computed(() => busy.value || !!pendingOperation.value || state.value.playing || !active.value || !networkOkay.value)
const members = computed(() => activeMembers(displayed.value ?? latest.value))
const switches = computed(() => new Set(decision.value?.switches?.map(m => m.memberId) ?? []))
const inviteUrl = computed(() => room.value?.inviteToken ? `${location.origin}/multiplayer#join=${room.value.inviteToken}` : '')
const countdown = computed(() => {
  const deadline = state.value.envelope?.deadlineAt
  if (!deadline || !active.value) return ''
  const remaining = Math.max(0, Math.ceil((deadline - now.value) / 1000))
  return `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`
})
const moveInfo = move => config.value?.moves?.[String(move.id ?? move).toLowerCase().replace(/[^a-z0-9]/g, '')] ?? {}
const resultTitle = computed(() => room.value?.status === 'interrupted' ? 'Batalla interrumpida.'
  : latest.value?.result?.kind === 'win' ? latest.value.result.winnerSeat === latest.value.seat ? '¡Ganaste la batalla!' : '¡Tu oponente ganó!'
    : latest.value?.result?.kind === 'draw' ? 'La batalla terminó en empate.' : 'Sin resultado.')
const prompt = computed(() => !networkOkay.value ? 'Reconectando a la sala…'
  : state.value.playing ? 'Reproduciendo el turno…'
    : pendingOperation.value ? 'Confirmando tu acción…'
      : decision.value?.kind === 'wait' ? 'Esperando a tu rival…'
        : decision.value?.kind === 'switch' ? 'Elige un compañero para enviar al combate.' : `¿Qué hará ${members.value[0]?.species || 'tu Pokémon'}?`)

function remember(id) { try { if (id) sessionStorage.setItem('battle-room-v1', id); else sessionStorage.removeItem('battle-room-v1') } catch {} }
const session = createRoomSession({
  onChange(value) {
    state.value = value
    if (value.envelope?.room?.status !== 'lobby' || value.envelope?.room?.own.ready) {
      if (editorOpen.value && value.envelope?.room?.status === 'lobby') notice.value = 'Tu selección se marcó como lista en otra pestaña. Las ediciones no se aplicaron a la sala.'
      editorOpen.value = false; generating.value = false
    }
    if (!value.envelope?.room) { selectionIssues.value = []; selectionChanges.value = [] }
    if (!value.pending) pendingOperation.value = null
    // Keep match music on results/reconnects until the player leaves the field.
    if (!value.envelope?.view) battleAudio.setMusicContext({ kind: 'menu' })
  },
  clear() { battle.value?.clear(); displayed.value = null; log.value = [] },
  async present(batch, { isCurrent }) {
    await nextTick(); if (!isCurrent()) return
    battleAudio.setMusicContext({ kind: 'private', matchId: batch.after.matchId })
    await battle.value?.present({ ...batch, playerLabel: room.value?.own.name || 'Your team', opponentName: room.value?.opponent?.name || 'Opponent', opponentTitle: 'Guest trainer' })
  },
  async sync(view, { isCurrent }) {
    battle.value?.clear()
    battleAudio.setMusicContext(view ? { kind: 'private', matchId: view.matchId } : { kind: 'menu' })
    await nextTick(); if (!isCurrent()) return
    await battle.value?.sync(view)
    if (isCurrent()) displayed.value = view
  },
  onEvents(events, before, after) {
    const seen = new Set(log.value.map(entry => entry.cursor))
    log.value = [...log.value, ...buildBattleLog(events, before, after).filter(entry => !seen.has(entry.cursor))].slice(-150)
    nextTick(() => { if (logHost.value) logHost.value.scrollTop = logHost.value.scrollHeight })
  },
  onError(cause) { error.value = cause.message },
})

function accept(response, { enter = false, synchronize = false } = {}) {
  if (response?.expired) {
    if (!room.value || response.roomId === room.value.id) { session.reset(); remember(null) }
    notice.value = 'Esa sala ha expirado. Crea una nueva invitación para volver a jugar.'
    return
  }
  if (response?.left) {
    if (response.roomId === room.value?.id) { session.reset(); remember(null) }
    pendingOperation.value = null; confirming.value = false
    return
  }
  if (!response?.room) return
  const accepted = enter ? session.enter(response, { synchronize }) : session.ingest(response, { synchronize })
  if (!accepted) return
  if (enter) lastServerNow = -1
  if (Number.isFinite(response.serverNow) && response.serverNow >= lastServerNow) {
    lastServerNow = response.serverNow; serverOffset = response.serverNow - Date.now(); now.value = Date.now() + serverOffset
  }
  remember(response.room.id)
  if (response.ack?.accepted === false) error.value = `Esa acción fue rechazada (${response.ack.code}). La sala muestra las opciones actuales.`
}
function inviteToken(value) {
  const text = value.trim()
  if (/^[a-f0-9]{32,128}$/.test(text)) return text
  try { return new URLSearchParams(new URL(text, location.origin).hash.slice(1)).get('join') || '' } catch { return '' }
}
function schedule(delay) {
  clearTimeout(pollTimer)
  if (disposed || !room.value || terminal.value || unavailable.value) return
  pollTimer = setTimeout(() => void poll(), delay ?? (document.hidden ? 10000 : active.value ? 1500 : 2000))
}
async function poll(synchronize = false) {
  if (synchronize) syncRequested = true
  if (disposed || !room.value || pollInFlight.value || unavailable.value) return
  synchronize = syncRequested; syncRequested = false
  clearTimeout(pollTimer)
  const token = lifetime, id = room.value.id, before = session.snapshot()
  pollInFlight.value = true
  const request = new AbortController(); pollController = request
  const query = new URLSearchParams({ afterRevision: String(before.revision), afterCursor: String(before.cursor) })
  if (before.envelope?.matchId) query.set('matchId', before.envelope.matchId)
  if (synchronize) query.set('sync', '1')
  try {
    const response = await multiplayerRequest(`rooms/${encodeURIComponent(id)}/updates?${query}`, { signal: request.signal })
    if (disposed || lifetime !== token || room.value?.id !== id) return
    networkOkay.value = true; failures = 0
    accept(response, { synchronize })
  } catch (cause) {
    if (disposed || lifetime !== token || room.value?.id !== id) return
    networkOkay.value = false; failures++
    if (['GUEST_EXPIRED', 'UNAUTHORIZED', 'NO_GUEST', 'ROOM_NOT_FOUND', 'ROOM_EXPIRED', 'NOT_A_MEMBER'].includes(cause.code) || [401,403,404,410].includes(cause.status)) {
      unavailable.value = true
      error.value = `${cause.message} Return to the lobby to create or join a new room.`
      clearTimeout(pollTimer)
      return
    }
    error.value = cause.message
  } finally {
    if (pollController === request) {
      pollInFlight.value = false; pollController = null
      if (!disposed && lifetime === token && room.value?.id === id) schedule(syncRequested ? 0 : failures ? Math.min(15000, 1500 * 2 ** Math.min(failures, 3)) + Math.random() * 500 : undefined)
    }
  }
}
async function initialize() {
  if (busy.value) return
  const token = ++lifetime
  pollController?.abort(); pollController = null; pollInFlight.value = false; commandController?.abort(); clearTimeout(pollTimer)
  connecting.value = true; error.value = ''; networkOkay.value = true; unavailable.value = false; syncRequested = false
  const request = new AbortController(); commandController = request
  try {
    const settings = await multiplayerRequest('config', { signal: request.signal })
    const identity = await multiplayerRequest('guest', { method: 'POST', body: {}, signal: request.signal })
    const recovered = await multiplayerRequest('session', { signal: request.signal })
    if (disposed || lifetime !== token) return
    config.value = settings; guest.value = identity.guest; name.value = identity.guest.name || ''
    if (recovered.room) accept(recovered.room, { enter: true, synchronize: true })
    else {
      let previous
      try { previous = sessionStorage.getItem('battle-room-v1') } catch {}
      if (previous) {
        try {
          const response = await multiplayerRequest(`rooms/${encodeURIComponent(previous)}/updates?sync=1`, { signal: request.signal })
          if (!disposed && lifetime === token) accept(response, { enter: true, synchronize: true })
        } catch (cause) {
          if (disposed || lifetime !== token) return
          if ([401,403,404,410].includes(cause.status)) { session.reset(); remember(null) } else throw cause
        }
      } else session.reset()
    }
  } catch (cause) { if (!disposed && lifetime === token) { error.value = cause.message; networkOkay.value = false } }
  finally { if (!disposed && lifetime === token) { connecting.value = false; schedule(0) } }
}
async function execute(operation, payload = {}, retry = false) {
  if (busy.value || disposed || !retry && pendingOperation.value) return
  if (['ready', 'choice'].includes(operation)) {
    void battleAudio.unlock()
    battleAudio.preload((selected.value?.team ?? []).map(member => member.species))
  }
  const id = room.value?.id
  const request = retry ? pendingOperation.value : {
    path: operation === 'create' ? 'rooms' : operation === 'join' ? 'rooms/join' : `rooms/${encodeURIComponent(id)}/${operation}`,
    operation, body: { ...payload, operationId: createOperationId(), ...(id ? { afterCursor: state.value.cursor, afterRevision: state.value.revision } : {}) },
  }
  if (!request) return
  if (operation === 'choice' && !retry) request.body.commandId = request.body.operationId
  pendingOperation.value = request
  session.setPending(request.body)
  busy.value = true; error.value = ''; notice.value = ''
  commandController = new AbortController()
  const token = lifetime
  try {
    if (!retry && ['create', 'join'].includes(operation)) {
      const identity = await multiplayerRequest('guest', { method: 'POST', body: name.value.trim() ? { name: name.value.trim() } : {}, signal: commandController.signal })
      if (disposed || lifetime !== token) return
      guest.value = identity.guest
    }
    const response = await multiplayerRequest(request.path, { method: 'POST', body: request.body, signal: commandController.signal })
    if (disposed || lifetime !== token) return
    networkOkay.value = true; failures = 0
    accept(response, { enter: ['create', 'join'].includes(request.operation) })
    const acknowledgedId = response.ack?.operationId ?? response.ack?.commandId
    if (acknowledgedId === request.body.operationId) session.clearPending()
    if (request.operation === 'join') { invitation.value = ''; history.replaceState(null, '', location.pathname) }
    if (request.operation === 'selection' && response.ack?.accepted) {
      editorOpen.value = false
      selectionIssues.value = []
      selectionChanges.value = response.ack.selectionChanges?.filter(change => change.kind !== 'added' && change.field !== 'hpType') ?? []
      if (request.body.team) notice.value = 'Tu equipo ha sido seleccionado. Revísalo y presiona Listo para combatir.'
    }
    confirming.value = false
    return response
  } catch (cause) {
    if (disposed || lifetime !== token) return
    error.value = cause.message
    selectionIssues.value = cause.details?.errors ?? []
    if (cause.status >= 400 && cause.status < 500 && cause.status !== 408 && cause.status !== 429) session.clearPending()
    if (['ROOM_STARTED', 'SELECTION_CHANGED', 'MEMBERSHIP_CHANGED'].includes(cause.code)) void poll(true)
  } finally { if (!disposed && lifetime === token) { busy.value = false; schedule(0) } }
}
function createRoom() { return execute('create') }
function joinRoom() {
  const token = inviteToken(invitation.value)
  if (!token) { error.value = 'Pega un enlace de invitación completo o el token de la sala.'; return }
  return execute('join', { inviteToken: token })
}
function selectTeam(presetId, leadIndex = 0) {
  if (editorOpen.value || generating.value) return
  const choice = presetId ? { presetId } : { team: selected.value.team }
  return execute('selection', { ...choice, leadIndex, selectionRevision: room.value.own.selectionRevision })
}
watch(() => room.value?.own.team, serverTeam => {
  if (serverTeam && serverTeam.length === 6) {
    lobbyTeam.value = createTeamDraft(serverTeam)
  }
})
watch(() => room.value?.own.leadIndex, newLead => {
  if (Number.isInteger(newLead)) {
    lobbyLead.value = newLead
  }
})
watch(() => room.value?.status, async status => {
  if (status === 'lobby' && room.value?.own) {
    if (!room.value.own.team && chosenLobbyCount.value === 6 && !busy.value && !pendingOperation.value) {
      await execute('selection', {
        team: toTeamPayload(lobbyTeam.value),
        leadIndex: lobbyLead.value,
        selectionRevision: room.value.own.selectionRevision
      })
    }
  }
})
function onLobbyTeamChange({ team, leadIndex }) {
  lobbyTeam.value = team
  lobbyLead.value = leadIndex
  try { saveTeamDraft(localStorage, team) } catch {}
  const count = team.filter(m => m.species).length
  if (room.value?.status === 'lobby' && count === 6 && !busy.value && !pendingOperation.value && networkOkay.value) {
    if (room.value.own.ready) {
      void execute('ready', { ready: false, selectionRevision: room.value.own.selectionRevision, membershipEpoch: room.value.membershipEpoch })
    }
    void execute('selection', { team: toTeamPayload(team), leadIndex, selectionRevision: room.value.own.selectionRevision })
  }
}
function onLobbyLeadChange(newLead) {
  lobbyLead.value = newLead
  if (room.value?.status === 'lobby' && chosenLobbyCount.value === 6 && !busy.value && !pendingOperation.value && networkOkay.value) {
    void execute('selection', { team: toTeamPayload(lobbyTeam.value), leadIndex: newLead, selectionRevision: room.value.own.selectionRevision })
  }
}
function ready() {
  if (editorOpen.value || generating.value) return
  return execute('ready', { ready: !room.value.own.ready, selectionRevision: room.value.own.selectionRevision, membershipEpoch: room.value.membershipEpoch })
}
async function openBuilder() {
  if (busy.value || pendingOperation.value || !networkOkay.value || room.value?.status !== 'lobby') return
  const id = room.value.id
  if (room.value.own.ready) {
    const response = await execute('ready', { ready: false, selectionRevision: room.value.own.selectionRevision, membershipEpoch: room.value.membershipEpoch })
    if (!response?.ack?.accepted || room.value?.id !== id || room.value.status !== 'lobby' || room.value.own.ready) return
  }
  busy.value = true; error.value = ''
  const token = lifetime
  try {
    teamCatalog.value ??= await multiplayerRequest('team-builder')
    if (disposed || lifetime !== token || room.value?.id !== id || room.value.status !== 'lobby' || room.value.own.ready) return
    let saved
    try { saved = readTeamDraft(localStorage) } catch {}
    draft.value = createTeamDraft(room.value.own.team ?? saved ?? selected.value.team)
    draftLead.value = room.value.own.leadIndex
    draftSelectionRevision.value = room.value.own.selectionRevision
    selectionIssues.value = []; selectionChanges.value = []; editorOpen.value = true
  } catch (cause) { if (!disposed && lifetime === token) error.value = cause.message }
  finally { if (!disposed && lifetime === token) busy.value = false }
}
function updateDraft(team) {
  draft.value = team; selectionIssues.value = []; selectionChanges.value = []
  try { saveTeamDraft(localStorage, team) } catch {}
}
function useDraft() {
  if (!editorOpen.value || generating.value || room.value?.status !== 'lobby' || room.value.own.ready) return
  return execute('selection', { team: toTeamPayload(draft.value), leadIndex: draftLead.value, selectionRevision: draftSelectionRevision.value })
}
function generateTeam(body, { signal }) { return multiplayerRequest('team/random', { method: 'POST', body, signal }) }
function choose(action) { return execute('choice', { matchId: latest.value.matchId, decisionId: decision.value.id, action }) }
function forfeit() { return execute('forfeit', { matchId: latest.value.matchId }) }
function leave() { return execute('leave') }
function forget() {
  lifetime++; pollController?.abort(); pollController = null; pollInFlight.value = false; commandController?.abort(); clearTimeout(pollTimer)
  session.reset(); remember(null); busy.value = false; error.value = ''; networkOkay.value = true
  void initialize()
}
async function copyInvite() {
  try { await navigator.clipboard.writeText(inviteUrl.value); notice.value = 'Invitación copiada. Envíala a tu oponente.' }
  catch { notice.value = 'Selecciona y copia el enlace de invitación de arriba.' }
}
function visible() { if (!document.hidden && room.value) void poll(true); else schedule() }
onMounted(() => {
  invitation.value = new URLSearchParams(location.hash.slice(1)).get('join') || ''
  document.addEventListener('visibilitychange', visible)
  clockTimer = setInterval(() => { now.value = Date.now() + serverOffset }, 1000)
  void initialize()
})
onBeforeUnmount(() => {
  battleAudio.dispose()
  disposed = true; lifetime++; clearTimeout(pollTimer); clearInterval(clockTimer)
  pollController?.abort(); commandController?.abort(); document.removeEventListener('visibilitychange', visible); session.dispose()
})
</script>

<template>
  <div class="sim-shell mp-shell">
    <a class="sim-skip-link" href="#multiplayer">Saltar al multijugador</a>
    <header class="sim-header">
      <a class="sim-brand" href="/"><span class="ball-mark" aria-hidden="true"></span>Battle Lab<span class="sim-brand-dot">.</span></a>
      <nav class="sim-nav" aria-label="Navegación principal"><a href="/">Inicio</a><a href="/multiplayer" aria-current="page">Multijugador</a><a href="/simulation">Simulación</a><a href="/preview">Vista de movimientos</a><a href="/playground">Laboratorio FX</a></nav>
    </header>
    <main id="multiplayer">
      <div class="sim-heading"><div><p class="sim-eyebrow">UN AMIGO. UN EQUIPO. UN DESAFÍO.</p><h1>Batalla privada<span>.</span></h1><p class="sim-intro">Elige tu equipo. Invita a un amigo. Haz que cada turno cuente.</p></div><div class="sim-format"><span class="sim-dot"></span> GENERACIÓN 3 INDIVIDUAL <small>Dos jugadores · Crea tu equipo · Nivel 100</small></div></div>
      <div v-if="error" class="sim-error" role="alert"><p>{{ error }}</p><div class="sim-error-actions"><button v-if="pendingOperation" :disabled="busy" @click="execute(pendingOperation.operation, {}, true)">Reintentar última acción</button><button v-if="room" :disabled="busy || pollInFlight" @click="poll(true)">Sincronizar sala</button><button v-if="!room" :disabled="busy" @click="initialize">Reconectar</button><button v-if="room && !networkOkay" :disabled="busy" @click="forget">Volver al lobby</button></div></div>
      <p v-if="notice" class="mp-notice" role="status">{{ notice }}</p>
      <div v-if="connecting" class="sim-loading" role="status">Conectando al multijugador…</div>
      <section v-if="config && !room && !connecting" class="sim-setup mp-welcome" aria-labelledby="room-title">
        <p class="sim-eyebrow">TU PRÓXIMO RIVAL ESTÁ A UN ENLACE DE DISTANCIA</p><h2 id="room-title">Trae a un amigo al campo de batalla.</h2>
        <p class="mp-muted">Juega una batalla privada 6 contra 6 con los 151 Pokémon de Kanto. Elige tus 6 Pokémon para luchar, crea una sala y comparte la invitación con tu rival.</p>
        <label class="mp-name">Nombre de entrenador <span>Opcional · 24 caracteres</span><input v-model="name" maxlength="24" autocomplete="nickname" placeholder="Entrenador invitado" :disabled="busy || !!pendingOperation"></label>

        <!-- Selector con los 151 Pokémon de Kanto y selección directa de los 6 para luchar -->
        <KantoRosterSelector
          :team="lobbyTeam"
          :lead-index="lobbyLead"
          :disabled="busy || !!pendingOperation"
          @update:team="lobbyTeam = $event"
          @update:lead-index="onLobbyLeadChange"
          @change="onLobbyTeamChange"
        />

        <div class="mp-entry-grid">
          <section class="mp-entry"><span class="mp-step">01 / CREAR BATALLA</span><h3>Lanza el desafío.</h3><p>Crea una sala con tu equipo seleccionado y envía la invitación a tu oponente.</p><button class="sim-primary" :disabled="busy || !!pendingOperation || chosenLobbyCount < 6" @click="createRoom">Crear sala privada <span aria-hidden="true">↗</span></button></section>
          <form class="mp-entry" @submit.prevent="joinRoom"><span class="mp-step">02 / ACEPTAR INVITACIÓN</span><h3>Enfréntate a tu rival.</h3><label for="invitation">Enlace de invitación</label><input id="invitation" v-model="invitation" type="text" placeholder="Pega tu enlace de invitación" autocomplete="off" :disabled="busy || !!pendingOperation"><button class="mp-secondary" :disabled="busy || !!pendingOperation || !invitation.trim()">Unirse a la sala <span aria-hidden="true">↗</span></button></form>
        </div>
        <p class="sim-setup-note">Las salas de invitados son temporales. Vuelve a conectarte en este navegador mientras la sala esté disponible. Un reinicio del servidor cerrará las salas abiertas.</p>
      </section>
      <template v-if="room">
        <section class="mp-room-strip" aria-label="Estado de la sala"><div><span class="sim-dot" :class="{ 'mp-offline': !networkOkay }"></span><strong>{{ room.own.name || 'Tú' }}</strong><span class="mp-versus">VS</span><strong>{{ room.opponent?.name || 'Esperando a un amigo' }}</strong></div><span>{{ !networkOkay ? 'Reconectando' : room.opponent && room.opponent.connected === false ? 'Oponente reconectando' : room.status === 'lobby' ? 'Lobby privado' : terminal ? 'Batalla completada' : 'Conectado' }}</span><span v-if="countdown" class="mp-clock" aria-label="Tiempo restante para tu acción">Tu turno · {{ countdown }}</span></section>
        <section v-if="room.status === 'lobby'" class="sim-setup" aria-labelledby="lobby-title">
          <div class="sim-setup-heading"><div><p class="sim-eyebrow">PREPÁRATE PARA EL COMBATE</p><h2 id="lobby-title">Elige tus 6 Pokémon de Kanto.</h2></div><button class="mp-text-button" :disabled="busy || !!pendingOperation" @click="leave">Salir de la sala</button></div>
          <div v-if="inviteUrl" class="mp-invite"><label for="room-invite">Invita a tu oponente</label><div><input id="room-invite" :value="inviteUrl" readonly @focus="$event.target.select()"><button class="mp-secondary" @click="copyInvite">Copiar enlace</button></div></div>

          <!-- Selector con los 151 Pokémon de Kanto y selección directa de los 6 para luchar -->
          <KantoRosterSelector
            :team="lobbyTeam"
            :lead-index="lobbyLead"
            :disabled="busy || !!pendingOperation || !networkOkay || room.own.ready"
            @update:team="lobbyTeam = $event"
            @update:lead-index="onLobbyLeadChange"
            @change="onLobbyTeamChange"
          />

          <details class="mp-advanced-editor">
            <summary style="cursor:pointer; color:#a9b99f; font-size:12px; margin: 15px 0 10px;">Opciones avanzadas (ajustar movimientos y estadísticas manualmente)...</summary>
            <section class="mp-team-editor" aria-label="Preparar un equipo personalizado">
              <RandomTeamBuilder :team="lobbyTeam" :catalog="teamCatalog" :presets="availablePresets" :disabled="busy || !!pendingOperation || !networkOkay" :generate-team="generateTeam" :reset-key="`${room.id}:${room.own.selectionRevision}:${lobbyLead}`" @update:team="updateDraft" @busy-change="generating = $event"/>
              <div class="mp-builder-actions"><button class="sim-primary" :disabled="busy || !!pendingOperation || !networkOkay || generating" @click="useDraft">Aplicar ajustes avanzados</button></div>
            </section>
          </details>

          <div v-if="lead" class="sim-team-summary">
            <div>
              <h3>{{ lead.species }} <span>Nv. 100 · Líder inicial</span></h3>
              <p>{{ lead.ability }} · {{ lead.item || 'Sin objeto' }} · {{ lead.nature }}</p>
              <div class="sim-lead-moves"><span v-for="move in lead.moves" :key="move">{{ moveInfo(move).name || move }}</span></div>
            </div>
            <button class="sim-primary" :disabled="busy || !!pendingOperation || !networkOkay || !room.opponent || chosenLobbyCount < 6" @click="ready">
              {{ room.own.ready ? 'Cancelar listo' : 'Listo para combatir' }} <span aria-hidden="true">↗</span>
            </button>
          </div>

          <div class="mp-readiness" role="status">
            <span :class="{ ready: room.own.ready }">{{ room.own.ready ? '✓ Estás listo' : chosenLobbyCount < 6 ? '○ Elige 6 Pokémon para poder combatir' : '○ Pulsa "Listo para combatir"' }}</span>
            <span :class="{ ready: room.opponent?.ready }">{{ !room.opponent ? '○ Esperando a que tu oponente se una' : room.opponent.ready ? '✓ Oponente listo' : '○ Oponente eligiendo equipo' }}</span>
          </div>
          <p class="sim-setup-note">El combate comienza cuando ambos jugadores están listos. Cambiar de equipo o Pokémon inicial cancela tu estado de listo. La sala expira tras 15 minutos sin actividad.</p>
        </section>
        <div v-if="latest" class="sim-layout">
          <section class="sim-arena" aria-label="Batalla privada y controles">
            <BattleView ref="battle" :audio="battleAudio" :player-label="room.own.name" :opponent-name="room.opponent?.name" opponent-title="Guest trainer" :inactive="room.status === 'interrupted'" @display="displayed = $event"/>
            <section v-if="terminal && !state.playing" class="sim-result" aria-labelledby="multiplayer-result"><p class="sim-eyebrow">{{ room.status === 'interrupted' ? 'SE PERDIÓ LA CONEXIÓN CON EL COMBATE' : 'COMBATE COMPLETADO' }}</p><h2 id="multiplayer-result">{{ resultTitle }}</h2><p>{{ room.status === 'interrupted' ? 'El servidor no pudo continuar este combate. No se otorgó ningún ganador.' : latest.result?.reason === 'timeout' ? 'Este combate terminó porque se agotó el tiempo de decisión.' : latest.result?.reason === 'forfeit' ? 'Este combate terminó por rendición.' : `Terminó en el turno ${latest.turn}. ¡Bien jugado!` }}</p><button class="sim-primary" :disabled="busy || !!pendingOperation" @click="leave">Volver a salas privadas ↗</button></section>
            <div v-else class="sim-decisions">
              <div class="sim-decision-heading"><h2>{{ prompt }}</h2><span v-if="countdown">{{ countdown }}</span></div>
              <div v-if="decision?.kind !== 'switch'" class="sim-move-grid"><button v-for="move in decision?.moves" :key="move.slot" class="sim-move" :class="`sim-type-${moveInfo(move).type?.toLowerCase()}`" :disabled="locked || decision.kind !== 'move' || move.disabled" :title="moveInfo(move).shortDesc || move.name" @click="choose({ kind: 'move', slot: move.slot })"><div><span class="sim-move-type">{{ translateType(moveInfo(move).type) || 'Movimiento' }}</span><span>{{ move.pp ?? '—' }} / {{ move.maxpp ?? '—' }} PP</span></div><strong>{{ moveInfo(move).name || move.name }}</strong><small v-if="move.disabled">No disponible este turno</small></button></div>
              <div class="sim-party-heading"><h3>{{ decision?.kind === 'switch' ? 'Enviar un compañero' : 'O cambiar de Pokémon' }}</h3><span v-if="decision?.kind === 'wait'">Tu elección enviada es definitiva.</span></div>
              <div class="sim-party"><button v-for="member in (displayed ?? latest)?.own.team" :key="member.memberId" :class="{ active: member.active, fainted: member.fainted }" :disabled="locked || !switches.has(member.memberId)" @click="choose({ kind: 'switch', memberId: member.memberId })"><img :src="spriteUrl(member.species)" alt="" width="62" height="62"><strong>{{ member.species }}</strong><span>{{ member.fainted ? 'Debilitado' : member.active ? 'En el campo' : `${member.hp?.current} / ${member.hp?.max}` }}</span><small v-if="member.condition">{{ translateCondition(member.condition)?.toUpperCase() }}</small></button></div>
              <div class="sim-battle-actions"><span>Cerrar la página mantiene tu puesto hasta que expire el temporizador.</span><button :disabled="busy" @click="poll(true)">Sincronizar combate</button><template v-if="confirming"><span>¿Rendirse y otorgarle la victoria a tu oponente?</span><button :disabled="busy || !!pendingOperation" @click="forfeit">Sí, rendirse</button><button @click="confirming = false">Cancelar</button></template><button v-else :disabled="busy || !!pendingOperation || !active" @click="confirming = true">Rendirse</button></div>
            </div>
          </section>
          <aside class="sim-log-panel" aria-labelledby="mp-log-title"><div class="sim-log-heading"><div><p class="sim-eyebrow">HISTORIAL DEL COMBATE</p><h2 id="mp-log-title">Registro de combate</h2></div><span class="sim-dot"></span></div><ol ref="logHost" class="sim-log"><li v-for="entry in log" :key="entry.cursor" :class="{ 'sim-log-turn': /^Turn \d/.test(entry.text) }">{{ translateBattleText(entry.text) }}</li><li v-if="!log.length">Tu batalla comienza aquí.</li></ol><div class="sim-log-note">Tus PS son exactos. Los PS del oponente usan la barra pública de combate. Solo los detalles revelados del oponente aparecen aquí.</div></aside>
        </div>
        <section v-else-if="terminal" class="sim-setup"><h2>Esta sala se ha cerrado.</h2><p class="mp-muted">Crea una nueva sala para desafiar a un amigo.</p><button class="sim-primary" @click="forget">Volver a salas privadas ↗</button></section>
      </template>
    </main>
    <footer class="sim-footer"><span>Battle Lab · Generación 3</span><p>Salas privadas · Jugadores invitados · Reconexión en el mismo navegador</p><a href="/">Volver al inicio ↗</a></footer>
  </div>
</template>
