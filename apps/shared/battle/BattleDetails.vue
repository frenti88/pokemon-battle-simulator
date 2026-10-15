<script setup>
import { computed } from 'vue'
const props = defineProps({ member: Object, opponent: Boolean })
const STAT_ABBR = { atk: 'ATQ', def: 'DEF', spa: 'AT. ESP', spd: 'DEF. ESP', spe: 'VEL', eva: 'EVA', acc: 'PREC' }
const stages = computed(() => Object.entries(props.member?.stages ?? {}).filter(([, value]) => value !== 0).map(([name, value]) => `${STAT_ABBR[name.toLowerCase()] || name.toUpperCase()} ${value > 0 ? '+' : ''}${value}`))
const volatileLabels = computed(() => (props.member?.volatiles ?? []).map(value => value.replace(/^move: /, '')))
</script>

<template>
  <section :aria-label="opponent ? 'Detalles de combate del oponente' : 'Tus detalles de combate'">
    <div v-if="stages.length || volatileLabels.length" class="sim-stage-badges"><span v-for="stage in stages" :key="stage">{{ stage }}</span><span v-for="label in volatileLabels" :key="label">{{ label }}</span></div>
    <details v-if="member" class="sim-known-details"><summary>{{ opponent ? 'Oponente · detalles revelados' : 'Tu Pokémon · habilidad y objeto' }}</summary><p>Habilidad: {{ member.ability || (opponent ? 'No revelada' : 'Ninguna') }}<br>Objeto: {{ member.item || (opponent ? 'Ninguno conocido' : 'Ninguno') }}</p><p v-if="opponent && member.moves?.length">Movimientos: {{ member.moves.join(', ') }}</p></details>
  </section>
</template>
