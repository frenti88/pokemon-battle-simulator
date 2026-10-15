<script setup>
import { computed, ref, watch } from 'vue'
import { spriteUrl } from '../battle/scene.js'
import { translateType } from '../battle/i18n.js'
import { KANTO_POKEMON_LIST, getKantoStarterSet } from './kantoStarterSets.js'
import { createTeamDraft, toTeamPayload } from './teamDraft.js'

const props = defineProps({
  team: { type: Array, default: () => [] },
  leadIndex: { type: Number, default: 0 },
  disabled: Boolean,
})

const emit = defineEmits(['update:team', 'update:leadIndex', 'change'])

const activeSlot = ref(0)
const searchQuery = ref('')
const selectedType = ref('all')

// Ensure team has 6 slots
const slots = computed(() => {
  const current = createTeamDraft(props.team)
  return current
})

const chosenCount = computed(() => slots.value.filter(m => m.species).length)

// Type options for filtering
const TYPE_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'grass', label: 'Planta' },
  { id: 'fire', label: 'Fuego' },
  { id: 'water', label: 'Agua' },
  { id: 'electric', label: 'Eléctrico' },
  { id: 'psychic', label: 'Psíquico' },
  { id: 'ice', label: 'Hielo' },
  { id: 'dragon', label: 'Dragón' },
  { id: 'ghost', label: 'Fantasma' },
  { id: 'fighting', label: 'Lucha' },
  { id: 'poison', label: 'Veneno' },
  { id: 'ground', label: 'Tierra' },
  { id: 'rock', label: 'Roca' },
  { id: 'bug', label: 'Bicho' },
  { id: 'normal', label: 'Normal' },
]

const normalize = val => String(val ?? '').toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]/g, '')

const filteredPokemon = computed(() => {
  const query = normalize(searchQuery.value)
  const type = selectedType.value
  return KANTO_POKEMON_LIST.filter(p => {
    if (type !== 'all' && !p.types.includes(type)) return false
    if (!query) return true
    const text = normalize(`${p.name} ${p.id} ${String(p.num).padStart(3, '0')} ${p.types.join(' ')}`)
    return text.includes(query)
  })
})

function getTeamSlotForSpecies(speciesName) {
  if (!speciesName) return -1
  const norm = normalize(speciesName)
  return slots.value.findIndex(s => s.species && normalize(s.species) === norm)
}

function selectSlot(index) {
  if (props.disabled) return
  activeSlot.value = index
}

function setLead(index) {
  if (props.disabled) return
  if (!slots.value[index]?.species) return
  emit('update:leadIndex', index)
  emit('change', { team: slots.value, leadIndex: index })
}

function clearSlot(index) {
  if (props.disabled) return
  const next = createTeamDraft(slots.value)
  next[index] = createTeamDraft()[0] // empty slot
  activeSlot.value = index
  emit('update:team', next)
  // Ensure valid leadIndex
  const firstOccupied = next.findIndex(m => m.species)
  if (props.leadIndex === index && firstOccupied !== -1) {
    emit('update:leadIndex', firstOccupied)
  }
  emit('change', { team: next, leadIndex: props.leadIndex })
}

function onPokemonClick(pokemon) {
  if (props.disabled) return
  const existingSlot = getTeamSlotForSpecies(pokemon.name)
  if (existingSlot !== -1) {
    // If already in team, clicking it clears it from team
    clearSlot(existingSlot)
    return
  }

  const starterSet = getKantoStarterSet(pokemon.id)
  if (!starterSet) return

  const next = createTeamDraft(slots.value)
  let targetIndex = activeSlot.value

  // If the active slot is already occupied by a different Pokemon,
  // check if there is an empty slot available first
  if (next[targetIndex]?.species) {
    const firstEmpty = next.findIndex(m => !m.species)
    if (firstEmpty !== -1) {
      targetIndex = firstEmpty
    }
  }

  next[targetIndex] = starterSet
  // Advance activeSlot to next slot or next empty slot
  const nextEmpty = next.findIndex((m, i) => i > targetIndex && !m.species)
  if (nextEmpty !== -1) {
    activeSlot.value = nextEmpty
  } else {
    activeSlot.value = (targetIndex + 1) % 6
  }

  emit('update:team', next)
  // If no lead set yet or lead was on empty slot, set lead to targetIndex
  if (!next[props.leadIndex]?.species) {
    emit('update:leadIndex', targetIndex)
  }
  emit('change', { team: next, leadIndex: props.leadIndex })
}

function randomizeTeam() {
  if (props.disabled) return
  const shuffled = [...KANTO_POKEMON_LIST].sort(() => Math.random() - 0.5)
  const picked = shuffled.slice(0, 6)
  const next = picked.map(p => getKantoStarterSet(p.id))
  activeSlot.value = 0
  emit('update:team', next)
  emit('update:leadIndex', 0)
  emit('change', { team: next, leadIndex: 0 })
}

function setClassicStarters() {
  if (props.disabled) return
  const classicIds = ['charizard', 'blastoise', 'venusaur', 'raichu', 'alakazam', 'machamp']
  const next = classicIds.map(id => getKantoStarterSet(id))
  activeSlot.value = 0
  emit('update:team', next)
  emit('update:leadIndex', 0)
  emit('change', { team: next, leadIndex: 0 })
}

function clearAll() {
  if (props.disabled) return
  const next = createTeamDraft([])
  activeSlot.value = 0
  emit('update:team', next)
  emit('update:leadIndex', 0)
  emit('change', { team: next, leadIndex: 0 })
}
</script>

<template>
  <div class="kanto-roster-selector" :class="{ 'is-disabled': disabled }">
    <!-- Header with count and quick actions -->
    <div class="krs-header">
      <div>
        <p class="krs-eyebrow">TUS 6 POKÉMON PARA COMBATIR</p>
        <h3 class="krs-title">Elige tus 6 Pokémon de Kanto</h3>
        <p class="krs-subtitle">
          Haz clic en cualquier Pokémon de la lista para añadirlo a tu equipo con sus movimientos listos para luchar.
        </p>
      </div>
      <div class="krs-counter-badge" :class="{ 'is-complete': chosenCount === 6 }">
        <span class="krs-counter-number">{{ chosenCount }} / 6</span>
        <span class="krs-counter-label">{{ chosenCount === 6 ? '¡Equipo completo!' : 'Pokémon elegidos' }}</span>
      </div>
    </div>

    <!-- 6 Team Slots Grid -->
    <div class="krs-team-slots" role="group" aria-label="Ranuras de tu equipo Pokémon">
      <div
        v-for="(member, index) in slots"
        :key="index"
        class="krs-slot"
        :class="{
          'is-active': activeSlot === index,
          'is-lead': leadIndex === index && member.species,
          'is-empty': !member.species,
        }"
        @click="selectSlot(index)"
      >
        <div class="krs-slot-top">
          <span class="krs-slot-num">0{{ index + 1 }}</span>
          <span v-if="leadIndex === index && member.species" class="krs-lead-badge">★ Líder</span>
          <button
            v-if="member.species"
            type="button"
            class="krs-remove-btn"
            title="Quitar de equipo"
            :disabled="disabled"
            @click.stop="clearSlot(index)"
          >
            ✕
          </button>
        </div>

        <div class="krs-slot-sprite-wrap">
          <img
            v-if="member.species && spriteUrl(member.species)"
            :src="spriteUrl(member.species)"
            :alt="member.species"
            width="64"
            height="64"
            class="krs-slot-sprite"
            loading="lazy"
          >
          <span v-else class="krs-slot-placeholder">+</span>
        </div>

        <strong class="krs-slot-name">{{ member.species || 'Elegir Pokémon' }}</strong>

        <div v-if="member.species" class="krs-slot-details">
          <button
            type="button"
            class="krs-set-lead-btn"
            :class="{ 'is-active-lead': leadIndex === index }"
            :disabled="disabled"
            @click.stop="setLead(index)"
          >
            {{ leadIndex === index ? '✓ Líder inicial' : 'Hacer líder' }}
          </button>
        </div>
        <span v-else class="krs-slot-hint">Ranura disponible</span>
      </div>
    </div>

    <!-- Quick Team Action Buttons -->
    <div class="krs-quick-actions">
      <button type="button" class="krs-action-btn" :disabled="disabled" @click="randomizeTeam">
        🎲 6 Aleatorios de Kanto
      </button>
      <button type="button" class="krs-action-btn" :disabled="disabled" @click="setClassicStarters">
        ★ Equipo Clásico (Kanto)
      </button>
      <button type="button" class="krs-action-btn krs-btn-clear" :disabled="disabled || chosenCount === 0" @click="clearAll">
        Vaciar equipo
      </button>
    </div>

    <!-- 151 Kanto Pokemon Catalog Header & Search Controls -->
    <div class="krs-catalog-section">
      <div class="krs-catalog-header">
        <div>
          <h4>Catálogo de los 151 Pokémon de Kanto</h4>
          <span class="krs-catalog-help">
            Mostrando {{ filteredPokemon.length }} de 151 Pokémon (#001 Bulbasaur a #151 Mew)
          </span>
        </div>
        <div class="krs-search-box">
          <input
            v-model="searchQuery"
            type="search"
            placeholder="Buscar por nombre o #número (#001–#151)..."
            autocomplete="off"
            :disabled="disabled"
          >
        </div>
      </div>

      <!-- Type Filter Pills -->
      <div class="krs-type-filters">
        <button
          v-for="filter in TYPE_FILTERS"
          :key="filter.id"
          type="button"
          class="krs-type-pill"
          :class="{ 'is-selected': selectedType === filter.id, [`type-${filter.id}`]: true }"
          :disabled="disabled"
          @click="selectedType = filter.id"
        >
          {{ filter.label }}
        </button>
      </div>

      <!-- The 151 Pokemon Grid -->
      <div class="krs-pokemon-grid" role="grid" aria-label="Lista de 151 Pokémon de Kanto">
        <button
          v-for="pokemon in filteredPokemon"
          :key="pokemon.id"
          type="button"
          class="krs-poke-card"
          :class="{
            'is-in-team': getTeamSlotForSpecies(pokemon.name) !== -1,
            'is-team-lead': getTeamSlotForSpecies(pokemon.name) === leadIndex,
          }"
          :disabled="disabled"
          @click="onPokemonClick(pokemon)"
        >
          <div class="krs-poke-top">
            <span class="krs-poke-num">#{{ String(pokemon.num).padStart(3, '0') }}</span>
            <span
              v-if="getTeamSlotForSpecies(pokemon.name) !== -1"
              class="krs-poke-team-tag"
            >
              {{ getTeamSlotForSpecies(pokemon.name) === leadIndex ? '★ Líder' : `✓ R${getTeamSlotForSpecies(pokemon.name) + 1}` }}
            </span>
          </div>

          <div class="krs-poke-sprite-wrap">
            <img
              :src="spriteUrl(pokemon.id)"
              :alt="pokemon.name"
              width="56"
              height="56"
              class="krs-poke-sprite"
              loading="lazy"
            >
          </div>

          <strong class="krs-poke-name">{{ pokemon.name }}</strong>

          <div class="krs-poke-types">
            <span
              v-for="type in pokemon.types"
              :key="type"
              class="krs-type-tag"
              :class="`type-${type}`"
            >
              {{ translateType(type) }}
            </span>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.kanto-roster-selector {
  margin: 15px 0 25px;
  padding: 24px;
  background: #14231b;
  border: 1px solid #3c5240;
  border-radius: 14px;
  color: #e3ebd7;
}

.krs-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.krs-eyebrow {
  margin: 0 0 6px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.6px;
  color: #bad38f;
}

.krs-title {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 600;
  color: #f0f6e8;
}

.krs-subtitle {
  margin: 0;
  font-size: 13px;
  color: #a4b69d;
  line-height: 1.5;
  max-width: 580px;
}

.krs-counter-badge {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  padding: 10px 16px;
  border: 1px solid #4a6148;
  border-radius: 8px;
  background: #1b2f23;
}

.krs-counter-badge.is-complete {
  border-color: #9ecc6a;
  background: #274428;
}

.krs-counter-number {
  font-size: 22px;
  font-weight: 700;
  color: #e5f2cf;
  font-variant-numeric: tabular-nums;
}

.krs-counter-label {
  font-size: 11px;
  color: #a6bba0;
}

.krs-counter-badge.is-complete .krs-counter-label {
  color: #c9e89d;
  font-weight: 600;
}

/* 6 Team Slots Grid */
.krs-team-slots {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.krs-slot {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 8px 14px;
  background: #1a2a21;
  border: 2px solid #364d39;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
  min-height: 150px;
}

.krs-slot:hover {
  background: #233729;
  border-color: #638558;
}

.krs-slot.is-active {
  border-color: #bed792;
  background: #263c29;
  box-shadow: 0 0 12px #bed79233;
}

.krs-slot.is-lead {
  border-color: #e8b975;
}

.krs-slot.is-empty {
  border-style: dashed;
  background: #15221b;
}

.krs-slot-top {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.krs-slot-num {
  font-size: 10px;
  color: #7b9474;
  font-weight: 700;
}

.krs-lead-badge {
  font-size: 10px;
  background: #e8b975;
  color: #272111;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 700;
}

.krs-remove-btn {
  border: 0;
  background: #41221f;
  color: #f1b3b3;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 11px;
  cursor: pointer;
  line-height: 1;
}

.krs-remove-btn:hover {
  background: #a83232;
  color: #fff;
}

.krs-slot-sprite-wrap {
  width: 64px;
  height: 64px;
  display: grid;
  place-items: center;
  margin: 4px 0;
}

.krs-slot-sprite {
  image-rendering: pixelated;
  object-fit: contain;
}

.krs-slot-placeholder {
  font-size: 28px;
  color: #4b6348;
}

.krs-slot-name {
  font-size: 13px;
  color: #eef5e7;
  text-align: center;
  margin-bottom: 8px;
  overflow-wrap: anywhere;
}

.krs-slot-hint {
  font-size: 11px;
  color: #6d826a;
}

.krs-set-lead-btn {
  border: 1px solid #58734f;
  border-radius: 4px;
  background: #18281d;
  color: #bed792;
  font-size: 10px;
  padding: 4px 7px;
  cursor: pointer;
  white-space: nowrap;
}

.krs-set-lead-btn:hover {
  background: #2e472a;
}

.krs-set-lead-btn.is-active-lead {
  background: #e8b975;
  color: #251e10;
  border-color: #e8b975;
  font-weight: 700;
}

/* Quick actions */
.krs-quick-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}

.krs-action-btn {
  padding: 9px 15px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 6px;
  border: 1px solid #4a6341;
  background: #1d3023;
  color: #d8e6c4;
  cursor: pointer;
  transition: all 0.15s ease;
}

.krs-action-btn:hover:not(:disabled) {
  background: #2b4530;
  border-color: #8dae6b;
}

.krs-btn-clear {
  color: #e09f87;
  border-color: #633f38;
  background: #2d1e1c;
}

.krs-btn-clear:hover:not(:disabled) {
  background: #472621;
}

/* Catalog section */
.krs-catalog-section {
  border-top: 1px solid #2a3c2c;
  padding-top: 20px;
}

.krs-catalog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.krs-catalog-header h4 {
  margin: 0 0 4px;
  font-size: 16px;
  color: #edf5e2;
}

.krs-catalog-help {
  font-size: 12px;
  color: #92a78c;
}

.krs-search-box input {
  box-sizing: border-box;
  width: 280px;
  padding: 10px 14px;
  font-size: 13px;
  border-radius: 7px;
  border: 1px solid #486144;
  background: #101c15;
  color: #eef6e4;
}

.krs-search-box input:focus-visible {
  outline: 2px solid #bed792;
}

/* Type filters */
.krs-type-filters {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 12px;
  margin-bottom: 16px;
  scrollbar-width: thin;
  scrollbar-color: #4b6348 #14231b;
}

.krs-type-pill {
  padding: 5px 11px;
  font-size: 11px;
  border-radius: 5px;
  border: 1px solid #364a34;
  background: #18281f;
  color: #bccbb2;
  cursor: pointer;
  white-space: nowrap;
}

.krs-type-pill:hover {
  background: #263b27;
}

.krs-type-pill.is-selected {
  background: #bed792;
  color: #1a2a16;
  border-color: #bed792;
  font-weight: 700;
}

/* Pokemon 151 Grid */
.krs-pokemon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(105px, 1fr));
  gap: 10px;
  max-height: 480px;
  overflow-y: auto;
  padding: 12px;
  border: 1px solid #334937;
  border-radius: 10px;
  background: #101c15;
  scrollbar-width: thin;
  scrollbar-color: #4b6348 #101c15;
}

.krs-poke-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 6px 10px;
  border: 1px solid #2e432f;
  border-radius: 8px;
  background: #18271e;
  color: inherit;
  cursor: pointer;
  transition: all 0.12s ease;
  text-align: center;
}

.krs-poke-card:hover:not(:disabled) {
  transform: translateY(-2px);
  background: #243928;
  border-color: #799a61;
}

.krs-poke-card.is-in-team {
  border-color: #bed792;
  background: #233c24;
  box-shadow: 0 0 8px #bed79244;
}

.krs-poke-card.is-team-lead {
  border-color: #e8b975;
}

.krs-poke-top {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 9px;
  margin-bottom: 2px;
}

.krs-poke-num {
  color: #748c6f;
  font-weight: 700;
}

.krs-poke-team-tag {
  font-size: 8px;
  background: #bed792;
  color: #172813;
  padding: 1px 4px;
  border-radius: 3px;
  font-weight: 700;
}

.krs-poke-sprite-wrap {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
}

.krs-poke-sprite {
  image-rendering: pixelated;
  object-fit: contain;
}

.krs-poke-name {
  font-size: 11px;
  font-weight: 600;
  color: #ebf3e3;
  margin: 3px 0 5px;
  line-height: 1.2;
}

.krs-poke-types {
  display: flex;
  gap: 3px;
  flex-wrap: wrap;
  justify-content: center;
}

.krs-type-tag {
  font-size: 8px;
  padding: 1px 4px;
  border-radius: 3px;
  background: #283e28;
  color: #d1dfc5;
}

/* Type colors */
.type-fire { background: #5a2517; color: #f5a98d; }
.type-water { background: #193855; color: #9bc8f3; }
.type-grass { background: #254d1d; color: #a5e297; }
.type-electric { background: #554a17; color: #f5de86; }
.type-ice { background: #174850; color: #9ee6ed; }
.type-fighting { background: #4d1c17; color: #ea9a93; }
.type-poison { background: #451b47; color: #df97e2; }
.type-ground { background: #4e391b; color: #e5be8b; }
.type-flying { background: #2e3059; color: #b7b9f3; }
.type-psychic { background: #521835; color: #f095c2; }
.type-bug { background: #374719; color: #c4dc8c; }
.type-rock { background: #484126; color: #dcd09c; }
.type-ghost { background: #2f2549; color: #b7a9db; }
.type-dragon { background: #351e59; color: #bda2f0; }
.type-normal { background: #3a3f37; color: #cfd6cc; }

@media (max-width: 900px) {
  .krs-team-slots {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 600px) {
  .kanto-roster-selector {
    padding: 16px;
  }
  .krs-team-slots {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .krs-search-box input {
    width: 100%;
  }
}
</style>
